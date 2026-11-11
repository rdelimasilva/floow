import { categories, transactions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { gastosPorFatura } from '@floow/core-finance/src/gastos-do-cartao'
import { fechamentoDoLancamento } from '@floow/core-finance/src/fatura'
import { getAccounts } from './queries-accounts'
import { getCategories } from './queries-categories'
import { getSpendingPlanForMonth } from './recurring-budget-queries'

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

async function agrupadorDeCategorias(orgId: string) {
  const porId = new Map((await getCategories(orgId)).map((c) => [c.id, c]))
  return (categoryId: string | null, nome: string | null) => {
    const pai = categoryId ? porId.get(porId.get(categoryId)?.parentId ?? '') : undefined
    return pai ? { categoryName: pai.name, subcategoria: nome } : { categoryName: nome, subcategoria: null }
  }
}

/**
 * Recorte da tela em janela de faturas. `desde` é onde buscar compras (um mês
 * a mais de folga: a compra do começo cai numa fatura que fechou antes e ficaria
 * pela metade); `primeiroFechamento` e `ultimoFechamento` cortam as faturas.
 * Sem período nenhum, as últimas 12; data vazia é aberta.
 */
export function janelaDasFaturas(inicio: string, fim: string, hoje: string) {
  const base = inicio || (fim ? '' : new Date(`${hoje}T12:00:00Z`).toISOString())
  if (!base) return { desde: null, primeiroFechamento: '', ultimoFechamento: fim }
  const d = new Date(base)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - (inicio ? 1 : MESES + 1))
  const corte = new Date(d)
  corte.setUTCMonth(corte.getUTCMonth() + 1)
  return { desde: d, primeiroFechamento: inicio || corte.toISOString().slice(0, 10), ultimoFechamento: fim }
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/**
 * Gasto de cada cartão nas últimas faturas, por categoria. Só cartão com dia
 * de fechamento cadastrado: sem ele não há como saber em que fatura cai a compra.
 */
export async function getGastosDosCartoes(
  orgId: string,
  { inicio, fim }: { inicio: string; fim: string } = { inicio: '', fim: '' },
): Promise<CartaoComGastos[]> {
  const cartoes = (await getAccounts(orgId))
    .filter((a): a is typeof a & { closingDay: number } => a.type === 'credit_card' && a.closingDay != null)
  if (cartoes.length === 0) return []

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { desde, primeiroFechamento, ultimoFechamento } = janelaDasFaturas(inicio, fim, hoje)
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
      desde ? gte(transactions.date, desde) : undefined,
    )))

  // Agrupa pela categoria de cima: "Alimentação" junta mercado, restaurante e
  // delivery. Categoria escondida pela org some do mapa e fica com o próprio nome.
  const grupoDe = await agrupadorDeCategorias(orgId)

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
            ehRecorrencia: l.recurringTemplateId != null,
          })),
        c.closingDay,
        c.dueDay,
        hoje,
      )
        .filter((g) => g.fechamento >= primeiroFechamento && g.fechamento <= aberta && (!ultimoFechamento || g.fechamento <= ultimoFechamento))
      .map((g) => ({
          fechamento: g.fechamento,
          totalCents: g.totalCents,
          porCategoria: Object.fromEntries(g.porCategoria),
          lancamentos: g.lancamentos.map(({ id, date, description, amountCents, categoryName, subcategoria }) => ({ id, date, description, amountCents, categoryName, subcategoria })),
        })),
    }
  })
}

/**
 * Meta de gasto de cada mês ('YYYY-MM') por categoria de cima, a mesma conta
 * da tela de Metas (recorrentes incluídas). Meta de subcategoria soma na mãe,
 * como o gasto do gráfico.
 */
export async function getMetasDosMeses(orgId: string, meses: string[]): Promise<Record<string, Record<string, number>>> {
  const [grupoDe, categorias] = await Promise.all([agrupadorDeCategorias(orgId), getCategories(orgId)])
  const nomeDe = new Map(categorias.map((c) => [c.id, c.name]))
  const planos = await Promise.all(meses.map((mes) => {
    const [y, m] = mes.split('-').map(Number)
    return getSpendingPlanForMonth(orgId, new Date(y, m - 1, 1), new Date(y, m, 0))
  }))
  return Object.fromEntries(meses.map((mes, i) => {
    const porCategoria: Record<string, number> = {}
    for (const linha of planos[i]) {
      const nome = grupoDe(linha.categoryId, nomeDe.get(linha.categoryId ?? '') ?? null).categoryName
      if (nome) porCategoria[nome] = (porCategoria[nome] ?? 0) + linha.plannedCents
    }
    return [mes, porCategoria]
  }))
}
