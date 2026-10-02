#!/usr/bin/env -S npx tsx
// scripts/troca-de-vinculo-repro.mts
/**
 * Caso de 01/10/2026 contra o banco real, SEMPRE em ROLLBACK: aplica a 00073,
 * recria o vínculo errado (Jussara 10/61 presa à Unimed, a TED de 01/10
 * livre), roda o motor (`conciliarConta`) em todas as contas Open Finance da
 * org e confere que nasceu a proposta de troca. Lista as trocas que o motor
 * proporia hoje, sem descrição de lançamento — só valores e datas.
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/troca-de-vinculo-repro.mts
 */
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { createDb } from '../packages/db/src/client'
import { conciliarConta } from '../apps/web/lib/finance/conciliacao/conciliar-conta'
import { brl, databaseUrl, Rollback } from './conciliacao-comum.mts'

const ORG = 'e37a3049-9710-4a32-ab58-4b0d1d0417b9'
const ITAU = '3ac85523-08e1-4623-bbff-5baadb44fd37'
const J10 = 'bab2a8db'
const UNIMED = '9a18b39d-e0b8-49d1-9487-ce8a6c50cd72'
const TED = '6c7223d1'

const db = createDb(databaseUrl())
let falhas = 0
const checar = (nome: string, ok: boolean, detalhe = '') => { if (!ok) falhas++; console.log(`${ok ? 'OK  ' : 'FALHA'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`) }
const linhas = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[]))

try {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(readFileSync(new URL('../supabase/migrations/00073_vinculo_com_registro.sql', import.meta.url), 'utf8')))

    // O estado de antes da correção: J10 → Unimed, com o registro "legado" que a 00073 daria.
    await tx.execute(sql`update transactions set matched_transaction_id = null where left(id::text, 8) = ${J10}`)
    await tx.execute(sql`delete from forecast_match_proposals where left(forecast_transaction_id::text, 8) = ${J10}`)
    await tx.execute(sql`update transactions set matched_transaction_id = ${UNIMED} where left(id::text, 8) = ${J10}`)
    await tx.execute(sql`insert into forecast_match_proposals (org_id, forecast_transaction_id, realized_transaction_id, status, decided_at, decisao) select org_id, id, ${UNIMED}, 'approved', now(), 'legado' from transactions where left(id::text, 8) = ${J10}`)
    await tx.execute(sql`set constraints all immediate`)
    await tx.execute(sql`set constraints all deferred`)

    const contas = linhas<{ account_id: string }>(await tx.execute(sql`select distinct account_id from openfinance_resources where org_id = ${ORG} and status = 'AVAILABLE' and account_id is not null`))
    for (const c of contas) await conciliarConta(tx as never, ORG, c.account_id)
    await tx.execute(sql`set constraints all immediate`)

    const [troca] = linhas<{ realizado: string; substitui: string }>(await tx.execute(sql`
      select left(realized_transaction_id::text, 8) realizado, substitui_transaction_id::text substitui
      from forecast_match_proposals where left(forecast_transaction_id::text, 8) = ${J10} and status = 'pending'`))
    checar('Jussara 10/61: troca proposta da Unimed pela TED de 01/10', troca?.realizado === TED && troca?.substitui === UNIMED, JSON.stringify(troca ?? null))

    const todas = linhas<{ conta: string; pd: string; pv: number; atual_d: string; atual_v: number; novo_d: string; novo_v: number }>(await tx.execute(sql`
      select a.name conta, p.date::date::text pd, p.amount_cents pv, s.date::date::text atual_d, s.amount_cents atual_v, r.date::date::text novo_d, r.amount_cents novo_v
      from forecast_match_proposals f
      join transactions p on p.id = f.forecast_transaction_id
      join transactions s on s.id = f.substitui_transaction_id
      join transactions r on r.id = f.realized_transaction_id
      join accounts a on a.id = p.account_id
      where f.org_id = ${ORG} and f.status = 'pending' and f.substitui_transaction_id is not null order by p.date`))
    console.log(`\n     trocas que o motor proporia hoje (${todas.length}):`)
    for (const t of todas) console.log(`     ${t.conta}: previsão ${t.pd} ${brl(t.pv)} | hoje ${t.atual_d} ${brl(t.atual_v)} → proposto ${t.novo_d} ${brl(t.novo_v)}`)

    throw new Rollback()
  })
} catch (e) {
  if (!(e instanceof Rollback)) { console.error(e); falhas++ }
}
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo (nada gravado: ROLLBACK).')
process.exit(falhas ? 1 : 0)
