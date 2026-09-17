#!/usr/bin/env node
/**
 * Prova que o mecanismo de RLS do withRls() funciona contra o banco de verdade.
 *
 * Rode ANTES de converter qualquer query para withRls(). Se este script não
 * passar, a conversão inteira é trabalho perdido — e pior, quebraria o app.
 *
 *   node scripts/rls-probe.mjs
 *
 * É read-only: tudo acontece dentro de uma transação revertida no fim. Nenhum
 * dado é alterado e nada pessoal é impresso — só contagens e nomes de papel.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

function carregarEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const texto = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  for (const linha of texto.split('\n')) {
    const corte = linha.indexOf('=')
    if (corte < 0 || linha.trim().startsWith('#')) continue
    if (linha.slice(0, corte).trim() === 'DATABASE_URL') return linha.slice(corte + 1).trim()
  }
  throw new Error('DATABASE_URL não encontrada (nem no ambiente nem no .env)')
}

const sql = postgres(carregarEnv(), { prepare: false })
let falhas = 0

function checar(rotulo, ok, detalhe = '') {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (!ok) falhas++
}

try {
  const [papel] = await sql`
    select current_user as usuario,
           coalesce((select rolbypassrls from pg_roles where rolname = current_user), false) as bypassrls`
  console.log(`\nConexão atual: ${papel.usuario} (bypassrls=${papel.bypassrls})\n`)

  const [membro] = await sql`select user_id, org_id from org_members order by created_at limit 1`
  if (!membro) {
    console.log('Sem linhas em org_members — nada para exercitar. Abortando.')
    process.exit(0)
  }

  const [{ n: totalSemRls }] = await sql`select count(*)::int as n from transactions`

  await sql
    .begin(async (tx) => {
      // Exatamente o que withRls() faz.
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({
        sub: membro.user_id,
        role: 'authenticated',
      })}, true)`

      const [ctx] = await tx`select current_user as usuario, auth.uid()::text as uid`
      checar('assume o papel authenticated', ctx.usuario === 'authenticated', ctx.usuario)
      checar('auth.uid() resolve para o usuário das claims', ctx.uid === membro.user_id)

      const [{ n: comRls }] = await tx`select count(*)::int as n from transactions`
      const [{ n: deOutras }] =
        await tx`select count(*)::int as n from transactions where org_id <> ${membro.org_id}`

      checar('RLS de fato filtra', comRls <= totalSemRls, `${comRls} de ${totalSemRls}`)
      checar('nenhuma linha de outra org aparece', deOutras === 0, `${deOutras} vazando`)

      // Se a policy estiver certa, escrever para outra org tem de ser negado.
      let negou = false
      try {
        await tx`savepoint s1`
        await tx`insert into transactions (org_id, account_id, date, description, amount_cents, type)
                 values (gen_random_uuid(), gen_random_uuid(), current_date, 'probe', 1, 'expense')`
        await tx`rollback to savepoint s1`
      } catch {
        negou = true
        await tx`rollback to savepoint s1`
      }
      checar('escrita em org alheia é negada', negou)

      throw new Error('__rollback__')
    })
    .catch((e) => {
      if (e.message !== '__rollback__') throw e
    })

  console.log('\nTransação revertida — nada foi alterado.')
  console.log(falhas === 0
    ? '\nRESULTADO: mecanismo validado. Pode converter as queries para withRls().\n'
    : `\nRESULTADO: ${falhas} checagem(ns) falhou(aram). NÃO converta ainda.\n`)
  process.exit(falhas === 0 ? 0 : 1)
} finally {
  await sql.end()
}
