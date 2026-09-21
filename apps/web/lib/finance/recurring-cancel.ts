'use server'

import { getDb, transactions, recurringTemplates } from '@floow/db'
import { and, eq } from 'drizzle-orm'
import { getOrgId } from './queries'
import { revalidateTransactionData } from './revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { whereParcelasFuturas, whereParcelasVencidasNaoConciliadas } from './recurring-cleanup'

function revalidateAccountData(orgId: string) {
  invalidateTag(accountsTag(orgId))
}


/**
 * Server action: cancel a recurring transaction series.
 * Deletes all future transactions (date > today) and marks template inactive.
 * Uses date > today (strictly greater) — today's transactions may already be reconciled.
 */
export async function cancelRecurring(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const templateId = formData.get('templateId') as string
  if (!templateId) throw new Error('Template ID is required')

  // Opcional, e desligado por padrao: apagar lancamento e irreversivel, e o
  // gesto de cancelar a recorrencia nao pode levar historico sem ser pedido.
  const limparVencidas = formData.get('removeOverdue') === '1'

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  let futurasRemovidas = 0
  let vencidasRemovidas = 0

  await db.transaction(async (tx) => {
    // Verify template belongs to org
    const [template] = await tx
      .select({ id: recurringTemplates.id })
      .from(recurringTemplates)
      .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
      .limit(1)

    if (!template) throw new Error('Template não encontrado')

    // Delete future transactions (balance_applied is false for these, no balance reversal needed)
    const futuras = await tx
      .delete(transactions)
      .where(whereParcelasFuturas(orgId, templateId, todayStr))
      .returning({ id: transactions.id })
    futurasRemovidas = futuras.length

    // As vencidas que o banco nunca confirmou, quando pedido. O recorte que
    // protege saldo e historico vive em `recurring-cleanup`.
    if (limparVencidas) {
      const vencidas = await tx
        .delete(transactions)
        .where(whereParcelasVencidasNaoConciliadas(orgId, templateId, todayStr))
        .returning({ id: transactions.id })
      vencidasRemovidas = vencidas.length
    }

    // Mark template inactive
    await tx
      .update(recurringTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)

  // Quem chamou conta ao usuario o que saiu: "parcelas futuras removidas" era
  // a mesma frase apagando 2 ou 40 linhas.
  return { futurasRemovidas, vencidasRemovidas }
}

