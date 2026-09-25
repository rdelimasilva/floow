import { and, eq, isNull, ne, or } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import type { FormaDoPar, LancamentoDaRegra } from './desfazer-par'
import { contarNaContaNova } from './mesma-conta'

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
  /**
   * Selecionados que já estão na conta de destino nova. Transferência de uma
   * conta para ela mesma não existe: com algum aqui, `corrigirRegra` recusa e
   * a tela não deixa salvar.
   */
  naContaNova: number
}

/** A decisão que a correção vai gravar (a conta já passou por `contaQueARegraGrava`). */
export interface DecisaoAlvo {
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  transferAccountId: string | null
}

/**
 * Os lançamentos confirmados da regra que estão diferentes da decisão nova.
 *
 * Não dá para selecionar pelo que a regra diz hoje: se ela já foi salva uma
 * vez sem o histórico, aponta para a conta nova e os lançamentos antigos
 * ficaram na conta velha, e a busca não achava nenhum. O custo: uma exceção
 * decidida à mão também entra, e aparece na contagem da prévia.
 *
 * CPF próprio (transferência sem conta) é a exceção: "diferente da decisão"
 * seria tudo, inclusive o que foi decidido lançamento a lançamento. Ali vale
 * o que segue a regra atual.
 */
export async function selecionarLancamentosDaRegra(
  tx: Pick<Db, 'select'>,
  orgId: string,
  regra: RegraAtual,
  nova: DecisaoAlvo,
): Promise<LancamentoDaRegra[]> {
  const conds = [
    eq(transactions.orgId, orgId),
    eq(transactions.counterpartyId, regra.id),
    eq(transactions.reviewState, 'confirmed'),
  ]
  if (nova.nature === 'transfer' && !nova.transferAccountId) {
    if (regra.nature !== 'transfer') return []
    conds.push(eq(transactions.type, 'transfer'))
    if (regra.transferAccountId) conds.push(eq(transactions.transferAccountId, regra.transferAccountId))
  } else if (nova.nature === 'transfer') {
    conds.push(or(
      ne(transactions.type, 'transfer'),
      isNull(transactions.transferAccountId),
      ne(transactions.transferAccountId, nova.transferAccountId!),
    )!)
  } else {
    conds.push(or(
      ne(transactions.type, nova.nature),
      isNull(transactions.categoryId),
      ne(transactions.categoryId, nova.categoryId!),
    )!)
  }

  return tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      description: transactions.description,
      transferGroupId: transactions.transferGroupId,
      balanceApplied: transactions.balanceApplied,
      isIgnored: transactions.isIgnored,
    })
    .from(transactions)
    .where(and(...conds))
}

/**
 * Soma o que a correção faria. `novaContaManual` é a conta de destino nova
 * quando ela é manual: lá `applyTransferSingle` cria perna real com
 * `balanceApplied` e `isIgnored` herdados da origem, e só move o saldo se ela
 * estiver aplicada e não ignorada. Conta Open Finance,
 * receita/despesa e CPF próprio passam `null`: nada entra em saldo novo.
 */
export function somarPrevia(
  analises: { l: LancamentoDaRegra; forma: FormaDoPar; estorno: Record<string, number> }[],
  novaContaManual: string | null,
  contaNova: string | null = novaContaManual,
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
    if (novaContaManual && a.l.balanceApplied && !a.l.isIgnored) somar(novaContaManual, -a.l.amountCents)
  }
  return { mudam, foraPorParDoOutroLado: fora, deltas, naContaNova: contarNaContaNova(analises.map((a) => a.l), contaNova) }
}
