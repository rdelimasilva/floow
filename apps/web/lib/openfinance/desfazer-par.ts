import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { getDb, accounts, transactions, forecastMatchProposals } from '@floow/db'
import { ehPernaPrevista, SUFIXO_PERNA_PREVISTA } from './perna-prevista'

type Db = ReturnType<typeof getDb>

export type FormaDoPar = 'perna-real' | 'perna-prevista' | 'par-do-outro-lado' | 'sem-par'

export interface LancamentoDaRegra {
  id: string
  accountId: string
  amountCents: number
  description: string
  transferGroupId: string | null
  balanceApplied: boolean
  isIgnored: boolean
}

export interface PernaDoGrupo {
  id: string
  accountId: string
  amountCents: number
  externalId: string | null
  balanceApplied: boolean
  isIgnored: boolean
  matchedTransactionId: string | null
}

export interface AnaliseDoPar {
  forma: FormaDoPar
  pernas: PernaDoGrupo[]
  /** Delta de saldo por conta que desfazer aplica: o contrário da perna real que estava no saldo. */
  estorno: Record<string, number>
}

/**
 * Lê o par de um lançamento que uma regra classificou como transferência e
 * diz de que forma ele é (spec §5). Só lê: a prévia usa esta mesma função,
 * para os números da tela baterem com o que `desfazerParDaRegra` grava.
 */
export async function analisarPar(tx: Pick<Db, 'select'>, orgId: string, l: LancamentoDaRegra): Promise<AnaliseDoPar> {
  if (l.transferGroupId) {
    const pernas: PernaDoGrupo[] = await tx
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        amountCents: transactions.amountCents,
        externalId: transactions.externalId,
        balanceApplied: transactions.balanceApplied,
        isIgnored: transactions.isIgnored,
        matchedTransactionId: transactions.matchedTransactionId,
      })
      .from(transactions)
      .where(and(eq(transactions.orgId, orgId), eq(transactions.transferGroupId, l.transferGroupId), ne(transactions.id, l.id)))

    if (pernas.length === 0) return { forma: 'sem-par', pernas, estorno: {} }
    const prevista = pernas.every((p) => ehPernaPrevista(p.externalId))
    const estorno: Record<string, number> = {}
    if (!prevista) {
      for (const p of pernas) {
        // Ignorada já saiu do saldo mantendo `balance_applied = true`
        // (toggleIgnoreTransaction): estornar de novo tiraria duas vezes.
        if (p.balanceApplied && !p.isIgnored) estorno[p.accountId] = (estorno[p.accountId] ?? 0) - p.amountCents
      }
    }
    return { forma: prevista ? 'perna-prevista' : 'perna-real', pernas, estorno }
  }

  // Sem grupo: pode ser a ponta que a perna prevista de OUTRA conta espera.
  // Esse par foi decidido pela regra de lá; corrigir esta regra não o desfaz.
  // Só conta se quem espera é perna prevista (`:transfer-par`): conciliação
  // com previsão de template (aluguel, salário) não é par de transferência, e
  // a regra daqui é a única que classificou o lançamento.
  const casadas = await tx
    .select({ id: transactions.id, externalId: transactions.externalId })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.matchedTransactionId, l.id)))
  if (casadas.some((c) => ehPernaPrevista(c.externalId))) return { forma: 'par-do-outro-lado', pernas: [], estorno: {} }

  const propostas = await tx
    .select({ id: forecastMatchProposals.id, externalId: transactions.externalId })
    .from(forecastMatchProposals)
    .innerJoin(transactions, eq(transactions.id, forecastMatchProposals.forecastTransactionId))
    .where(and(
      eq(forecastMatchProposals.orgId, orgId),
      eq(forecastMatchProposals.realizedTransactionId, l.id),
      eq(forecastMatchProposals.status, 'pending'),
    ))
  if (propostas.some((p) => ehPernaPrevista(p.externalId))) return { forma: 'par-do-outro-lado', pernas: [], estorno: {} }

  return { forma: 'sem-par', pernas: [], estorno: {} }
}

const SUFIXO_PERNA_REAL = ':transfer-dest'

function ehPernaDaRegra(externalId: string | null): boolean {
  return externalId === null || externalId.endsWith(SUFIXO_PERNA_REAL) || externalId.endsWith(SUFIXO_PERNA_PREVISTA)
}

/**
 * Devolve o lançamento a `pending`, sem grupo e sem conta de destino, e
 * desfaz o que o par dele criou. O saldo do próprio lançamento não muda: é
 * dinheiro real do banco, e o valor com sinal é o mesmo em qualquer natureza.
 * Roda dentro da transação de `corrigirRegra`, que reaplica logo depois.
 */
export async function desfazerParDaRegra(
  tx: Db,
  orgId: string,
  l: LancamentoDaRegra,
): Promise<AnaliseDoPar & { realizadoDevolvidoId: string | null }> {
  const analise = await analisarPar(tx, orgId, l)
  if (analise.forma === 'par-do-outro-lado') return { ...analise, realizadoDevolvidoId: null }

  // Só apaga perna que a regra criou (`:transfer-dest`/`:transfer-par`) ou par
  // manual sem `external_id`. Outro formato é lançamento real de um banco no
  // mesmo grupo: apagá-lo sumiria com dinheiro do extrato. Lança antes de
  // qualquer escrita, e a transação de `corrigirRegra` volta inteira.
  if (analise.pernas.some((p) => !ehPernaDaRegra(p.externalId))) {
    throw new Error('Par com formato inesperado; corrija manualmente.')
  }

  for (const [contaId, delta] of Object.entries(analise.estorno)) {
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${delta}` })
      .where(and(eq(accounts.id, contaId), eq(accounts.orgId, orgId)))
  }

  let realizadoDevolvidoId: string | null = null
  if (analise.forma === 'perna-prevista') {
    const casada = analise.pernas.find((p) => p.matchedTransactionId)
    if (casada?.matchedTransactionId) {
      // `aprovarProposta` converteu o lançamento do outro banco em
      // transferência para cá. Sem a perna, esse par não existe mais: ele
      // volta para Classificar, como transferência sem conta.
      await tx
        .update(transactions)
        .set({ reviewState: 'pending', transferAccountId: null })
        .where(and(eq(transactions.id, casada.matchedTransactionId), eq(transactions.orgId, orgId)))
      realizadoDevolvidoId = casada.matchedTransactionId
    }
  }

  if (analise.pernas.length > 0) {
    // Apagar ANTES de reaplicar: o `external_id` derivado (`:transfer-dest`/
    // `:transfer-par`) volta a ser inserido e colidiria no índice único.
    // Propostas contra a perna caem por CASCADE (00047).
    await tx
      .delete(transactions)
      .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, analise.pernas.map((p) => p.id))))
  }

  await tx
    .update(transactions)
    .set({ reviewState: 'pending', transferGroupId: null, transferAccountId: null })
    .where(and(eq(transactions.id, l.id), eq(transactions.orgId, orgId)))

  return { ...analise, realizadoDevolvidoId }
}
