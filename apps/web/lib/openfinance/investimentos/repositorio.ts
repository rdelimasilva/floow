import { and, desc, eq, gt, isNotNull, notInArray, sql } from 'drizzle-orm'
import {
  accounts, assets, assetBankPositions, openfinanceConnections,
  openfinanceIngestionIssues, openfinanceResources, portfolioEvents,
  type getDb,
} from '@floow/db'
import type { NormalizedInvestment, NormalizedInvestmentEvent, PolpInvestmentKind } from '@floow/core-finance'
import { recomputeOrgPositionSnapshots } from '@/lib/investments/position-snapshots'
import { decidirVinculo } from './vinculo'

type Db = ReturnType<typeof getDb>

/** Item que a ingestão de investimentos não conseguiu gravar, com o payload cru. */
export interface ProblemaDeIngestao {
  resourceId: string | null
  externalId: string | null
  reason: string
  payload: unknown
}

export interface RepositorioDeInvestimentos {
  garantirConta(conexao: { id: string; orgId: string; institutionName: string | null }): Promise<string>
  salvarInvestimento(ctx: { orgId: string; connectionId: string }, inv: NormalizedInvestment):
    Promise<{ tipo: 'salvo'; assetId: string; resourceId: string } | { tipo: 'conflito' }>
  ultimaDataDeMovimentacao(assetId: string): Promise<string | null>
  salvarMovimentacoes(ctx: { orgId: string; accountId: string; assetId: string }, eventos: NormalizedInvestmentEvent[]): Promise<number>
  /**
   * Zera, na data `hoje`, a posição dos ativos desta conexão e deste tipo que
   * não vieram na listagem (resgatados por inteiro). Devolve quantos zerou.
   */
  zerarAusentes(ctx: { orgId: string; connectionId: string }, kind: PolpInvestmentKind, polpIdsVistos: string[], hoje: string): Promise<number>
  registrarProblemas(orgId: string, problemas: ProblemaDeIngestao[]): Promise<void>
  recalcularPosicoes(orgId: string): Promise<void>
}

