import { accounts, assets, categories, getDb, getServiceDb, orgs, transactions } from '@floow/db'
import { aggregateCashFlow, type ContextoDiagnostico } from '@floow/core-finance'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'
import { getContasDosAtivos } from '@/lib/investments/contas-dos-ativos'
import { getPositions } from '@/lib/investments/queries'
import { cdiAcumulado } from '@/lib/mercado/leitura'
import { gastoMensalDosMeses } from './gasto-mensal'
import { montarContexto } from './montar-contexto'

function mesesAntes(hoje: string, meses: number): string {
  const d = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 - meses, Number(hoje.slice(8, 10))))
  return d.toISOString().slice(0, 10)
}

/** Despesas mensais com o mesmo filtro do consultor: confirmadas, sem ignoradas, sem aplicação. */
async function gastoMensal(orgId: string, hoje: string): Promise<number | null> {
  const linhas = await getDb()
    .select({ date: transactions.date, amountCents: transactions.amountCents, type: transactions.type })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.isIgnored, false),
      eq(transactions.reviewState, 'confirmed'),
      effectiveAffectsCashFlow,
      gte(transactions.date, new Date(`${mesesAntes(hoje.slice(0, 8) + '01', 6)}T00:00:00Z`)),
    ))
  return gastoMensalDosMeses(aggregateCashFlow(linhas), hoje)
}

export async function carregarContexto(orgId: string, hoje: string): Promise<ContextoDiagnostico> {
  const db = getDb()
  const posicoes = await getPositions(orgId)
  const ids = posicoes.map((p) => p.assetId)

  const [ativos, contas, { porAtivo }, gasto, cdi, [org]] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({
            id: assets.id,
            ticker: assets.ticker,
            assetSubtype: assets.assetSubtype,
            cnpj: assets.cnpj,
            issuerName: assets.issuerName,
            indexer: assets.indexer,
            indexerPercentage: assets.indexerPercentage,
            preFixedRate: assets.preFixedRate,
            dueDate: assets.dueDate,
          })
          .from(assets)
          .where(and(eq(assets.orgId, orgId), inArray(assets.id, ids))),
    db
      .select({
        id: accounts.id,
        type: accounts.type,
        balanceCents: accounts.balanceCents,
        titular: accounts.titular,
        isActive: accounts.isActive,
      })
      .from(accounts)
      .where(eq(accounts.orgId, orgId)),
    getContasDosAtivos(orgId),
    gastoMensal(orgId, hoje),
    cdiAcumulado(getServiceDb(), mesesAntes(hoje, 12), hoje),
    db.select({ perfil: orgs.perfilInvestidor }).from(orgs).where(eq(orgs.id, orgId)),
  ])

  return montarContexto({
    hoje,
    posicoes,
    ativos,
    contas,
    porAtivo,
    gastoMensalCents: gasto,
    cdi12m: cdi,
    perfil: org?.perfil ?? null,
  })
}
