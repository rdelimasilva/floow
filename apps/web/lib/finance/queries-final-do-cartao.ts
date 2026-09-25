import { transactions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { and, count, desc, eq, inArray, isNotNull } from 'drizzle-orm'

export interface FinalDoCartao {
  digits: string
  /** Quantos lançamentos o final tem, para ordenar e mostrar ao lado. */
  total: number
}

/**
 * Finais de cartão das contas marcadas no filtro, do mais usado ao menos.
 *
 * Sem conta marcada não há opção: o final só tem sentido dentro da fatura de
 * um cartão, e somar os de todos misturaria finais iguais de bancos diferentes.
 */
export async function getFinaisDoCartao(orgId: string, contas: string[]): Promise<FinalDoCartao[]> {
  if (contas.length === 0) return []
  const linhas = await withUserDb((db) => db
    .select({ digits: transactions.cardLastDigits, total: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        inArray(transactions.accountId, contas),
        isNotNull(transactions.cardLastDigits),
      ),
    )
    .groupBy(transactions.cardLastDigits)
    .orderBy(desc(count()), transactions.cardLastDigits))
  return linhas.map((l) => ({ digits: l.digits!, total: Number(l.total) }))
}
