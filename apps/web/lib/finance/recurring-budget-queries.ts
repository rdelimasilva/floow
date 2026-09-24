import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { transactions, recurringTemplates, type RlsTx } from '@floow/db'
import { and, eq, gte, lte, isNotNull } from 'drizzle-orm'
import { budgetEntriesTag, budgetSpendingTag } from '@/lib/cache-tags'
import { requireIdentity } from '@/lib/auth/session'
import { withUserDbFor } from '@/lib/db/rls'
import { getBudgetEntriesForMonth } from '@/lib/finance/budget-queries'
import {
  combinarMetasDoMes,
  somarRecorrentesPorCategoria,
  type LinhaDeMeta,
  type OcorrenciaDeRecorrente,
} from '@/lib/finance/recurring-budget'

/** Só leitura: a tela passa a transação sob RLS; o motor do CFO, a conexão de serviço. */
type Leitor = Pick<RlsTx, 'select'>

/**
 * Parcelas, no intervalo, das recorrentes marcadas como meta de gasto.
 *
 * Conta a linha de `transactions` com `recurring_template_id` — prevista ou
 * realizada; a conciliação com o banco só grava `matched_transaction_id` e não
 * apaga a previsão, então a parcela segue contada. O valor é o do template.
 *
 * Recebe o banco de quem chama: o motor do CFO roda sem usuário na requisição
 * (caminho de serviço); a tela usa a versão cacheada, sob o RLS do usuário.
 */
export async function buscarOcorrenciasDeRecorrentes(
  db: Leitor,
  orgId: string,
  start: Date,
  end: Date,
): Promise<OcorrenciaDeRecorrente[]> {
  const rows = await db
    .select({
      templateId: recurringTemplates.id,
      description: recurringTemplates.description,
      categoryId: recurringTemplates.categoryId,
      amountCents: recurringTemplates.amountCents,
    })
    .from(transactions)
    .innerJoin(recurringTemplates, eq(transactions.recurringTemplateId, recurringTemplates.id))
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(recurringTemplates.orgId, orgId),
        eq(recurringTemplates.countsAsBudget, true),
        // Pausar não apaga as parcelas futuras já geradas; sem isto elas seguiriam na meta.
        eq(recurringTemplates.isActive, true),
        eq(recurringTemplates.type, 'expense'),
        isNotNull(recurringTemplates.categoryId),
        eq(transactions.isIgnored, false),
        gte(transactions.date, start),
        lte(transactions.date, end),
      ),
    )

  return rows
    .filter((r): r is typeof r & { categoryId: string } => r.categoryId !== null)
    .map((r) => ({ ...r, amountCents: Math.abs(r.amountCents) }))
}

/**
 * Metas de gasto do mês já combinadas com as recorrentes-meta: uma linha por
 * meta manual, mais uma por categoria que só tem recorrente.
 */
export const getSpendingPlanForMonth = cache(async function getSpendingPlanForMonth(
  orgId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<LinhaDeMeta[]> {
  // Identidade resolvida fora do cache: o callback do unstable_cache não lê cookies.
  const { userId } = await requireIdentity()
  const [manuais, ocorrencias] = await Promise.all([
    getBudgetEntriesForMonth(orgId, monthStart, 'spending'),
    unstable_cache(
      () => withUserDbFor(userId, (db) => buscarOcorrenciasDeRecorrentes(db, orgId, monthStart, monthEnd)),
      ['recurring-budget-occurrences', orgId, userId, monthStart.toISOString(), monthEnd.toISOString()],
      // A tag de gasto é invalidada por revalidateTransactionData, que as
      // actions de recorrente chamam ao criar, editar ou cancelar.
      { tags: [budgetSpendingTag(orgId), budgetEntriesTag(orgId, 'spending')], revalidate: 300 },
    )(),
  ])

  return combinarMetasDoMes(
    manuais.map((e) => ({ id: e.id, categoryId: e.categoryId, plannedCents: e.plannedCents })),
    somarRecorrentesPorCategoria(ocorrencias),
  )
})
