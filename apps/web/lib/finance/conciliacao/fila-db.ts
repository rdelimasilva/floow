import { and, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm'
import { accounts, categories, forecastMatchProposals, openfinanceConnections, openfinanceResources, transactions, type RlsTx } from '@floow/db'
import { withUserDb, withUserDbFor } from '@/lib/db/rls'
import { lerDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { lerPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { lerGruposPendentes } from '@/lib/openfinance/counterparty-queries'
import { condicaoDeRealizadoSemVinculo, JANELA_BUSCA_DIAS } from '@/lib/finance/forecast-match-db'
import { escolherCandidatas, type Candidata } from './candidatos'
import { montarFila, LOTE_DA_FILA, JANELA_FILA_DIAS, type ItemDaFila, type LancamentoBase } from './fila'

/**
 * Lê tudo que a fila do modo foco precisa numa transação RLS só (spec §3, §4).
 * Sequencial de propósito: é uma conexão só.
 */
const DIA_EM_MS = 24 * 60 * 60 * 1000
const iso = (d: Date | string | null) => (d === null ? null : d instanceof Date ? d.toISOString() : String(d))

export async function lerFila(db: RlsTx, orgId: string, hoje = new Date()): Promise<ItemDaFila[]> {
  const duplicatas = await lerDuplicatasPendentes(db, orgId)
  const propostas = await lerPropostasPendentes(db, orgId)
  const grupos = await lerGruposPendentes(db, orgId)

  const desde = new Date(hoje.getTime() - JANELA_FILA_DIAS * DIA_EM_MS)
  const recentes = await db
    .select({ id: transactions.id, accountId: transactions.accountId, date: transactions.date, amountCents: transactions.amountCents })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId), eq(transactions.origem, 'extrato'), eq(transactions.isIgnored, false),
      gte(transactions.date, desde), condicaoDeRealizadoSemVinculo(),
    ))

  const previsoes = await db
    .select({
      id: transactions.id, accountId: transactions.accountId, contaNome: accounts.name, date: transactions.date,
      amountCents: transactions.amountCents, description: transactions.description, categoriaNome: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      eq(transactions.orgId, orgId), eq(transactions.balanceApplied, false), isNull(transactions.matchedTransactionId),
      eq(transactions.isIgnored, false), ne(transactions.origem, 'extrato'),
      gte(transactions.date, new Date(desde.getTime() - JANELA_BUSCA_DIAS * DIA_EM_MS)),
      lte(transactions.date, new Date(hoje.getTime() + JANELA_BUSCA_DIAS * DIA_EM_MS)),
    ))
  const abertas = previsoes.map((p) => ({ ...p, date: iso(p.date)! }))

  const recusas = await db
    .select({ previsaoId: forecastMatchProposals.forecastTransactionId, realizadoId: forecastMatchProposals.realizedTransactionId })
    .from(forecastMatchProposals)
    .where(and(eq(forecastMatchProposals.orgId, orgId), eq(forecastMatchProposals.status, 'refused')))
  const recusadasPor = new Map<string, Set<string>>()
  for (const r of recusas) recusadasPor.set(r.realizadoId, (recusadasPor.get(r.realizadoId) ?? new Set()).add(r.previsaoId))
  const propostaPor = new Map(propostas.map((p) => [p.realizado.id, { id: p.id, previsaoId: p.previsao.id }]))

  const candidatas = new Map<string, Candidata[]>()
  for (const r of recentes) {
    const escolhidas = escolherCandidatas({ ...r, date: iso(r.date)! }, abertas, {
      proposta: propostaPor.get(r.id) ?? null, recusadas: recusadasPor.get(r.id),
    })
    if (escolhidas.length > 0) candidatas.set(r.id, escolhidas)
  }

  const ids = [...new Set([
    ...candidatas.keys(), ...duplicatas.map((d) => d.duplicata.id), ...grupos.flatMap((g) => g.items.map((i) => i.id)),
  ])]
  if (ids.length === 0) return []

  const linhas = await db
    .select({
      id: transactions.id, date: transactions.date, description: transactions.description, amountCents: transactions.amountCents,
      cardLastDigits: transactions.cardLastDigits, importedAt: transactions.importedAt, vinculoRevisadoEm: transactions.vinculoRevisadoEm,
      contaId: accounts.id, contaNome: accounts.name, contaTipo: accounts.type, agencia: accounts.branch, numero: accounts.accountNumber,
      instituicao: openfinanceConnections.institutionName,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(openfinanceResources, eq(openfinanceResources.accountId, accounts.id))
    .leftJoin(openfinanceConnections, eq(openfinanceConnections.id, openfinanceResources.connectionId))
    .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, ids)))

  const lancamentos = new Map<string, LancamentoBase>()
  for (const l of linhas) {
    if (lancamentos.has(l.id)) continue // conta com mais de um recurso OF: a primeira linha basta
    lancamentos.set(l.id, {
      id: l.id, date: iso(l.date)!, description: l.description, amountCents: l.amountCents,
      cardLastDigits: l.cardLastDigits, importedAt: iso(l.importedAt), vinculoRevisado: l.vinculoRevisadoEm !== null,
      conta: { id: l.contaId, nome: l.contaNome, tipo: l.contaTipo, instituicao: l.instituicao, agencia: l.agencia, numero: l.numero },
    })
  }
  return montarFila({ lancamentos, candidatas, duplicatas, grupos })
}

export function contar(fila: ItemDaFila[]) {
  return {
    repetidos: fila.filter((i) => i.repetido).length,
    classificar: fila.filter((i) => i.classificacao).length,
    confirmar: fila.filter((i) => i.candidatas.length > 0).length,
    total: fila.length,
  }
}
export type ContagemDaFila = ReturnType<typeof contar>

export async function carregarFila(orgId: string) {
  const fila = await withUserDb((db) => lerFila(db, orgId))
  return { itens: fila.slice(0, LOTE_DA_FILA), total: fila.length }
}

export async function contarFila(orgId: string, userId: string): Promise<ContagemDaFila> {
  return contar(await withUserDbFor(userId, (db) => lerFila(db, orgId)))
}
