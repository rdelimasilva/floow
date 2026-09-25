#!/usr/bin/env node
/**
 * Prova a migration 00065 contra o banco de verdade, sem deixar rastro.
 *
 *   node scripts/whatsapp-migration-probe.mjs
 *
 * Aplica o SQL numa transação, confere backfill, CHECKs, PK nova e RLS, e
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

const MIGRATION = readFileSync(
  new URL('../supabase/migrations/00065_notificacoes_whatsapp.sql', import.meta.url),
  'utf8',
)
const sql = postgres(carregarEnv(), { prepare: false })
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

try {
  await sql
    .begin(async (tx) => {
      const [{ n: desligados }] = await tx`
        select count(*)::int as n from org_members m join profiles p on p.id = m.user_id
        where p.email_pacing_alerts = false`
      const [{ n: estadoAntes }] = await tx`select count(*)::int as n from pacing_alert_state`

      await tx.unsafe(MIGRATION)

      const [{ n: backfill }] = await tx`
        select count(*)::int as n from notification_preferences
        where channel = 'email' and frequency = 'off'`
      checar('backfill do e-mail desligado', backfill === desligados, `${backfill}/${desligados}`)

      const [{ n: estadoDepois }] = await tx`
        select count(*)::int as n from pacing_alert_state where channel = 'email'`
      checar('pacing_alert_state preservado como email', estadoDepois === estadoAntes)

      const [membro] = await tx`select user_id, org_id from org_members order by created_at limit 1`
      if (!membro) throw new Error('Sem org_members para exercitar')

      await deveFalhar(tx, 'CHECK de channel', () =>
        tx`insert into notification_preferences values (${membro.org_id}, ${membro.user_id}, 'sms', 'daily')`)
      await deveFalhar(tx, 'CHECK de frequency', () =>
        tx`insert into notification_preferences values (${membro.org_id}, ${membro.user_id}, 'email', 'hourly')`)

      // Mesmo par (org, mês, categoria) em dois canais convive graças à PK nova.
      const cat = '00000000-0000-4000-8000-000000000001'
      await tx`insert into pacing_alert_state (org_id, month, category_id, status, channel)
               values (${membro.org_id}, '2099-01', ${cat}, 'risco', 'email'),
                      (${membro.org_id}, '2099-01', ${cat}, 'risco', 'whatsapp')`
      const [{ n: doisCanais }] = await tx`
        select count(*)::int as n from pacing_alert_state
        where org_id = ${membro.org_id} and month = '2099-01' and category_id = ${cat}`
      checar('PK por canal aceita os dois canais', doisCanais === 2, `${doisCanais}/2`)

      // Índice único: dois usuários não verificam o mesmo número.
      const outros = await tx`select id from profiles order by created_at limit 2`
      if (outros.length === 2) {
        await tx`update profiles set whatsapp_phone = '+5500000000000', whatsapp_verified_at = now()
                 where id = ${outros[0].id}`
        await deveFalhar(tx, 'número verificado único', () =>
          tx`update profiles set whatsapp_phone = '+5500000000000', whatsapp_verified_at = now()
             where id = ${outros[1].id}`)
      }

      // RLS: como o próprio usuário, grava na sua org; não enxerga linha de outro.
      const claims = JSON.stringify({ sub: membro.user_id, role: 'authenticated' })
      await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`

      const [ctx] = await tx`select current_user as usuario, auth.uid()::text as uid`
      checar('assume o papel authenticated', ctx.usuario === 'authenticated', ctx.usuario)
      checar('auth.uid() resolve para o usuário das claims', ctx.uid === membro.user_id)

      await tx`insert into notification_preferences (org_id, user_id, channel, frequency)
               values (${membro.org_id}, ${membro.user_id}, 'whatsapp', 'daily')
               on conflict (org_id, user_id, channel) do update set frequency = excluded.frequency`
      const [gravada] = await tx`
        select frequency from notification_preferences
        where org_id = ${membro.org_id} and user_id = ${membro.user_id} and channel = 'whatsapp'`
      checar('RLS: usuário grava a própria preferência', gravada?.frequency === 'daily')
      const [{ n: alheias }] = await tx`
        select count(*)::int as n from notification_preferences where user_id <> ${membro.user_id}`
      checar('RLS: não enxerga preferência de outro', alheias === 0, `${alheias}`)
      await deveFalhar(tx, 'RLS: não grava preferência de outro usuário', () =>
        tx`insert into notification_preferences values
           (${membro.org_id}, '00000000-0000-4000-8000-000000000002', 'email', 'off')`)

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
