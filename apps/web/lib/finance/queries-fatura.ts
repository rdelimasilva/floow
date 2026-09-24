import { transactions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { fechamentoNoMes, totaisPorFatura, vencimentoDaFatura } from '@floow/core-finance/src/fatura'
import { fechamentosDoIntervalo, type FaturaNoExtrato, type IntervaloDaPagina } from './intercalar-faturas'

interface ContaDoFiltro {
  id: string
  name: string
  type: string
  closingDay: number | null
  dueDay: number | null
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/**
 * As faturas dos cartões marcados no filtro que fecham no intervalo da página.
 *
 * O total é sempre o do cartão inteiro: busca, categoria, tipo e valor
 * escolhem o que aparece na lista, não mudam a fatura — mesmo princípio do
 * saldo acumulado (`buildBalanceScopeConditions`).
 *
 * Só cartão com dia de fechamento cadastrado; sem cartão marcado, nada.
 */
export async function getFaturasDoExtrato(
  orgId: string,
  contasMarcadas: readonly ContaDoFiltro[],
  intervalo: IntervaloDaPagina | null,
): Promise<FaturaNoExtrato[]> {
  if (!intervalo) return []
  const cartoes = contasMarcadas
    .filter((c): c is ContaDoFiltro & { closingDay: number } => c.type === 'credit_card' && c.closingDay != null)
    .map((c) => ({ ...c, fechamentos: fechamentosDoIntervalo(intervalo, c.closingDay) }))
    .filter((c) => c.fechamentos.length > 0)
  if (cartoes.length === 0) return []

  // Janela que cobre qualquer lançamento dessas faturas: o comum cai entre o
  // fechamento anterior e o fechamento; a parcela do banco, até o fechamento
  // seguinte. Dois meses de folga nas duas pontas cobrem ambos.
  const todos = cartoes.flatMap((c) => c.fechamentos).sort()
  const [a0, m0] = [Number(todos[0].slice(0, 4)), Number(todos[0].slice(5, 7))]
  const ultimo = todos[todos.length - 1]
  const [a1, m1] = [Number(ultimo.slice(0, 4)), Number(ultimo.slice(5, 7))]
  const de = fechamentoNoMes(a0, m0 - 2, 1)
  const ate = fechamentoNoMes(a1, m1 + 2, 31)

  const linhas = await withUserDb((db) => db
    .select({
      accountId: transactions.accountId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      type: transactions.type,
      isIgnored: transactions.isIgnored,
      matchedTransactionId: transactions.matchedTransactionId,
      purchaseDate: transactions.purchaseDate,
      installmentTotal: transactions.installmentTotal,
    })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      inArray(transactions.accountId, cartoes.map((c) => c.id)),
      gte(transactions.date, new Date(`${de}T00:00:00Z`)),
      lte(transactions.date, new Date(`${ate}T00:00:00Z`)),
    )))

  return cartoes.flatMap((c) => {
    const totais = totaisPorFatura(
      linhas
        .filter((l) => l.accountId === c.id)
        .map((l) => ({ ...l, date: iso(l.date)!, purchaseDate: iso(l.purchaseDate) })),
      c.closingDay,
    )
    return c.fechamentos.map((fechamento) => ({
      accountId: c.id,
      accountName: c.name,
      fechamento,
      vencimento: vencimentoDaFatura(fechamento, c.dueDay),
      totalCents: totais.get(fechamento) ?? 0,
    }))
  })
}
