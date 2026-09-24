#!/usr/bin/env node
/**
 * Regras de contraparte do CPF do titular que ainda gravam conta fixa.
 * Spec 2026-09-24-corrigir-regra-contraparte §6.3. Não mexe em lançamento:
 * só tira a conta da regra, para o próximo Pix cair em Classificar.
 *
 *   node scripts/regras-cpf-proprio.mjs            # só lista
 *   node scripts/regras-cpf-proprio.mjs --aplicar  # grava
 */
import postgres from 'postgres'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

function env(nome) {
  if (process.env[nome]) return process.env[nome]
  for (const linha of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const i = linha.indexOf('=')
    if (i > 0 && !linha.trim().startsWith('#') && linha.slice(0, i).trim() === nome) return linha.slice(i + 1).trim()
  }
  throw new Error(`${nome} nao encontrada`)
}

const salt = env('POLP_CPF_SALT')
// Mesmo hash de apps/web/lib/openfinance/cpf.ts::hashCpf.
const hash = (cpf) => createHash('sha256').update(`${salt}:${cpf.replace(/\D/g, '')}`).digest('hex')
const aplicar = process.argv.includes('--aplicar')
const sql = postgres(env('DATABASE_URL'), { prepare: false })

const regras = await sql`
  select c.id, c.org_id, c.key_value, c.display_name, a.name as conta
  from counterparties c left join accounts a on a.id = c.transfer_account_id
  where c.key_type = 'tax_id' and c.nature = 'transfer' and c.transfer_account_id is not null`
const hashes = await sql`select org_id, cpf_hash from openfinance_connections`
const doTitular = new Set(hashes.map((h) => `${h.org_id}:${h.cpf_hash}`))

const alvo = regras.filter((r) => r.key_value.replace(/\D/g, '').length === 11 && doTitular.has(`${r.org_id}:${hash(r.key_value)}`))
for (const r of alvo) console.log(`${r.display_name} -> ${r.conta}`)
console.log(`${alvo.length} regra(s) do titular com conta fixa.`)

if (aplicar && alvo.length > 0) {
  // Agrupar por org_id para garantir escrita filtrada por organização
  const porOrg = new Map()
  for (const r of alvo) {
    if (!porOrg.has(r.org_id)) porOrg.set(r.org_id, [])
    porOrg.get(r.org_id).push(r.id)
  }
  for (const [orgId, ids] of porOrg) {
    await sql`update counterparties set transfer_account_id = null, updated_at = now() where org_id = ${orgId} and id in ${sql(ids)}`
  }
  console.log('Conta removida.')
}
await sql.end()
