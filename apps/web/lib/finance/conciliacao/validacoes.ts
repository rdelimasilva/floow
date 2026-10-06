import { and, eq, inArray } from 'drizzle-orm'
import { counterparties, transactions, validacoes, type AcaoDeValidacao, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>
type Natureza = 'income' | 'expense' | 'transfer'

/**
 * Toda decisão de categoria vira um registro em `validacoes` (spec
 * 2026-10-06, Entrega 1). Grava na MESMA transação da decisão: decisão sem
 * registro não existe, senão a medição mente.
 */

/** Aceitou o palpite ou escolheu outra coisa. Sem palpite, é sempre escolha. */
export function acaoDoUsuario(sugestaoCategoriaId: string | null, categoriaFinal: string | null): 'confirmar' | 'corrigir' {
  return sugestaoCategoriaId !== null && sugestaoCategoriaId === categoriaFinal ? 'confirmar' : 'corrigir'
}

export type Captura = {
  counterpartyId: string
  sugestao: { categoriaId: string | null; origem: 'historico' | 'claude' | null }
  ids: string[]
}

/**
 * O palpite e os pendentes ANTES de aplicar a decisão: depois do UPDATE não
 * dá mais para saber quem estava pendente nem o que o card mostrava.
 */
export async function capturarPendentes(tx: Db, orgId: string, counterpartyId: string, somenteIds?: string[]): Promise<Captura> {
  const [cp] = await tx
    .select({ categoriaId: counterparties.suggestedCategoryId, origem: counterparties.suggestionSource })
    .from(counterparties)
    .where(and(eq(counterparties.id, counterpartyId), eq(counterparties.orgId, orgId)))
    .limit(1)
  const condicoes = [eq(transactions.orgId, orgId), eq(transactions.counterpartyId, counterpartyId), eq(transactions.reviewState, 'pending')]
  if (somenteIds) condicoes.push(inArray(transactions.id, somenteIds))
  const pendentes = somenteIds?.length === 0 ? [] : await tx.select({ id: transactions.id }).from(transactions).where(and(...condicoes))
  return {
    counterpartyId,
    sugestao: { categoriaId: cp?.categoriaId ?? null, origem: cp?.origem ?? null },
    ids: pendentes.map((p) => p.id),
  }
}

/** Um evento por lançamento capturado que saiu confirmado, com a categoria final DELE (exceções do lote incluídas). */
export async function registrarDecisoes(tx: Db, orgId: string, captura: Captura, userId: string | null): Promise<number> {
  if (captura.ids.length === 0) return 0
  const decididos = await tx
    .select({ id: transactions.id, type: transactions.type, categoryId: transactions.categoryId })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, captura.ids), eq(transactions.reviewState, 'confirmed')))
  if (decididos.length === 0) return 0
  await tx.insert(validacoes).values(decididos.map((d) => ({
    orgId,
    transactionId: d.id,
    counterpartyId: captura.counterpartyId,
    userId,
    acao: acaoDoUsuario(captura.sugestao.categoriaId, d.categoryId),
    sugestaoCategoriaId: captura.sugestao.categoriaId,
    sugestaoOrigem: captura.sugestao.origem,
    natureza: d.type as Natureza,
    categoriaId: d.categoryId,
  })))
  return decididos.length
}

export type EventoNovo = { transactionId: string; counterpartyId: string | null; natureza: Natureza; categoriaId: string | null }

/** Decisão sem palpite a comparar: regra aplicada no sync, categoria herdada da previsão, edição fora da fila. */
export async function registrarEventos(tx: Db, orgId: string, acao: AcaoDeValidacao, userId: string | null, eventos: EventoNovo[]): Promise<void> {
  if (eventos.length === 0) return
  await tx.insert(validacoes).values(eventos.map((e) => ({ orgId, ...e, userId, acao })))
}
