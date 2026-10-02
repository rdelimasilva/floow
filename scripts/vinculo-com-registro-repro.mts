#!/usr/bin/env -S npx tsx
// scripts/vinculo-com-registro-repro.mts
/**
 * Aplica a 00073 contra o banco real e SEMPRE desfaz (ROLLBACK). Confere:
 * todo vínculo existente ganha registro; vínculo novo sem proposta aprovada
 * estoura; com proposta aprovada passa; desaprovar a proposta de um vínculo
 * gravado estoura. Não imprime descrição de lançamento.
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/vinculo-com-registro-repro.mts
 */
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { databaseUrl, Rollback } from './conciliacao-comum.mts'

const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} })
const migration = readFileSync(new URL('../supabase/migrations/00073_vinculo_com_registro.sql', import.meta.url), 'utf8')
let falhas = 0
const checar = (nome: string, ok: boolean, detalhe = '') => { if (!ok) falhas++; console.log(`${ok ? 'OK  ' : 'FALHA'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`) }

async function estoura(tx: postgres.TransactionSql, nome: string, fn: () => Promise<unknown>, esperaErro: boolean) {
  await tx`savepoint s`
  let erro: string | null = null
  try { await fn(); await tx`set constraints all immediate` } catch (e) { erro = (e as Error).message }
  await tx`rollback to savepoint s`
  checar(nome, esperaErro ? Boolean(erro?.includes('Vínculo sem registro')) : erro === null, erro ?? '')
}

try {
  await sql.begin(async (tx) => {
    await tx.unsafe(migration)

    const [{ sem }] = await tx`select count(*)::int sem from transactions t where t.matched_transaction_id is not null and not exists (select 1 from forecast_match_proposals p where p.forecast_transaction_id = t.id and p.realized_transaction_id = t.matched_transaction_id and p.status = 'approved')`
    checar('todo vínculo existente tem proposta aprovada', sem === 0, `${sem} sem registro`)
    const porDecisao = await tx`select decisao, status, count(*)::int n from forecast_match_proposals group by 1, 2 order by 1, 2`
    console.log('     propostas por decisão:', porDecisao.map((r) => `${r.decisao ?? '—'}/${r.status}=${r.n}`).join(' '))

    // Uma previsão aberta e um extrato livre da mesma conta, quaisquer.
    const [par] = await tx`
      select p.id previsao, r.id realizado from transactions p
      join transactions r on r.account_id = p.account_id and r.org_id = p.org_id
      where p.recurring_template_id is not null and p.matched_transaction_id is null and p.balance_applied = false
        and r.origem = 'extrato' and r.balance_applied
        and not exists (select 1 from transactions x where x.matched_transaction_id = r.id)
        and not exists (select 1 from forecast_match_proposals f where f.forecast_transaction_id = p.id and f.realized_transaction_id = r.id)
      limit 1`
    checar('achou par de teste', Boolean(par))

    await estoura(tx, 'vínculo sem proposta estoura', () => tx`update transactions set matched_transaction_id = ${par.realizado} where id = ${par.previsao}`, true)
    await estoura(tx, 'vínculo com proposta pendente estoura', async () => {
      await tx`insert into forecast_match_proposals (org_id, forecast_transaction_id, realized_transaction_id, status) select org_id, id, ${par.realizado}, 'pending' from transactions where id = ${par.previsao}`
      await tx`update transactions set matched_transaction_id = ${par.realizado} where id = ${par.previsao}`
    }, true)
    await estoura(tx, 'vínculo antes, proposta aprovada depois (mesma transação) passa', async () => {
      await tx`update transactions set matched_transaction_id = ${par.realizado} where id = ${par.previsao}`
      await tx`insert into forecast_match_proposals (org_id, forecast_transaction_id, realized_transaction_id, status, decisao) select org_id, id, ${par.realizado}, 'approved', 'usuario' from transactions where id = ${par.previsao}`
    }, false)

    const [vinculado] = await tx`select id, matched_transaction_id m from transactions where matched_transaction_id is not null limit 1`
    await estoura(tx, 'recusar a proposta de um vínculo gravado estoura', () => tx`update forecast_match_proposals set status = 'refused' where forecast_transaction_id = ${vinculado.id} and realized_transaction_id = ${vinculado.m}`, true)
    await estoura(tx, 'desconciliar (solta o vínculo e reabre a proposta) passa', async () => {
      await tx`update transactions set matched_transaction_id = null where id = ${vinculado.id}`
      await tx`update forecast_match_proposals set status = 'pending', decided_at = null where forecast_transaction_id = ${vinculado.id} and realized_transaction_id = ${vinculado.m}`
    }, false)
    await estoura(tx, 'apagar a previsão vinculada passa (CASCADE leva a proposta)', () => tx`delete from transactions where id = ${vinculado.id}`, false)

    throw new Rollback()
  })
} catch (e) {
  if (!(e instanceof Rollback)) { console.error(e); falhas++ }
}
await sql.end()
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo (nada gravado: ROLLBACK).')
process.exit(falhas ? 1 : 0)
