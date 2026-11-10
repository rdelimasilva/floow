import { accounts, assets, categories, getServiceDb, orgs, transactions, type RlsTx } from '@floow/db'
import { aggregateCashFlow, type ContextoDiagnostico } from '@floow/core-finance'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { withUserDb } from '@/lib/db/rls'
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
async function gastoMensal(db: RlsTx, orgId: string, hoje: string): Promise<number | null> {
  const linhas = await db
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
  const posicoes = await getPositions(orgId)
  const ids = posicoes.map((p) => p.assetId)

  const [doBanco, { porAtivo }, cdi] = await Promise.all([
    // Uma transação sob o RLS do usuário; dentro dela as queries vão em sequência.
    withUserDb(async (db) => {
      const ativos = ids.length === 0
        ? []
        : await db
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
            .where(and(eq(assets.orgId, orgId), inArray(assets.id, ids)))
      const contas = await db
        .select({
          id: accounts.id,
          type: accounts.type,
          balanceCents: accounts.balanceCents,
          titular: accounts.titular,
          isActive: accounts.isActive,
        })
        .from(accounts)
        .where(eq(accounts.orgId, orgId))
      const gasto = await gastoMensal(db, orgId, hoje)
      const [org] = await db.select({ perfil: orgs.perfilInvestidor }).from(orgs).where(eq(orgs.id, orgId))
      return { ativos, contas, gasto, perfil: org?.perfil ?? null }
    }),
    getContasDosAtivos(orgId),
    cdiAcumulado(getServiceDb(), mesesAntes(hoje, 12), hoje),
  ])

  return montarContexto({
    hoje,
    posicoes,
    ativos: doBanco.ativos,
    contas: doBanco.contas,
    porAtivo,
    gastoMensalCents: doBanco.gasto,
    cdi12m: cdi,
    perfil: doBanco.perfil,
  })
}
