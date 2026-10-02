#!/usr/bin/env -S npx tsx
// scripts/vinculos-suspeitos.mts
/**
 * Só leitura. Lista os vínculos previsão → realizado de recorrência que a
 * regra de hoje (`matchForecast`) NÃO faria: valor fora da tolerância, mais
 * de 7 dias, ou diferença acima de 1% sem nome em comum. Vínculo errado
 * esconde um lançamento de verdade; esta lista é para o dono revisar e
 * desconciliar o que não for o mesmo dinheiro.
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/vinculos-suspeitos.mts
 */
import postgres from 'postgres'
import { matchForecast } from '../packages/core-finance/src/forecast-match'
import { brl, databaseUrl } from './conciliacao-comum.mts'

const sql = postgres(databaseUrl(), { max: 1 })
const linhas = await sql`
  select o.name org, a.name conta, p.date::date pd, p.amount_cents pv, p.description pdesc,
         r.date::date rd, r.amount_cents rv, r.description rdesc
  from transactions p
  join transactions r on r.id = p.matched_transaction_id
  join accounts a on a.id = p.account_id
  join orgs o on o.id = p.org_id
  where p.recurring_template_id is not null
  order by o.name, a.name, p.date`
await sql.end()

const dia = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')
const suspeitos = linhas.filter((l) => !matchForecast(
  { amountCents: l.rv, date: new Date(l.rd), description: l.rdesc },
  [{ id: 'p', amountCents: l.pv, date: new Date(l.pd), description: l.pdesc }],
))
console.log(`${suspeitos.length} de ${linhas.length} vínculos de recorrência que a regra de hoje não faria:\n`)
for (const s of suspeitos) {
  const dias = Math.round(Math.abs(new Date(s.pd).getTime() - new Date(s.rd).getTime()) / 864e5)
  const pct = ((Math.abs(Math.abs(s.pv) - Math.abs(s.rv)) / Math.abs(s.pv)) * 100).toFixed(1)
  console.log(`[${s.org} · ${s.conta}] ${dia(s.pd)} ${s.pdesc} ${brl(s.pv)}`)
  console.log(`    ← ${dia(s.rd)} ${s.rdesc} ${brl(s.rv)}  (${dias} dias, ${pct}%)`)
}
