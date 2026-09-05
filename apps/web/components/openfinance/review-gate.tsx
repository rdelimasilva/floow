import { Suspense } from 'react'
import { CounterpartyQueue } from './counterparty-queue'

/**
 * Tela cheia que o layout renderiza NO LUGAR do app — não ao lado — enquanto
 * o portão da org está fechado. Sem AppShell, sem sidebar: a única coisa que
 * existe na tela é a fila.
 */
export function ReviewGate({ orgId }: { orgId: string }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold text-gray-900">Antes de continuar</h1>
        <p className="mt-1 text-sm text-gray-600">
          O banco mandou lançamentos que o floow não sabe classificar sozinho. Revise cada
          contraparte uma vez — as próximas sincronizações não perguntam de novo.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <CounterpartyQueue orgId={orgId} mode="blocking" />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
