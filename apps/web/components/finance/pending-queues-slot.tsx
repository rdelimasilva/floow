import { PendingQueuesNotice } from '@/components/finance/pending-queues-notice'
import { contarItensParaConciliar } from '@/lib/finance/itens-para-conciliar'

/**
 * Busca o total para conciliar e anuncia se houver algo.
 *
 * Separado da página para entrar num `<Suspense>`: são três transações sob RLS
 * que não mudam nada da lista, e esperar por elas atrasava a tela mais usada
 * do app. Falha numa contagem vale 0 (ver `contarItensParaConciliar`).
 */
export async function PendingQueuesSlot({ orgId, userId }: { orgId: string; userId: string | null }) {
  const { total, repetidos } = await contarItensParaConciliar(orgId, userId)
  return <PendingQueuesNotice total={total} repetidos={repetidos} />
}
