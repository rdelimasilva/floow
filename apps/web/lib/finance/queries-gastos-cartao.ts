import { categories, transactions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { gastosPorFatura } from '@floow/core-finance/src/gastos-do-cartao'
import { fechamentoDoLancamento } from '@floow/core-finance/src/fatura'
import { getAccounts } from './queries-accounts'
import { getCategories } from './queries-categories'

export interface GastoMensalDoCartao {
  fechamento: string
  totalCents: number
  porCategoria: Record<string, number>
  lancamentos: LancamentoDoGasto[]
}

export interface LancamentoDoGasto {
  id: string
  date: string
  description: string
  amountCents: number
  /** Categoria de cima (o grupo); a da transação vai em `subcategoria`. */
  categoryName: string | null
  subcategoria: string | null
}

export interface CartaoComGastos {
  id: string
  name: string
  titular: string | null
  faturas: GastoMensalDoCartao[]
}

const MESES = 12

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/**
 * Gasto de cada cartão nas últimas faturas, por categoria. Só cartão com dia
 * de fechamento cadastrado: sem ele não há como saber em que fatura cai a compra.
 */
export async function getGastosDosCartoes(orgId: string): Promise<CartaoComGastos[]> {
  const cartoes = (await getAccounts(orgId))
    .filter((a): a is typeof a & { closingDay: number } => a.type === 'credit_card' && a.closingDay != null)
  if (cartoes.length === 0) return []

  // Um mês a mais de folga: a compra do começo da janela cai numa fatura que
  // fechou antes dela e ficaria pela metade; ela sai no corte abaixo.
  const inicio = new Date()
  inicio.setUTCMonth(inicio.getUTCMonth() - MESES - 1, 1)
  const linhas = await withUserDb((db) => db
    .select({
      id: transactions.id,
      description: transactions.description,
      accountId: transactions.accountId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      type: transactions.type,
      isIgnored: transactions.isIgnored,
      matchedTransactionId: transactions.matchedTransactionId,
      purchaseDate: transactions.purchaseDate,
      installmentTotal: transactions.installmentTotal,
      billForecastMonth: transactions.billForecastMonth,
      billId: transactions.billId,
      recurringTemplateId: transactions.recurringTemplateId,
      isInstallmentForecast: transactions.isInstallmentForecast,
      balanceApplied: transactions.balanceApplied,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      eq(transactions.orgId, orgId),
      inArray(transactions.accountId, cartoes.map((c) => c.id)),
      gte(transactions.date, inicio),
    )))

  // Agrupa pela categoria de cima: "Alimentação" junta mercado, restaurante e
  // delivery. Categoria escondida pela org some do mapa e fica com o próprio nome.
  const porId = new Map((await getCategories(orgId)).map((c) => [c.id, c]))
  const grupoDe = (categoryId: string | null, nome: string | null) => {
    const pai = categoryId ? porId.get(porId.get(categoryId)?.parentId ?? '') : undefined
    return pai ? { categoryName: pai.name, subcategoria: nome } : { categoryName: nome, subcategoria: null }
  }

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const corte = new Date(inicio)
  corte.setUTCMonth(corte.getUTCMonth() + 1)
  const primeiroFechamento = corte.toISOString().slice(0, 10)
  return cartoes.map((c) => {
    // Até a fatura aberta: as seguintes só têm parcela prevista.
    const aberta = fechamentoDoLancamento({ date: hoje, purchaseDate: null, installmentTotal: null }, c.closingDay)
      return {
      id: c.id,
      name: c.name,
      titular: c.titular,
      faturas: gastosPorFatura(
        linhas
          .filter((l) => l.accountId === c.id)
          .map((l) => ({
            ...l,
            ...grupoDe(l.categoryId, l.categoryName),
            date: iso(l.date)!,
            purchaseDate: iso(l.purchaseDate),
            ehPrevisao: l.recurringTemplateId != null || l.isInstallmentForecast,
          })),
        c.closingDay,
        c.dueDay,
        hoje,
      )
        .filter((g) => g.fechamento >= primeiroFechamento && g.fechamento <= aberta)
      .map((g) => ({
          fechamento: g.fechamento,
          totalCents: g.totalCents,
          porCategoria: Object.fromEntries(g.porCategoria),
          lancamentos: g.lancamentos.map(({ id, date, description, amountCents, categoryName, subcategoria }) => ({ id, date, description, amountCents, categoryName, subcategoria })),
        })),
    }
  })
}
