import { and, eq, isNull } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import type { FormaDoPar, LancamentoDaRegra } from './desfazer-par'

type Db = ReturnType<typeof getDb>

export interface RegraAtual {
  id: string
  nature: 'income' | 'expense' | 'transfer' | null
  categoryId: string | null
  transferAccountId: string | null
}

export interface PreviaCorrecao {
  mudam: number
  foraPorParDoOutroLado: { id: string; description: string }[]
  /** Delta de saldo por conta: estorno do par antigo + perna real nova. */
  deltas: Record<string, number>
}

/**
 * Os lançamentos que ainda seguem a decisão antiga da regra. O que diverge
 * foi exceção decidida à mão e fica como está (spec §4.2). Regra de
 * transferência sem conta (CPF próprio legado) leva todas as transferências
 * confirmadas da contraparte: cada uma foi decidida por lançamento.
 */
export async function selecionarLancamentosDaRegra(
  tx: Pick<Db, 'select'>,
  orgId: string,
  regra: RegraAtual,
): Promise<LancamentoDaRegra[]> {
  const conds = [
    eq(transactions.orgId, orgId),
    eq(transactions.counterpartyId, regra.id),
    eq(transactions.reviewState, 'confirmed'),
  ]
  if (regra.nature === 'transfer') {
    conds.push(eq(transactions.type, 'transfer'))
    if (regra.transferAccountId) conds.push(eq(transactions.transferAccountId, regra.transferAccountId))
  } else if (regra.nature) {
    conds.push(eq(transactions.type, regra.nature))
    conds.push(regra.categoryId ? eq(transactions.categoryId, regra.categoryId) : isNull(transactions.categoryId))
  } else {
    return []
  }

  return tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      description: transactions.description,
      transferGroupId: transactions.transferGroupId,
      balanceApplied: transactions.balanceApplied,
    })
    .from(transactions)
    .where(and(...conds))
}

/**
 * Soma o que a correção faria. `novaContaManual` é a conta de destino nova
 * quando ela é manual: lá `applyTransferSingle` cria perna real com
 * `balanceApplied` herdado da origem e move o saldo. Conta Open Finance,
 * receita/despesa e CPF próprio passam `null`: nada entra em saldo novo.
 */
export function somarPrevia(
  analises: { l: LancamentoDaRegra; forma: FormaDoPar; estorno: Record<string, number> }[],
  novaContaManual: string | null,
): PreviaCorrecao {
  const deltas: Record<string, number> = {}
  const somar = (conta: string, v: number) => {
    const total = (deltas[conta] ?? 0) + v
    if (total === 0) delete deltas[conta]
    else deltas[conta] = total
  }
  const fora: PreviaCorrecao['foraPorParDoOutroLado'] = []
  let mudam = 0

  for (const a of analises) {
    if (a.forma === 'par-do-outro-lado') {
      fora.push({ id: a.l.id, description: a.l.description })
      continue
    }
    mudam++
    for (const [conta, v] of Object.entries(a.estorno)) somar(conta, v)
    if (novaContaManual && a.l.balanceApplied) somar(novaContaManual, -a.l.amountCents)
  }
  return { mudam, foraPorParDoOutroLado: fora, deltas }
}
