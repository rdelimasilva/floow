#!/usr/bin/env -S npx tsx
// scripts/acerto-da-sugestao.mts
/**
 * Só leitura. Quanto o palpite da fila acerta (spec 2026-10-06, Entrega 1):
 * entre as decisões do usuário com palpite, a fração que aceitou o palpite.
 * Por origem e pelas 20 contrapartes com mais decisões. Janela em dias no
 * primeiro argumento (padrão 30).
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/acerto-da-sugestao.mts 30
 */
import postgres from 'postgres'
import { databaseUrl } from './conciliacao-comum.mts'

const dias = Number(process.argv[2] ?? 30)
const sql = postgres(databaseUrl(), { max: 1 })

const porOrigem = await sql`
  select o.name org, coalesce(v.sugestao_origem, 'sem palpite') origem,
         count(*)::int decisoes,
         count(*) filter (where v.acao = 'confirmar')::int aceitas
  from validacoes v join orgs o on o.id = v.org_id
  where v.acao in ('confirmar','corrigir') and v.created_at >= now() - make_interval(days => ${dias})
  group by 1, 2 order by 1, 3 desc`

const porContraparte = await sql`
  select c.display_name contraparte, count(*)::int decisoes,
         count(*) filter (where v.acao = 'confirmar')::int aceitas
  from validacoes v join counterparties c on c.id = v.counterparty_id
  where v.acao in ('confirmar','corrigir') and v.sugestao_categoria_id is not null
    and v.created_at >= now() - make_interval(days => ${dias})
  group by 1 order by 2 desc limit 20`

const volume = await sql`
  select acao, count(*)::int n from validacoes
  where created_at >= now() - make_interval(days => ${dias}) group by 1 order by 2 desc`
await sql.end()

const pct = (a: number, n: number) => (n === 0 ? '—' : `${Math.round((100 * a) / n)}%`)
console.log(`\nÚltimos ${dias} dias\n\nVolume por ação`)
for (const v of volume) console.log(`  ${v.acao.padEnd(10)} ${v.n}`)
console.log('\nAcerto por origem do palpite')
for (const r of porOrigem) console.log(`  ${r.org} · ${r.origem.padEnd(12)} ${pct(r.aceitas, r.decisoes)} (${r.aceitas}/${r.decisoes})`)
console.log('\nContrapartes com mais decisões')
for (const r of porContraparte) console.log(`  ${String(r.contraparte).slice(0, 40).padEnd(40)} ${pct(r.aceitas, r.decisoes)} (${r.aceitas}/${r.decisoes})`)
