#!/usr/bin/env -S npx tsx
/**
 * Preenche `card_last_digits` nos lançamentos de cartão gravados antes da
 * migration 00065. Rebusca as transações de cada cartão na Polp e grava só o
 * final, casando por (org, conta, external_id). Não mexe em mais nada, e só
 * preenche o que ainda está NULL — pode rodar de novo.
 *
 *   npx tsx scripts/backfill-final-do-cartao.mts            # só conta
 *   npx tsx scripts/backfill-final-do-cartao.mts --aplicar  # grava
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { createPolpClient } from '../packages/core-finance/src/openfinance/polp-client'
import { normalizeCardTransaction } from '../packages/core-finance/src/openfinance/normalize'

function env(nome: string): string {
  if (process.env[nome]) return process.env[nome]!
  for (const linha of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const i = linha.indexOf('=')
    if (i > 0 && !linha.trim().startsWith('#') && linha.slice(0, i).trim() === nome) return linha.slice(i + 1).trim()
  }
  throw new Error(`${nome} nao encontrada`)
}

const aplicar = process.argv.includes('--aplicar')
const sql = postgres(env('DATABASE_URL'), { prepare: false })
const polp = createPolpClient({ apiClient: env('POLP_API_CLIENT'), apiSecret: env('POLP_API_SECRET') })

const cartoes = await sql<{ org_id: string; account_id: string; polp_resource_id: string; conta: string }[]>`
  select r.org_id, r.account_id, r.polp_resource_id, a.name as conta
  from openfinance_resources r
  join openfinance_connections c on c.id = r.connection_id
  join accounts a on a.id = r.account_id
  where r.resource_type = 'CREDIT_CARD_ACCOUNT' and c.revoked_at is null`

let total = 0
for (const cartao of cartoes) {
  const finais = new Map<string, number>()
  let preenchidos = 0
  try {
    for await (const pagina of polp.streamCardTransactions(cartao.polp_resource_id)) {
      for (const bruto of pagina) {
        const tx = normalizeCardTransaction(bruto)
        if (!tx.cardLastDigits) continue
        finais.set(tx.cardLastDigits, (finais.get(tx.cardLastDigits) ?? 0) + 1)
        if (!aplicar) continue
        const r = await sql`
          update transactions set card_last_digits = ${tx.cardLastDigits}
          where org_id = ${cartao.org_id} and account_id = ${cartao.account_id}
            and external_id = ${tx.externalId} and card_last_digits is null`
        preenchidos += r.count
      }
    }
  } catch (err) {
    console.error(`${cartao.conta}: falhou (${err instanceof Error ? err.message : err})`)
    continue
  }
  const resumo = [...finais].map(([f, n]) => `•${f} (${n})`).join(', ') || 'nenhum final'
  console.log(`${cartao.conta}: ${resumo}${aplicar ? ` — ${preenchidos} preenchido(s)` : ''}`)
  total += preenchidos
}
if (aplicar) console.log(`${total} lançamento(s) preenchido(s).`)
await sql.end()
