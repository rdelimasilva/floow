'use server'

import { z } from 'zod'
import { getDb } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { desconciliarNoBanco } from './desconciliar-db'
import type { FilaDeOrigem } from './desconciliar'

type Db = ReturnType<typeof getDb>

/**
 * Devolve o lançamento à fila onde foi conciliado. Tudo numa transação: o
 * par desfeito estorna saldo e apaga a perna, e meio caminho deixaria a
 * conta de destino com dinheiro que não existe.
 */
export async function desconciliarLancamento(transactionId: string): Promise<{ fila: FilaDeOrigem }> {
  const id = z.string().uuid().parse(transactionId)
  const orgId = await getOrgId()
  const db = getDb()

  const fila = await db.transaction(async (tx) => desconciliarNoBanco(tx as unknown as Db, orgId, id))

  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)
  revalidateTransactionData(orgId)
  return { fila }
}
