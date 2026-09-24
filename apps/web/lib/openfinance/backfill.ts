import { and, eq, isNull } from 'drizzle-orm'
import { getDb, openfinanceConnections, openfinanceResources, transactions } from '@floow/db'
import { normalizeAccountTransaction, normalizeCardTransaction } from '@floow/core-finance'
import type { PolpAccountTransaction, PolpCardTransaction } from '@floow/core-finance'
import { condicaoDeRealizadoSemVinculo } from '@/lib/finance/forecast-match-db'
import { getPolpClient } from './config'
import { loadCounterpartyIndex, resolveCounterparty } from './resolve-counterparty'
import { devolverTransferenciasSemParAClassificar } from './transferencias-sem-par'
import { criarPernasPrevistasFaltantes } from './pernas-faltantes'

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
                // Ponta real já conciliada com perna prevista, ou origem que
                // já tem par: a decisão foi tomada, o backfill não a desfaz.
                condicaoDeRealizadoSemVinculo(),
                isNull(transactions.transferGroupId),
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

/**
 * O que a rota `/api/admin/backfill-counterparties` roda hoje. Mesma
 * superfície de backfill administrativo deste arquivo, não uma nova: abre o
 * banco privilegiado aqui, e não na rota, porque as duas rotinas escrevem em
 * `transactions` e `counterparties`, cujas policies de escrita ainda não estão
 * no ar (ver `__tests__/auth/rls-ledger.test.ts`).
 *
 * Diferente de `backfillCounterparties`, mexe só no recorte de transferência
 * sem par e pode rodar mais de uma vez:
 * 1. transferência do banco sem conta volta pendente, com contraparte;
 * 2. transferência com destino Open Finance sem perna ganha a perna prevista.
 */
export async function executarBackfillDeTransferencias(orgId: string): Promise<{
  transferenciasDevolvidas: number
  transferenciasSemChave: number
  pernasPrevistas: number
}> {
  const db = getDb()
  const devolvidas = await devolverTransferenciasSemParAClassificar(db, orgId)
  const pernas = await criarPernasPrevistasFaltantes(db, orgId)
  return {
    transferenciasDevolvidas: devolvidas.devolvidas,
    transferenciasSemChave: devolvidas.semChave,
    pernasPrevistas: pernas.criadas,
  }
}
