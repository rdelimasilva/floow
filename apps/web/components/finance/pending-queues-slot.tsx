import { PendingQueuesNotice } from '@/components/finance/pending-queues-notice'
import { contarDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { contarPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { contarLancamentosAClassificar } from '@/lib/openfinance/counterparty-queries'

/**
 * Busca as contagens das filas e anuncia as que têm algo.
 *
 * Separado da página para entrar num `<Suspense>`: são três transações sob RLS
 * que não mudam nada da lista, e esperar por elas atrasava a tela mais usada
 * do app.
 *
 * Falha numa contagem não derruba nada — o aviso daquela fila some. É o mesmo
 * "fail open" de antes: um controle não pode custar a tela que ele existe para
 * melhorar. Sem usuário resolvido (o layout já redirecionaria) as filas que
 * precisam dele contam zero.
 */
export async function PendingQueuesSlot({ orgId, userId }: { orgId: string; userId: string | null }) {
  const [repetidos, previsoes, classificar] = await Promise.all([
    userId === null ? 0 : contarDuplicatasPendentes(orgId, userId).catch(() => 0),
    userId === null ? 0 : contarPropostasPendentes(orgId, userId).catch(() => 0),
    contarLancamentosAClassificar(orgId).catch(() => 0),
  ])

  return <PendingQueuesNotice repetidos={repetidos} classificar={classificar} previsoes={previsoes} />
}
