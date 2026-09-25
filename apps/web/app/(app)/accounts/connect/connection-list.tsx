'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  recreateBankAuthorization,
  revokeBankConnection,
  syncBankConnection,
} from '@/lib/openfinance/connection-actions'
import type { BankConnectionSummary } from '@/lib/openfinance/queries'
import { concluirConexaoGuiada } from '@/lib/openfinance/conexao-guiada-actions'
import { abrirAutorizacao } from '@/lib/openfinance/abrir-autorizacao'
import { AvisoDeAutorizacao, useAtualizarAoVoltar } from './aguardando-autorizacao'
import { resumoDaConclusao } from './wizard-passos'
import { avisoDaAtualizacao } from './lista-conexoes'
import { useConcluirAoAbrir } from './concluir-ao-abrir'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { haQuantoTempo } from '@/lib/ha-quanto-tempo'

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
  // Qual botão da conexão está trabalhando — é ele que troca o rótulo.
  const [acao, setAcao] = useState<'importar' | 'buscar' | null>(null)
  const [paraEncerrar, setParaEncerrar] = useState<BankConnectionSummary | null>(null)
  // Conexão cuja autorização está aberta na aba do banco.
  const [aguardando, setAguardando] = useState<string | null>(null)

  // Voltou da aba do banco: relê o status pelo mesmo caminho de Buscar contas,
  // enquanto a conexão ainda espera autorização (recusada ou expirada não muda
  // mais sozinha).
  const esperandoBanco = connections.some((c) => c.id === aguardando && c.status === 'AWAITING_AUTHORIZATION')
  useAtualizarAoVoltar(esperandoBanco, () => {
    if (aguardando && !pending) handleRefresh(aguardando, true)
  })

  // Voltou por redirecionamento na mesma aba (pop-up bloqueado): conclui a
  // jornada guiada sem esperar o clique em Buscar contas.
  useConcluirAoAbrir(
    connections.filter((c) => c.autoVinculoPendente).map((c) => c.id),
    (id) => handleRefresh(id, true),
  )

  /** `automatico`: disparado pela volta à aba ou pela abertura, não pelo botão. */
  function handleRefresh(id: string, automatico = false) {
    const atual = connections.find((c) => c.id === id)
    const antes = { status: atual?.status ?? '', recursos: atual?.resources.length ?? 0 }
    setBusyId(id)
    setAcao('buscar')
    startTransition(async () => {
      try {
        // Mesmo refresh de sempre; se a conexão foi criada pelo wizard guiado
        // e ainda não aplicou o destino, vincula e importa aqui também.
        const guiada = await concluirConexaoGuiada(id)
        const result = guiada.atualizacao

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

        if (guiada.etapa === 'concluida') {
          const { texto, pendencia, erro } = resumoDaConclusao(guiada)
          toast([texto, pendencia, erro].filter(Boolean).join(' '), erro ? 'error' : undefined)
          return
        }

        const aviso = avisoDaAtualizacao(antes, result, automatico)
        if (aviso) toast(aviso)
      } catch (error) {
        toast(mensagemDeErro(error, 'Não foi possível buscar as contas'), 'error')
      } finally {
        setBusyId(null)
      }
    })
  }

  function handleSync(id: string) {
    setBusyId(id)
    setAcao('importar')
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
        toast(mensagemDeErro(error, 'Não foi possível importar os lançamentos'), 'error')
      } finally {
        setBusyId(null)
      }
    })
  }

  function handleReauthorize(id: string) {
    setBusyId(id)
    // Abre a aba em branco já no clique: o request_uri dentro do link é de uso
    // único e vale dezenas de segundos, e depois do await o navegador
    // bloquearia o pop-up. Guardar para clicar depois é o que produz
    // "request_uri is invalid or expired" na página do banco.
    const abertura = abrirAutorizacao(async () => (await recreateBankAuthorization(id)).authUrl)
    startTransition(async () => {
      try {
        const resultado = await abertura
        if (resultado === 'nova-aba') {
          setAguardando(id)
          setBusyId(null)
        } else if (resultado === 'sem-url') {
          toast('Não foi possível reabrir a autorização', 'error')
          setBusyId(null)
        }
      } catch (error) {
        toast(mensagemDeErro(error, 'Não foi possível reabrir a autorização'), 'error')
        setBusyId(null)
      }
    })
  }

  function handleRevoke(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        await revokeBankConnection(id)
        setParaEncerrar(null)
        toast('Conexão encerrada. As transações já importadas continuam no floow.')
      } catch (error) {
        toast(mensagemDeErro(error, 'Não foi possível encerrar'), 'error')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-500">Conexões</h2>

      <ConfirmDialog
        open={paraEncerrar !== null}
        onClose={() => setParaEncerrar(null)}
        onConfirm={() => paraEncerrar && handleRevoke(paraEncerrar.id)}
        title="Encerrar conexão"
        description={`O floow deixa de receber dados de ${paraEncerrar?.institutionName ?? 'este banco'}. As transações já importadas continuam aqui. Para reconectar, será preciso autorizar de novo no app do banco.`}
        confirmLabel="Encerrar conexão"
        loading={pending && busyId === paraEncerrar?.id}
      />

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
              <p className="mt-1 text-xs text-gray-500">
                {connection.lastSyncedAt
                  ? `Última importação: ${haQuantoTempo(connection.lastSyncedAt)}`
                  : 'Nenhuma importação ainda'}
              </p>
              {connection.executionStatus && (
                <p className="mt-1 text-xs text-gray-500">
                  {EXECUTION_LABEL[connection.executionStatus] ?? connection.executionStatus}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Consentimento <span className="select-all font-mono">{connection.polpConsentId}</span>
              </p>
            </div>

            <div className="flex gap-2">
              {connection.status === 'AUTHORISED' ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleSync(connection.id)}
                  disabled={pending && busyId === connection.id}
                >
                  {pending && busyId === connection.id && acao === 'importar' ? 'Importando...' : 'Importar lançamentos'}
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
                {pending && busyId === connection.id && acao === 'buscar' ? 'Buscando...' : 'Buscar contas'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setParaEncerrar(connection)}
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
                    {/* O rótulo distingue duas contas do mesmo banco; o tipo
                        genérico só serve para linha antiga, sem rótulo. */}
                    {resource.displayLabel ?? RESOURCE_LABEL[resource.resourceType] ?? resource.resourceType}
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

          {aguardando === connection.id && connection.status !== 'AUTHORISED' && (
            <div className="mt-3">
              <AvisoDeAutorizacao />
            </div>
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
              — use Buscar contas.
            </p>
          )}
        </article>
      ))}
    </section>
  )
}
