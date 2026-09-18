#!/usr/bin/env node
/**
 * Mapa de cobertura do RLS, tabela por tabela.
 *
 * Roda ANTES de converter queries para withRls(). Para cada tabela, compara o
 * que o dono enxerga com o que o RLS deixa passar para um usuário real. Uma
 * tabela que devolve 0 sob RLS mas tem linhas daquela org indica policy
 * incompleta — converter uma query dela quebraria a funcionalidade na hora.
 *
 *   node scripts/rls-coverage.mjs
 *
 * Read-only: tudo dentro de uma transação revertida.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

function url() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  for (const l of txt.split('\n')) {
    const i = l.indexOf('=')
    if (i < 0 || l.trim().startsWith('#')) continue
    if (l.slice(0, i).trim() === 'DATABASE_URL') return l.slice(i + 1).trim()
  }
  throw new Error('DATABASE_URL nao encontrada')
}

const sql = postgres(url(), { prepare: false })

try {
  const [m] = await sql`select user_id, org_id from org_members order by created_at limit 1`
  if (!m) { console.log('Sem org_members. Abortando.'); process.exit(0) }

  const tabelas = await sql`
    select c.relname as tabela,
           exists (
             select 1 from information_schema.columns
             where table_schema='public' and table_name=c.relname and column_name='org_id'
           ) as tem_org_id,
           (select count(*) from pg_policies p
             where p.schemaname='public' and p.tablename=c.relname) as policies
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    order by c.relname`

  const donoCount = {}
  for (const t of tabelas) {
    const q = t.tem_org_id
      ? `select count(*)::int n from public."${t.tabela}" where org_id = $1`
      : `select count(*)::int n from public."${t.tabela}"`
    const r = t.tem_org_id ? await sql.unsafe(q, [m.org_id]) : await sql.unsafe(q)
    donoCount[t.tabela] = r[0].n
  }

  const problemas = []
  await sql.begin(async (tx) => {
    await tx`select set_config('role','authenticated',true)`
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: m.user_id, role: 'authenticated',
    })}, true)`

    console.log('\ntabela                              policies   dono   RLS   situacao')
    console.log('-'.repeat(76))

    for (const t of tabelas) {
      let rls
      try {
        rls = (await tx.unsafe(`select count(*)::int n from public."${t.tabela}"`))[0].n
      } catch (e) {
        rls = `erro: ${e.message.slice(0, 20)}`
      }
      const dono = donoCount[t.tabela]

      let situacao = 'ok'
      if (t.policies === 0) { situacao = 'SEM POLICY'; problemas.push(t.tabela) }
      else if (typeof rls !== 'number') { situacao = 'ERRO'; problemas.push(t.tabela) }
      else if (dono > 0 && rls === 0) { situacao = 'INVISIVEL'; problemas.push(t.tabela) }
      else if (t.tem_org_id && rls !== dono) situacao = `difere (${rls} vs ${dono})`

      console.log(
        t.tabela.padEnd(34) + String(t.policies).padStart(6) +
        String(dono).padStart(8) + String(rls).padStart(6) + '   ' + situacao,
      )
    }
    throw new Error('__rollback__')
  }).catch((e) => { if (e.message !== '__rollback__') throw e })

  console.log('\nTransacao revertida.')
  if (problemas.length) {
    console.log('\nATENCAO — nao converta queries destas tabelas ainda:')
    for (const p of problemas) console.log('  - ' + p)
  } else {
    console.log('\nNenhuma tabela bloqueada. Pode converter.')
  }
} finally {
  await sql.end()
}
