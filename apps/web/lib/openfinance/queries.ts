import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb, accounts, openfinanceConnections, openfinanceResources } from '@floow/db'

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
  cpfMasked: string
  status: string
  executionStatus: string | null
  flags: string[]
  products: string[]
  lastSyncedAt: Date | null
  createdAt: Date
  resources: {
    id: string
    resourceType: string
    status: string
    accountId: string | null
    accountName: string | null
  }[]
}

export async function getBankConnections(orgId: string): Promise<BankConnectionSummary[]> {
  const db = getDb()

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
    })
    .from(openfinanceResources)
    .leftJoin(accounts, eq(accounts.id, openfinanceResources.accountId))
    .where(eq(openfinanceResources.orgId, orgId))

  return connections.map((connection) => ({
    id: connection.id,
    institutionId: connection.institutionId,
    institutionName: connection.institutionName,
    cpfMasked: connection.cpfMasked,
    status: connection.status,
    executionStatus: connection.executionStatus,
    flags: connection.flags ?? [],
    products: connection.products ?? [],
    lastSyncedAt: connection.lastSyncedAt,
    createdAt: connection.createdAt,
    resources: resources
      .filter((r) => r.connectionId === connection.id)
      .map(({ connectionId: _connectionId, ...rest }) => rest),
  }))
}

export async function getBankConnection(
  orgId: string,
  connectionId: string,
): Promise<BankConnectionSummary | null> {
  const all = await getBankConnections(orgId)
  return all.find((c) => c.id === connectionId) ?? null
}
