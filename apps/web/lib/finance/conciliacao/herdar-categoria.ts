import { sql } from 'drizzle-orm'
import { recurringTemplates, transactions, validacoes, type getDb } from '@floow/db'
import { ACOES_DO_USUARIO, registrarEventos } from './validacoes'

type Db = ReturnType<typeof getDb>

/**
 * Vínculos que já existiam antes de o vínculo substituir a categoria
 * automática (`herancaDaPrevisao`): o lançamento do banco desta conta, preso
 * a uma previsão de recorrência, com categoria automática diferente da dela,
 * ganha a categoria da recorrência. Roda no motor (`conciliarConta`) a cada
 * passada; idempotente — quem herdou sai do recorte (`is_auto_categorized`
 * vira false).
 *
 * Mesmo recorte de `herancaDaPrevisao` no caminho 'substituir': confirmado,
 * mesma natureza, fora de transferência, categoria automática ou vazia, sem
 * decisão do usuário naquela linha (`ACOES_DO_USUARIO`).
 *
 * A categoria vem do modelo da recorrência, com a da previsão como reserva:
 * a previsão já vinculada ficou de fora quando editar o modelo passou a
 * levar a categoria às parcelas (00079) — "Flavio - Terapia (10/61)" segue
 * em Saúde com o modelo em Psicólogo.
 */
export async function herdarCategoriaDosVinculos(db: Db, orgId: string, accountId: string): Promise<number> {
  const acoes = sql.join(ACOES_DO_USUARIO.map((a) => sql`${a}`), sql`, `)
  const linhas = await db.execute<{ id: string; counterparty_id: string | null; type: 'income' | 'expense'; category_id: string }>(sql`
    with alvo as (
      select r.id, coalesce(rt.category_id, p.category_id) as categoria
        from ${transactions} p
        join ${transactions} r on r.id = p.matched_transaction_id and r.org_id = p.org_id
        left join ${recurringTemplates} rt on rt.id = p.recurring_template_id and rt.org_id = p.org_id
       where p.org_id = ${orgId}
         and r.account_id = ${accountId}
         and p.recurring_template_id is not null
         and p.aguarda_extrato = false
         and r.review_state = 'confirmed'
         and r.is_ignored = false
         and r.transfer_group_id is null
         and r.type <> 'transfer'
         and r.type = coalesce(rt.type, p.type)
         and (r.is_auto_categorized or r.category_id is null)
         and coalesce(rt.category_id, p.category_id) is not null
         and r.category_id is distinct from coalesce(rt.category_id, p.category_id)
         and not exists (
           select 1 from ${validacoes} v
            where v.transaction_id = r.id and v.org_id = r.org_id and v.acao in (${acoes})
         )
    )
    update ${transactions} as t
       set category_id = alvo.categoria, is_auto_categorized = false
      from alvo
     where t.id = alvo.id
    returning t.id, t.counterparty_id, t.type, t.category_id
  `)

  await registrarEventos(db, orgId, 'vinculo', null, linhas.map((l) => ({
    transactionId: l.id, counterpartyId: l.counterparty_id, natureza: l.type, categoriaId: l.category_id,
  })))
  return linhas.length
}
