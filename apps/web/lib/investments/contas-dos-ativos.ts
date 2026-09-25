import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { accounts, openfinanceConnections, openfinanceResources, portfolioEvents } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'

export interface ContaComAtivos {
  id: string
  name: string
}

export interface ContasDosAtivos {
  /** Contas que guardam pelo menos um ativo, em ordem de nome. */
  contas: ContaComAtivos[]
  /** Contas de cada ativo. Um ativo manual pode ter eventos em mais de uma. */
  porAtivo: Map<string, Set<string>>
}

/**
 * Em que conta está cada ativo, para o filtro por conta da carteira.
 *
 * Duas origens: o ativo do Open Finance mora na conta "Investimentos · <banco>"
 * da conexão que o trouxe; o manual, nas contas dos seus eventos (compra,
 * venda, provento).
 */
export async function getContasDosAtivos(orgId: string): Promise<ContasDosAtivos> {
  return withUserDb(async (db) => {
    const [doBanco, manuais] = await Promise.all([
      db
        .select({ assetId: openfinanceResources.assetId, accountId: openfinanceConnections.investmentAccountId })
        .from(openfinanceResources)
        .innerJoin(openfinanceConnections, eq(openfinanceConnections.id, openfinanceResources.connectionId))
        .where(and(
          eq(openfinanceConnections.orgId, orgId),
          isNotNull(openfinanceConnections.investmentAccountId),
          isNotNull(openfinanceResources.assetId),
        )),
      db
        .selectDistinct({ assetId: portfolioEvents.assetId, accountId: portfolioEvents.accountId })
        .from(portfolioEvents)
        .where(eq(portfolioEvents.orgId, orgId)),
    ])

    const porAtivo = new Map<string, Set<string>>()
    for (const { assetId, accountId } of [...doBanco, ...manuais]) {
      if (!assetId || !accountId) continue
      const contas = porAtivo.get(assetId) ?? new Set<string>()
      contas.add(accountId)
      porAtivo.set(assetId, contas)
    }

    const ids = [...new Set([...porAtivo.values()].flatMap((s) => [...s]))]
    const contas = ids.length === 0
      ? []
      : await db
          .select({ id: accounts.id, name: accounts.name })
          .from(accounts)
          .where(and(eq(accounts.orgId, orgId), inArray(accounts.id, ids)))
          .orderBy(asc(accounts.name))

    return { contas, porAtivo }
  })
}
