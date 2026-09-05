import { and, eq } from 'drizzle-orm'
import { getDb, openfinanceConnections, openfinanceResources, transactions } from '@floow/db'
import { normalizeAccountTransaction, normalizeCardTransaction } from '@floow/core-finance'
import type { PolpAccountTransaction, PolpCardTransaction } from '@floow/core-finance'
import { getPolpClient } from './config'
import { loadCounterpartyIndex, resolveCounterparty } from './resolve-counterparty'

/**
 * Reclassifica os dados de Open Finance já gravados sob as regras antigas
 * (category_ref decidindo natureza). Roda UMA vez por org, contra o histórico
 * completo — `polp_type` está null em quase todas as linhas já gravadas
 * porque a coluna nasceu depois da ingestão que gravou a maioria delas, então
 * reconstituir exige rebuscar a Polp, não o banco.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md §7
 */
export async function backfillCounterparties(orgId: string): Promise<{ updated: number; skipped: number }> {
  const db = getDb()
  const client = getPolpClient()

  const connections = await db.select().from(openfinanceConnections).where(eq(openfinanceConnections.orgId, orgId))
  const counterpartyIndex = await loadCounterpartyIndex(db, orgId)

  let updated = 0
  let skipped = 0

  for (const connection of connections) {
    const resources = await db
      .select()
      .from(openfinanceResources)
      .where(and(eq(openfinanceResources.connectionId, connection.id)))

    for (const resource of resources) {
      if (!resource.accountId) continue
      const accountId = resource.accountId
      const isCard = resource.resourceType === 'CREDIT_CARD_ACCOUNT'

      const pages = isCard
        ? client.streamCardTransactions(resource.polpResourceId)
        : client.streamAccountTransactions(resource.polpResourceId)

      for await (const page of pages) {
        for (const raw of page) {
          const normalized = isCard
            ? normalizeCardTransaction(raw as PolpCardTransaction)
            : normalizeAccountTransaction(raw as PolpAccountTransaction)

          const resolved = await resolveCounterparty(db, orgId, accountId, normalized, counterpartyIndex)

          const result = await db
            .update(transactions)
            .set({
              type: resolved.type,
              categoryId: resolved.categoryId ?? undefined, // undefined = não sobrescreve categoria manual do usuário
              counterpartyId: resolved.counterpartyId,
              counterpartyTaxId: resolved.counterpartyTaxId,
              counterpartyName: resolved.counterpartyName,
              reviewState: resolved.reviewState,
            })
            .where(
              and(
                eq(transactions.orgId, orgId),
                eq(transactions.accountId, accountId),
                eq(transactions.externalId, resolved.externalId),
              ),
            )
            .returning({ id: transactions.id })

          if (result.length > 0) updated++
          else skipped++ // transação que a Polp manda mas nunca chegou a ser gravada (rejeitada, por ex.)
        }
      }
    }
  }

  return { updated, skipped }
}