export function criarRepositorio(db: Db): RepositorioDeInvestimentos {
  return {
    async garantirConta(conexao) {
      const [atual] = await db
        .select({ accountId: openfinanceConnections.investmentAccountId })
        .from(openfinanceConnections)
        .where(eq(openfinanceConnections.id, conexao.id))
        .limit(1)
      if (atual?.accountId) return atual.accountId

      // `brokerage` fica fora do seletor de lançamento e do saldo corrido — ver
      // `core-finance/src/account-kind.ts`. D3: investimento não toca o caixa.
      const [conta] = await db
        .insert(accounts)
        .values({ orgId: conexao.orgId, name: `Investimentos · ${conexao.institutionName ?? 'Open Finance'}`, type: 'brokerage' })
        .returning({ id: accounts.id })
      await db
        .update(openfinanceConnections)
        .set({ investmentAccountId: conta.id, updatedAt: new Date() })
        .where(eq(openfinanceConnections.id, conexao.id))
      return conta.id
    },

    async salvarInvestimento(ctx, inv) {
      const [existente] = await db
        .select({ id: openfinanceResources.id, orgId: openfinanceResources.orgId, assetId: openfinanceResources.assetId })
        .from(openfinanceResources)
        .where(eq(openfinanceResources.polpResourceId, inv.polpId))
        .limit(1)

      const vinculo = decidirVinculo(existente, ctx.orgId)
      if (vinculo.tipo === 'conflito') return { tipo: 'conflito' }

      const dadosDoAtivo = { ...inv.asset, currency: 'BRL', source: 'openfinance' as const, updatedAt: new Date() }

      let resourceId: string
      let assetId: string | null = null
      if (vinculo.tipo === 'novo') {
        const [r] = await db
          .insert(openfinanceResources)
          .values({
            orgId: ctx.orgId, connectionId: ctx.connectionId, polpResourceId: inv.polpId,
            resourceType: inv.kind, status: 'AVAILABLE', displayLabel: inv.asset.name,
          })
          .returning({ id: openfinanceResources.id })
        resourceId = r.id
      } else {
        resourceId = vinculo.resourceId
        assetId = vinculo.assetId
      }

      if (assetId) {
        await db.update(assets).set(dadosDoAtivo).where(and(eq(assets.id, assetId), eq(assets.orgId, ctx.orgId)))
      } else {
        const [a] = await db.insert(assets).values({ orgId: ctx.orgId, ...dadosDoAtivo }).returning({ id: assets.id })
        assetId = a.id
        await db
          .update(openfinanceResources)
          .set({ assetId, displayLabel: inv.asset.name, updatedAt: new Date() })
          .where(eq(openfinanceResources.id, resourceId))
      }

      if (inv.position) {
        const { referenceDate, ...valores } = inv.position
        await db
          .insert(assetBankPositions)
          .values({ orgId: ctx.orgId, assetId, referenceDate, ...valores })
          .onConflictDoUpdate({ target: [assetBankPositions.assetId, assetBankPositions.referenceDate], set: valores })
        // Voltou à listagem: a posição zerada por `zerarAusentes` com data
        // mais nova que a do banco (que costuma vir D-1) esconderia a real.
        await db
          .delete(assetBankPositions)
          .where(and(
            eq(assetBankPositions.assetId, assetId),
            gt(assetBankPositions.referenceDate, referenceDate),
            sql`coalesce(${assetBankPositions.quantity}, 0) = 0`,
            sql`coalesce(${assetBankPositions.grossCents}, 0) = 0`,
            sql`coalesce(${assetBankPositions.netCents}, 0) = 0`,
          ))
      }

      await db
        .update(openfinanceResources)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(openfinanceResources.id, resourceId))

      return { tipo: 'salvo', assetId, resourceId }
    },

    async ultimaDataDeMovimentacao(assetId) {
      const [row] = await db
        .select({ eventDate: portfolioEvents.eventDate })
        .from(portfolioEvents)
        .where(eq(portfolioEvents.assetId, assetId))
        .orderBy(desc(portfolioEvents.eventDate))
        .limit(1)
      return row ? row.eventDate.toISOString().slice(0, 10) : null
    },

    async salvarMovimentacoes(ctx, eventos) {
      if (eventos.length === 0) return 0
      const linhas = deduplicarPorTransacao(eventos).map((e) => ({
        orgId: ctx.orgId,
        assetId: ctx.assetId,
        accountId: ctx.accountId,
        eventType: e.eventType,
        eventDate: new Date(`${e.eventDate}T00:00:00Z`),
        quantity: e.quantity,
        priceCents: e.priceCents,
        totalCents: e.totalCents,
        unitPrice: e.unitPrice,
        polpTransactionId: e.polpTransactionId,
        grossCents: e.grossCents,
        netCents: e.netCents,
        incomeTaxCents: e.incomeTaxCents,
        notes: e.notes,
      }))
      await db
        .insert(portfolioEvents)
        .values(linhas)
        .onConflictDoUpdate({
          target: portfolioEvents.polpTransactionId,
          // Defesa em profundidade: nunca reescreve evento de outra org.
          setWhere: sql`${portfolioEvents.orgId} = excluded.org_id`,
          set: {
            eventType: sqlExcluded('event_type'), eventDate: sqlExcluded('event_date'),
            quantity: sqlExcluded('quantity'), priceCents: sqlExcluded('price_cents'),
            totalCents: sqlExcluded('total_cents'), unitPrice: sqlExcluded('unit_price'),
            grossCents: sqlExcluded('gross_cents'), netCents: sqlExcluded('net_cents'),
            incomeTaxCents: sqlExcluded('income_tax_cents'), notes: sqlExcluded('notes'),
          },
        })
      return linhas.length
    },

    async zerarAusentes(ctx, kind, polpIdsVistos, hoje) {
      const ausentes = await db
        .select({ assetId: openfinanceResources.assetId })
        .from(openfinanceResources)
        .where(and(
          eq(openfinanceResources.orgId, ctx.orgId),
          eq(openfinanceResources.connectionId, ctx.connectionId),
          eq(openfinanceResources.resourceType, kind),
          isNotNull(openfinanceResources.assetId),
          polpIdsVistos.length > 0 ? notInArray(openfinanceResources.polpResourceId, polpIdsVistos) : undefined,
          // Já zerado na última posição: não empilha uma linha nova por dia.
          sql`NOT EXISTS (
            SELECT 1 FROM asset_bank_positions p
            WHERE p.asset_id = ${openfinanceResources.assetId}
              AND p.reference_date = (SELECT max(q.reference_date) FROM asset_bank_positions q WHERE q.asset_id = p.asset_id)
              AND coalesce(p.quantity, 0) = 0 AND coalesce(p.gross_cents, 0) = 0 AND coalesce(p.net_cents, 0) = 0
          )`,
        ))
      if (ausentes.length === 0) return 0

      const zero = {
        quantity: 0, unitPrice: null, grossCents: 0, netCents: 0,
        incomeTaxCents: 0, iofCents: 0, blockedCents: 0, purchaseUnitPrice: null,
      }
      await db
        .insert(assetBankPositions)
        .values(ausentes.map((a) => ({ orgId: ctx.orgId, assetId: a.assetId!, referenceDate: hoje, ...zero })))
        .onConflictDoUpdate({ target: [assetBankPositions.assetId, assetBankPositions.referenceDate], set: zero })
      return ausentes.length
    },

    async registrarProblemas(orgId, problemas) {
      if (problemas.length === 0) return
      await db.insert(openfinanceIngestionIssues).values(
        problemas.map((p) => ({
          orgId, resourceId: p.resourceId, externalId: p.externalId,
          reason: p.reason.slice(0, 500), payload: (p.payload ?? {}) as Record<string, unknown>,
        })),
      )
    },

    async recalcularPosicoes(orgId) {
      await recomputeOrgPositionSnapshots(orgId, db)
    },
  }
}

/**
 * A mesma movimentação repetida no lote derrubaria o INSERT inteiro ("ON
 * CONFLICT DO UPDATE command cannot affect row a second time"). Fica a última.
 */
export function deduplicarPorTransacao<T extends { polpTransactionId: string }>(eventos: T[]): T[] {
  return [...new Map(eventos.map((e) => [e.polpTransactionId, e])).values()]
}

/** `excluded.<coluna>` — o valor que o INSERT tentou gravar. */
function sqlExcluded(coluna: string) {
  return sql.raw(`excluded.${coluna}`)
}
