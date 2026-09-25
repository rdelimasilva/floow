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

      // Candidato para o teste de INSERT da trigger da seção 5: um usuário sem
      // linha em counterparties.confirmed_by (a única FK que aponta para
      // profiles.id). Apagar e reinserir o profile do "membro" usado acima
      // quebraria essa FK antes mesmo de chegar na trigger — não prova nada
      // sobre ela, só sobre dado de desenvolvimento.
      const [semReferencia] = await tx`
        select m.user_id from org_members m
        where not exists (select 1 from counterparties c where c.confirmed_by = m.user_id)
        order by m.created_at
        limit 1`

      // Índice único: dois usuários não verificam o mesmo número.
      const outros = await tx`select id from profiles order by created_at limit 2`
      if (outros.length === 2) {
        await tx`update profiles set whatsapp_phone = '+5500000000000', whatsapp_verified_at = now()
                 where id = ${outros[0].id}`
        await deveFalhar(tx, 'número verificado único', () =>
          tx`update profiles set whatsapp_phone = '+5500000000000', whatsapp_verified_at = now()
             where id = ${outros[1].id}`)
      }

      // Trigger da seção 5: como dono (service role, ainda sem trocar de papel),
      // gravar whatsapp_phone/whatsapp_verified_at do próprio membro funciona —
      // a trigger só barra o papel 'authenticated'.
      await tx`update profiles set whatsapp_phone = '+5511900000000', whatsapp_verified_at = now()
               where id = ${membro.user_id}`
      const [comoDonoGravou] = await tx`
        select whatsapp_phone, whatsapp_verified_at from profiles where id = ${membro.user_id}`
      checar(
        'dono (service role) escreve whatsapp verificado',
        comoDonoGravou.whatsapp_phone === '+5511900000000' && comoDonoGravou.whatsapp_verified_at !== null,
      )

      // RLS: como o próprio usuário, grava na sua org; não enxerga linha de outro.
      const claims = JSON.stringify({ sub: membro.user_id, role: 'authenticated' })
      await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`

      const [ctx] = await tx`select current_user as usuario, auth.uid()::text as uid`
      checar('assume o papel authenticated', ctx.usuario === 'authenticated', ctx.usuario)
      checar('auth.uid() resolve para o usuário das claims', ctx.uid === membro.user_id)

      // Trigger da seção 5: authenticated não reescreve o próprio whatsapp
      // verificado (só o backend, depois de confirmar o código), mas pode
      // limpar as duas colunas para remover o número. Troca o telefone, não
      // usa now() de novo: now() é o horário de início da transação, fixo do
      // início ao fim — repeti-lo não seria uma mudança de verdade e a
      // trigger nem chegaria a disparar.
      await deveFalhar(tx, 'authenticated não reescreve o próprio whatsapp verificado', () =>
        tx`update profiles set whatsapp_phone = '+5511911111111' where id = ${membro.user_id}`)

      await tx`update profiles set whatsapp_phone = null, whatsapp_verified_at = null
               where id = ${membro.user_id}`
      const [comoUsuarioLimpou] = await tx`
        select whatsapp_phone, whatsapp_verified_at from profiles where id = ${membro.user_id}`
      checar(
        'authenticated limpa o próprio whatsapp (remoção)',
        comoUsuarioLimpou.whatsapp_phone === null && comoUsuarioLimpou.whatsapp_verified_at === null,
      )

      // Trigger da seção 5 (INSERT): apagar a própria linha e inserir de novo
      // já com o whatsapp verificado não escapa da trigger — ela cobre INSERT,
      // não só UPDATE. Troca o sub das claims para o candidato sem referência
      // em counterparties, exercita o INSERT como ele, e devolve o sub para o
      // "membro" antes de continuar (os testes de notification_preferences
      // abaixo dependem dele).
      if (semReferencia) {
        const claimsAlt = JSON.stringify({ sub: semReferencia.user_id, role: 'authenticated' })
        await tx`select set_config('request.jwt.claims', ${claimsAlt}, true)`
        const [perfilAlt] = await tx`select email, full_name from profiles where id = ${semReferencia.user_id}`

        await deveFalhar(tx, 'authenticated não insere a própria linha com whatsapp já verificado', async () => {
          await tx`delete from profiles where id = ${semReferencia.user_id}`
          await tx`insert into profiles (id, email, full_name, whatsapp_phone, whatsapp_verified_at)
                   values (${semReferencia.user_id}, ${perfilAlt.email}, ${perfilAlt.full_name},
                           '+5511922222222', now())`
        })

        // O mesmo delete+insert, mas com as duas colunas vazias (linha nova,
        // ainda sem WhatsApp) — isto continua permitido.
        await tx`delete from profiles where id = ${semReferencia.user_id}`
        await tx`insert into profiles (id, email, full_name) values
                 (${semReferencia.user_id}, ${perfilAlt.email}, ${perfilAlt.full_name})`
        const [perfilReinserido] = await tx`
          select whatsapp_phone, whatsapp_verified_at from profiles where id = ${semReferencia.user_id}`
        checar(
          'authenticated insere a própria linha sem whatsapp (ambos NULL)',
          perfilReinserido.whatsapp_phone === null && perfilReinserido.whatsapp_verified_at === null,
        )

        await tx`select set_config('request.jwt.claims', ${claims}, true)`
      } else {
        console.log('  (pulei o teste de INSERT da trigger: todo mundo em org_members tem confirmed_by)')
      }

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
