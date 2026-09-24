/**
 * Aplicação e resgate do extrato chegam como transferência sem conta de
 * destino (`transfer_account_id` nulo): saem do fluxo de caixa, mas o dinheiro
 * não aparece em lugar nenhum. Aqui cada um é ligado à conta de investimentos
 * da MESMA conexão, com a segunda perna montada exatamente como `persistPage`
 * (`sync.ts`) faz quando a transferência já vem com destino.
 *
 * Idempotente: só pega linha ainda sem destino, a perna tem `external_id`
 * derivado (`:transfer-dest`, único por conta) e o saldo só anda pelo que
 * entrou de fato. Escolha manual (linha que já tem destino) nunca é tocada.
 *
 * A conta de investimentos é `brokerage`, fora do patrimônio e dos seletores
 * de lançamento — ligar aqui não conta o dinheiro duas vezes.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { accounts, openfinanceResources, transactions, type getDb, type NewTransaction } from '@floow/db'
import { buildTransferLegRow } from '../transfer-leg'
import { sumAppliedDeltasByAccount } from '../sync'

type Db = ReturnType<typeof getDb>

export const POLP_TYPES_DE_APLICACAO = ['APLICACAO_FINANCEIRA', 'RESGATE_APLIC_FINANCEIRA'] as const

export interface AplicacaoOrfa {
  id: string
  orgId: string
  amountCents: number
  date: Date
  externalId: string
  balanceApplied: boolean
  transferGroupId: string | null
  transferAccountId: string | null
}

export interface Vinculo {
  id: string
  transferGroupId: string
  perna: NewTransaction
}

/**
 * Parte pura: o que gravar para cada linha órfã. Linha com destino já
 * escolhido fica de fora; sem conta de investimentos, não há o que ligar.
 */
export function montarVinculos(
  linhas: AplicacaoOrfa[],
  contaInvestimentoId: string | null,
  novoGrupo: () => string = () => crypto.randomUUID(),
): Vinculo[] {
  if (!contaInvestimentoId) return []
  return linhas
    .filter((l) => l.transferAccountId === null)
    .map((l) => {
      const transferGroupId = l.transferGroupId ?? novoGrupo()
      return {
        id: l.id,
        transferGroupId,
        perna: buildTransferLegRow(
          { orgId: l.orgId, amountCents: l.amountCents, date: l.date, externalId: l.externalId, balanceApplied: l.balanceApplied },
          contaInvestimentoId,
          transferGroupId,
        ),
      }
    })
}

/** Liga as aplicações/resgates órfãos da conexão. Devolve quantas ligou. */
export async function vincularAplicacoesOrfas(
  db: Db,
  conexao: { id: string; orgId: string },
  contaInvestimentoId: string | null,
): Promise<number> {
  if (!contaInvestimentoId) return 0

  // Só contas de extrato desta conexão (recurso ACCOUNT), nunca de outra.
  const contasDaConexao = db
    .select({ accountId: openfinanceResources.accountId })
    .from(openfinanceResources)
    .where(and(
      eq(openfinanceResources.orgId, conexao.orgId),
      eq(openfinanceResources.connectionId, conexao.id),
      eq(openfinanceResources.resourceType, 'ACCOUNT'),
      isNotNull(openfinanceResources.accountId),
    ))

  const linhas = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      externalId: transactions.externalId,
      balanceApplied: transactions.balanceApplied,
      transferGroupId: transactions.transferGroupId,
    })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, conexao.orgId),
      inArray(transactions.accountId, contasDaConexao),
      inArray(transactions.polpType, [...POLP_TYPES_DE_APLICACAO]),
      eq(transactions.type, 'transfer'),
      isNull(transactions.transferAccountId),
      eq(transactions.isIgnored, false),
      // A perna deriva o external_id da origem; sem ele não há idempotência.
      isNotNull(transactions.externalId),
    ))

  const vinculos = montarVinculos(
    linhas.map((l) => ({
      ...l,
      orgId: conexao.orgId,
      date: new Date(l.date),
      externalId: l.externalId!,
      transferAccountId: null,
    })),
    contaInvestimentoId,
  )
  if (vinculos.length === 0) return 0

  return db.transaction(async (tx) => {
    // `transfer_account_id IS NULL` de novo no UPDATE: se outra sincronização
    // ou o usuário ligou a linha entre a leitura e aqui, ela fica como está e
    // não ganha perna — senão o grupo da perna e o da origem divergiriam.
    const ligados: Vinculo[] = []
    for (const v of vinculos) {
      const [ok] = await tx
        .update(transactions)
        .set({ transferAccountId: contaInvestimentoId, transferGroupId: v.transferGroupId })
        .where(and(
          eq(transactions.id, v.id),
          eq(transactions.orgId, conexao.orgId),
          isNull(transactions.transferAccountId),
        ))
        .returning({ id: transactions.id })
      if (ok) ligados.push(v)
    }
    if (ligados.length === 0) return 0

    const pernas = await tx
      .insert(transactions)
      .values(ligados.map((v) => v.perna))
      .onConflictDoNothing()
      .returning({
        accountId: transactions.accountId,
        amountCents: transactions.amountCents,
        applied: transactions.balanceApplied,
      })

    // Só a perna que entrou de fato e já está aplicada move o saldo.
    for (const [accountId, delta] of sumAppliedDeltasByAccount(pernas)) {
      if (delta === 0) continue
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${delta}` })
        .where(and(eq(accounts.id, accountId), eq(accounts.orgId, conexao.orgId)))
    }
    return ligados.length
  })
}
