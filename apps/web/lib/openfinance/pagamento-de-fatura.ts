import { and, eq, gte, inArray, isNull, lt, lte, ne, gt, or } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import type { Db } from './persist-page'
import type { PagamentoDoBanco } from './faturas-do-banco'

/**
 * Crédito no extrato do cartão que é pagamento de fatura, não receita.
 *
 * O pagamento no vencimento chega como PAGAMENTO_FATURA e já é transferência.
 * O antecipado não: o Itaú manda "PAGAMENTO COM SALDO" como crédito comum, e
 * os R$ 3.000 pagos em 05 e 08/08 no Master Black viraram receita (Reembolsos)
 * enquanto a conta corrente mostrava a saída como pagamento de fatura.
 *
 * Dois sinais, nenhum pelo nome do lançamento:
 *  - o banco listou um pagamento de fatura com o mesmo valor no mesmo dia;
 *  - outra conta tem uma saída de transferência sem par, do mesmo valor, até
 *    3 dias de distância. Cada saída serve a um crédito só.
 *
 * O caminho inverso segue a mesma regra. Quando se paga a mais, o banco devolve
 * o excesso: no cartão vem um débito ("DEVOLUCAO SALDO CREDOR") e na conta
 * corrente uma entrada de transferência. Os R$ 11.413,57 devolvidos ao Itaú em
 * 26/11/2025 contavam como despesa do Master Black no fluxo de caixa.
 *
 * Valor e saldo não mudam (o lançamento já estava no saldo do cartão); muda a
 * natureza, e a categoria automática sai. Categoria escolhida pelo usuário
 * mantém a linha como está.
 */

const JANELA_DIAS = 3
const DIA_MS = 86_400_000
const dia = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`)

export interface Credito {
  id: string
  /** Positivo no pagamento; negativo na devolução de saldo credor. */
  amountCents: number
  date: string
}

export interface Saida {
  id: string
  /** Sinal oposto ao do crédito: no pagamento, o dinheiro sai da outra conta. */
  amountCents: number
  date: string
}

/** Os créditos que são pagamento de fatura e os débitos que são devolução dele. */
export function pagamentosDeFatura(
  creditos: readonly Credito[],
  doBanco: readonly PagamentoDoBanco[],
  saidas: readonly Saida[],
): Set<string> {
  const achados = new Set<string>()
  const usadas = new Set<string>()
  for (const c of [...creditos].sort((a, b) => a.date.localeCompare(b.date))) {
    const peloBanco = doBanco.some((p) => p.amountCents === c.amountCents && p.date === c.date.slice(0, 10))
    // A saída é consumida mesmo quando o banco já confirmou: senão um
    // estorno do mesmo valor dias depois a pegaria.
    const saida = saidas.find((s) =>
      !usadas.has(s.id)
      && s.amountCents === -c.amountCents
      && Math.abs(dia(s.date) - dia(c.date)) <= JANELA_DIAS * DIA_MS)
    if (saida) usadas.add(saida.id)
    if (peloBanco || saida) achados.add(c.id)
  }
  return achados
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Reclassifica os créditos do cartão que são pagamento de fatura. */
export async function reclassificarPagamentosDeFatura(
  db: Db,
  orgId: string,
  accountId: string,
  doBanco: readonly PagamentoDoBanco[],
): Promise<number> {
  const creditos = (await db
    .select({ id: transactions.id, amountCents: transactions.amountCents, date: transactions.date })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, accountId),
      or(
        and(eq(transactions.type, 'income'), gt(transactions.amountCents, 0)),
        and(eq(transactions.type, 'expense'), lt(transactions.amountCents, 0)),
      ),
      eq(transactions.isIgnored, false),
      eq(transactions.origem, 'extrato'),
      isNull(transactions.transferGroupId),
      isNull(transactions.matchedTransactionId),
      // Categoria que o usuário escolheu não é desfeita aqui.
      or(isNull(transactions.categoryId), eq(transactions.isAutoCategorized, true)),
    )))
    .map((c) => ({ ...c, date: iso(c.date) }))
  if (creditos.length === 0) return 0

  const datas = creditos.map((c) => dia(c.date))
  const saidas = (await db
    .select({ id: transactions.id, amountCents: transactions.amountCents, date: transactions.date })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(
      eq(transactions.orgId, orgId),
      ne(transactions.accountId, accountId),
      // O pagamento de fatura de outro cartão, com o mesmo valor, não é a outra ponta.
      ne(accounts.type, 'credit_card'),
      eq(transactions.type, 'transfer'),
      eq(transactions.isIgnored, false),
      isNull(transactions.transferGroupId),
      inArray(transactions.amountCents, creditos.map((c) => -c.amountCents)),
      gte(transactions.date, new Date(Math.min(...datas) - JANELA_DIAS * DIA_MS)),
      lte(transactions.date, new Date(Math.max(...datas) + JANELA_DIAS * DIA_MS)),
    )))
    .map((s) => ({ ...s, date: iso(s.date) }))

  const ids = [...pagamentosDeFatura(creditos, doBanco, saidas)]
  if (ids.length === 0) return 0
  await db
    .update(transactions)
    .set({ type: 'transfer', categoryId: null, isAutoCategorized: false, reviewState: 'confirmed' })
    .where(and(eq(transactions.orgId, orgId), eq(transactions.accountId, accountId), inArray(transactions.id, ids)))
  return ids.length
}
