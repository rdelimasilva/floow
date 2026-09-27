#!/usr/bin/env node
/**
 * Prova a migration 00066 (verificação invertida) contra o banco de verdade,
 * sem deixar rastro.
 *
 *   node scripts/whatsapp-link-probe.mjs
 *
 * Aplica o SQL numa transação, exercita phone NULL, o índice único em
 * code_hash e a reivindicação atômica do webhook (DELETE ... RETURNING), e
 * desfaz tudo no fim (rollback forçado). Não imprime dado pessoal.
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

const ler = (nome) => readFileSync(new URL(`../supabase/migrations/${nome}`, import.meta.url), 'utf8')
const MIGRATION = ler('00066_whatsapp_verificacao_invertida.sql')

// Sem onnotice o IF NOT EXISTS da segunda aplicação imprime um aviso do Postgres.
const sql = postgres(carregarEnv(), { prepare: false, onnotice: () => {} })
let falhas = 0
const checar = (rotulo, ok, detalhe = '') => {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (!ok) falhas++
}
class Rollback extends Error {}

async function deveFalhar(tx, rotulo, fn) {
  await tx.unsafe('savepoint sp')
  try {
    await fn()
    checar(rotulo, false, 'passou, deveria ter falhado')
  } catch {
    checar(rotulo, true)
  }
  await tx.unsafe('rollback to savepoint sp')
}

// Ids que não existem em lugar nenhum: whatsapp_verifications não tem FK.
const U1 = '00000000-0000-4000-8000-0000000000a1'
const U2 = '00000000-0000-4000-8000-0000000000a2'
const U3 = '00000000-0000-4000-8000-0000000000a3'

try {
  await sql
    .begin(async (tx) => {
      const [{ existe }] = await tx`select to_regclass('public.whatsapp_verifications') is not null as existe`
      if (!existe) {
        console.log('  (00065 ainda não aplicada neste banco: aplicando antes, também desfeita no fim)')
        await tx.unsafe(ler('00065_notificacoes_whatsapp.sql'))
      }

      await tx.unsafe(MIGRATION)
      // Idempotente: rodar de novo não pode quebrar.
      await tx.unsafe(MIGRATION)
      checar('migration aplica duas vezes sem erro', true)

      const [{ n: sobras }] = await tx`select count(*)::int as n from whatsapp_verifications`
      checar('pendências do fluxo antigo apagadas', sobras === 0, `${sobras}`)

      await tx`insert into whatsapp_verifications (user_id, phone, code_hash, expires_at)
               values (${U1}, null, 'hash-futuro', now() + interval '10 minutes')`
      checar('insert com phone NULL passa', true)

      await deveFalhar(tx, 'dois code_hash iguais falham', () =>
        tx`insert into whatsapp_verifications (user_id, phone, code_hash, expires_at)
           values (${U2}, null, 'hash-futuro', now() + interval '10 minutes')`)

      await tx`insert into whatsapp_verifications (user_id, phone, code_hash, expires_at)
               values (${U3}, null, 'hash-passado', now() - interval '1 minute')`

      const reivindicou = await tx`
        delete from whatsapp_verifications
        where code_hash = 'hash-futuro' and expires_at > now()
        returning user_id`
      checar(
        'DELETE ... RETURNING com expires_at no futuro devolve o user_id',
        reivindicou.length === 1 && reivindicou[0].user_id === U1,
      )

      const deNovo = await tx`
        delete from whatsapp_verifications
        where code_hash = 'hash-futuro' and expires_at > now()
        returning user_id`
      checar('uso único: a segunda reivindicação não devolve nada', deNovo.length === 0)

      const expirado = await tx`
        delete from whatsapp_verifications
        where code_hash = 'hash-passado' and expires_at > now()
        returning user_id`
      checar('DELETE ... RETURNING com expires_at no passado não devolve', expirado.length === 0)

      throw new Rollback()
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e
    })
} finally {
  await sql.end()
}

console.log(falhas === 0 ? '\nTudo certo (nada foi gravado).' : `\n${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)
