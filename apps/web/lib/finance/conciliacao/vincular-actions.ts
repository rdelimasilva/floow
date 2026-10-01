'use server'

import { getDb } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { revalidateTransactionData } from '@/lib/finance/revalidate'
import { vincularNoBanco } from './vincular-db'

type Db = ReturnType<typeof getDb>

/** "Vincular" do card (spec §5.1). `false` = o par deixou de valer; a tela tira o card e avisa. */
export async function vincularPrevisao(realizadoId: string, previsaoId: string): Promise<{ efetivada: boolean }> {
  const orgId = await getOrgId()
  const efetivada = await getDb().transaction((tx) => vincularNoBanco(tx as unknown as Db, orgId, realizadoId, previsaoId))
  if (efetivada) revalidateTransactionData(orgId)
  return { efetivada }
}
