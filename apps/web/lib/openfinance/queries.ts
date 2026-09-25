import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { accounts, assetPositionSnapshots, openfinanceConnections, openfinanceResources, transactions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { concluiAoAbrir } from './auto-vinculo'

/**
 * Leituras da conexão Open Finance.
 *
 * Sem cache de RSC de propósito: o status de um consentimento muda por fora do
 * app (o usuário autoriza no banco, a Polp termina de importar), e servir uma
 * versão de 60 segundos atrás faria a tela mentir justamente no minuto em que o
 * usuário está esperando ela mudar.
 */

export interface BankConnectionSummary {
  id: string
  institutionId: string
  institutionName: string | null
  /** ID do consentimento na Polp — exibido para consulta no suporte dela. */
  polpConsentId: string
  cpfMasked: string
  status: string
  executionStatus: string | null
  flags: string[]
  products: string[]
  lastSyncedAt: Date | null
  createdAt: Date
  /** Conexão guiada que ainda não vinculou/importou: a tela conclui ao abrir. */
  autoVinculoPendente: boolean
  resources: {
    id: string
    resourceType: string
    status: string
    accountId: string | null
    accountName: string | null
    /** "Cartão · final 1234" — sempre preenchido; ver resource-label.ts. */
    displayLabel: string | null
  }[]
}

export async function getBankConnections(orgId: string): Promise<BankConnectionSummary[]> {
  return withUserDb(async (db) => {

    const connections = await db
      .select()
      .from(openfinanceConnections)
      .where(and(eq(openfinanceConnections.orgId, orgId), isNull(openfinanceConnections.revokedAt)))
      .orderBy(desc(openfinanceConnections.createdAt))

    if (connections.length === 0) return []

    // Uma consulta para todos os recursos da org, em vez de uma por conexão: são
    // poucas linhas e o join com accounts já traz o nome da conta vinculada.
    const resources = await db
      .select({
        id: openfinanceResources.id,
        connectionId: openfinanceResources.connectionId,
        resourceType: openfinanceResources.resourceType,
        status: openfinanceResources.status,
        accountId: openfinanceResources.accountId,
        accountName: accounts.name,
        displayLabel: openfinanceResources.displayLabel,
      })
      .from(openfinanceResources)
      .leftJoin(accounts, eq(accounts.id, openfinanceResources.accountId))
      .where(and(eq(openfinanceResources.orgId, orgId), isNull(openfinanceResources.assetId)))

    return connections.map((connection) => ({
      id: connection.id,
      institutionId: connection.institutionId,
      institutionName: connection.institutionName,
      polpConsentId: connection.polpConsentId,
      cpfMasked: connection.cpfMasked,
      status: connection.status,
      executionStatus: connection.executionStatus,
      flags: connection.flags ?? [],
      products: connection.products ?? [],
      lastSyncedAt: connection.lastSyncedAt,
      createdAt: connection.createdAt,
      autoVinculoPendente: concluiAoAbrir({ ...connection, products: connection.products ?? [] }),
      resources: resources
        .filter((r) => r.connectionId === connection.id)
        .map(({ connectionId: _connectionId, ...rest }) => rest),
    }))
  })
}

export async function getBankConnection(
  orgId: string,
  connectionId: string,
): Promise<BankConnectionSummary | null> {
  const all = await getBankConnections(orgId)
  return all.find((c) => c.id === connectionId) ?? null
}

/**
 * Última data de transação de cada conta da org.
 *
 * Serve para sugerir o corte da primeira importação: começar no dia seguinte
 * elimina a sobreposição com o que a conta já tem, que o dedupe por
 * `external_id` não pegaria — o id de um OFX não é o id da Polp.
 */
export async function getLastTransactionDateByAccount(
  orgId: string,
): Promise<Record<string, string>> {
  return withUserDb(async (db) => {

    const rows = await db
      .select({
        accountId: transactions.accountId,
        // A maior data que NÃO está no futuro: parcela e recorrência já lançadas
        // para frente não dizem nada sobre até onde o histórico real vai.
        last: sql<string>`max(${transactions.date}) FILTER (WHERE ${transactions.date} <= now()::date)`,
      })
      .from(transactions)
      .where(eq(transactions.orgId, orgId))
      .groupBy(transactions.accountId)

    const mapa: Record<string, string> = {}
    for (const row of rows) if (row.last) mapa[row.accountId] = row.last
    return mapa
  })
}

/**
 * Contas "Investimentos · <banco>" criadas pelo Open Finance. O tipo delas é
 * travado no banco (migração 00055); a tela de contas usa isto para nem
 * oferecer a troca.
 */
export async function getContasDeInvestimentoOpenFinance(orgId: string): Promise<Set<string>> {
  return withUserDb(async (db) => {
    const rows = await db
      .select({ accountId: openfinanceConnections.investmentAccountId })
      .from(openfinanceConnections)
      .where(and(eq(openfinanceConnections.orgId, orgId), isNotNull(openfinanceConnections.investmentAccountId)))
    return new Set(rows.map((r) => r.accountId!))
  })
}

/**
 * Valor das posições de cada conta "Investimentos · <banco>", em centavos.
 *
 * O `balance_cents` dessas contas é só o líquido das aplicações ligadas pelo
 * extrato — numa conexão só de investimentos fica zerado. A verdade são as
 * posições (ver `core-finance/src/account-kind.ts`), e este é o mesmo valor
 * que a carteira mostra: o snapshot de cada ativo da conexão.
 */
export async function getValorDasContasDeInvestimento(orgId: string): Promise<Map<string, number>> {
  return withUserDb(async (db) => {
    const rows = await db
      .select({
        accountId: openfinanceConnections.investmentAccountId,
        valorCents: sql<string>`coalesce(sum(${assetPositionSnapshots.currentValueCents}), 0)`,
      })
      .from(openfinanceConnections)
      .innerJoin(openfinanceResources, eq(openfinanceResources.connectionId, openfinanceConnections.id))
      .innerJoin(assetPositionSnapshots, eq(assetPositionSnapshots.assetId, openfinanceResources.assetId))
      .where(and(eq(openfinanceConnections.orgId, orgId), isNotNull(openfinanceConnections.investmentAccountId)))
      .groupBy(openfinanceConnections.investmentAccountId)
    return new Map(rows.map((r) => [r.accountId!, Number(r.valorCents)]))
  })
}
