'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  recreateBankAuthorization,
  refreshBankConnection,
  revokeBankConnection,
  syncBankConnection,
} from '@/lib/openfinance/connection-actions'
import type { BankConnectionSummary } from '@/lib/openfinance/queries'

/**
 * Rótulos dos status que o usuário vê.
 *
 * Dois deles enganam se traduzidos ao pé da letra e por isso são explicados na
 * própria interface: `PARTIAL_SUCCESS` não é falha (os dados principais já
 * estão lá e a Polp segue tentando o resto sozinha), e um recurso
 * `TEMPORARILY_UNAVAILABLE` volta — dizer que a conta caiu seria alarme falso.
 */
const STATUS_LABEL: Record<string, string> = {
  AWAITING_AUTHORIZATION: 'Aguardando autorização no banco',
  AUTHORISED: 'Conectado',
  REJECTED: 'Recusado pelo banco',
  EXPIRED: 'Expirado',
}

const EXECUTION_LABEL: Record<string, string> = {
  AWAITING_RESOURCES: 'O banco ainda está enviando os dados',
  SUCCESS: 'Dados importados',
  PARTIAL_SUCCESS: 'Dados disponíveis; parte do enriquecimento ainda em andamento',
}

const RESOURCE_LABEL: Record<string, string> = {
  ACCOUNT: 'Conta',
  CREDIT_CARD_ACCOUNT: 'Cartão de crédito',
}

const RESOURCE_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponível',
  UNAVAILABLE: 'Encerrado',
  TEMPORARILY_UNAVAILABLE: 'Indisponível no momento',
  PENDING_AUTHORISATION: 'Aguardando os demais titulares',
}

export function ConnectionList({ connections }: { connections: BankConnectionSummary[] }) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  function handleRefresh(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        const result = await refreshBankConnection(id)

        if (result.conflictingResourceCount > 0) {
          // Uma conta do banco pertence a exatamente uma organização: é assim
          // que o floow sabe de quem é cada transação que chega. Silenciar isso
          // deixaria a conta faltando na lista sem explicação.
          toast(
            `${result.conflictingResourceCount === 1 ? 'Uma conta' : `${result.conflictingResourceCount} contas`} deste consentimento já pertence a outra organização e não foi vinculada aqui.`,
            'error',
          )
          return
        }

        toast(
          result.pendingResourceCount > 0
            ? 'Atualizado. O banco ainda está preparando parte das contas.'
            : 'Conexão atualizada.',
        )
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Não foi possível atualizar', 'error')
      } finally {
        setBusyId(null)
      }
    })
  }

  function handleSync(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        const summary = await syncBankConnection(id)
        if (summary.skippedUnlinked > 0 && summary.imported === 0 && summary.updated === 0) {
          toast('Nenhuma conta vinculada ainda — escolha a conta de cada item primeiro.', 'error')
          return
        }
        const importadas =
          summary.imported === 0
            ? 'Nada novo desde a última sincronização.'
            : `${summary.imported} ${summary.imported === 1 ? 'transação importada' : 'transações importadas'}.`

        // Rejeitada não é o mesmo que perdida: fica registrada com o payload e
        // volta na próxima sincronização, porque a janela do recurso não
        // avança enquanto houver pendência. Dizer isso evita o susto de ver o
        // extrato incompleto sem explicação.
        toast(
          summary.rejected === 0
            ? importadas
            : `${importadas} ${summary.rejected} ${summary.rejected === 1 ? 'lançamento não pôde ser lido e será' : 'lançamentos não puderam ser lidos e serão'} tentado de novo.`,
          summary.rejected === 0 ? undefined : 'error',
        )
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Não foi possível sincronizar', 'error')
      } finally {
        setBusyId(null)
      }
    })
  }

  function handleReauthorize(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        const { authUrl } = await recreateBankAuthorization(id)
        // Redireciona na hora: o request_uri dentro do link é de uso único e
        // vale dezenas de segundos. Guardar para clicar depois é o que produz
        // "request_uri is invalid or expired" na página do banco.
        window.location.href = authUrl
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Não foi possível reabrir a autorização', 'error')
        setBusyId(null)
      }
    })
  }

  function handleRevoke(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        await revokeBankConnection(id)
        toast('Conexão encerrada. As transações já importadas continuam no floow.')
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Não foi possível encerrar', 'error')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-500">Conexões</h2>

      {connections.map((connection) => (
        <article key={connection.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">
                {connection.institutionName ?? 'Instituição'}
              </p>
              <p className="text-sm text-gray-500">
                CPF {connection.cpfMasked} · {STATUS_LABEL[connection.status] ?? connection.status}
              </p>
              {connection.executionStatus && (
                <p className="mt-1 text-xs text-gray-500">
                  {EXECUTION_LABEL[connection.executionStatus] ?? connection.executionStatus}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {connection.status === 'AUTHORISED' ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleSync(connection.id)}
                  disabled={pending && busyId === connection.id}
                >
                  Sincronizar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleReauthorize(connection.id)}
                  disabled={pending && busyId === connection.id}
                >
                  Reabrir autorização
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRefresh(connection.id)}
                disabled={pending && busyId === connection.id}
              >
                Atualizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRevoke(connection.id)}
                disabled={pending && busyId === connection.id}
              >
                Encerrar
              </Button>
            </div>
          </div>

          {connection.resources.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-gray-100 pt-3">
              {connection.resources.map((resource) => (
                <li key={resource.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-foreground">
                    {RESOURCE_LABEL[resource.resourceType] ?? resource.resourceType}
                    <span className="ml-2 text-xs text-gray-500">
                      {RESOURCE_STATUS_LABEL[resource.status] ?? resource.status}
                    </span>
                  </span>

                  {resource.accountName ? (
                    <span className="text-xs text-gray-500">Vinculado a {resource.accountName}</span>
                  ) : (
                    <Link
                      href={`/accounts/connect/${connection.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Escolher conta
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          {connection.status === 'AWAITING_AUTHORIZATION' && (
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
              A autorização no banco não foi concluída. O link tem validade de poucos minutos, então
              use Reabrir autorização e conclua o passo no banco em seguida.
            </p>
          )}

          {connection.status === 'AUTHORISED' && connection.resources.length === 0 && (
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
              Nenhuma conta disponível ainda. O banco pode levar alguns minutos para enviar os dados
              — use Atualizar.
            </p>
          )}
        </article>
      ))}
    </section>
  )
}
