'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  recreateBankAuthorization,
  refreshBankConnection,
} from '@/lib/openfinance/connection-actions'
import { linkResourceToAccount } from '@/lib/openfinance/resource-actions'

interface Resource {
  id: string
  resourceType: string
  status: string
  accountId: string | null
  accountName: string | null
  displayLabel: string | null
}

interface AccountOption {
  id: string
  name: string
  type: string
}

interface LinkResourcesProps {
  connectionId: string
  status: string
  resources: Resource[]
  accounts: AccountOption[]
}

const RESOURCE_LABEL: Record<string, string> = {
  ACCOUNT: 'Conta corrente ou poupança',
  CREDIT_CARD_ACCOUNT: 'Cartão de crédito',
}

/** Conta do floow que faz sentido para cada tipo de recurso. */
const COMPATIBLE_TYPES: Record<string, string[]> = {
  ACCOUNT: ['checking', 'savings', 'cash'],
  CREDIT_CARD_ACCOUNT: ['credit_card'],
}

export function LinkResources({ connectionId, status, resources, accounts }: LinkResourcesProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState<Record<string, string>>({})

  function handleRefresh() {
    startTransition(async () => {
      try {
        const result = await refreshBankConnection(connectionId)
        toast(
          result.conflictingResourceCount > 0
            ? 'Parte das contas deste consentimento já pertence a outra organização.'
            : result.resources.length === 0
              ? 'O banco ainda não liberou as contas. Tente de novo em alguns minutos.'
              : 'Contas atualizadas.',
          result.conflictingResourceCount > 0 ? 'error' : undefined,
        )
        router.refresh()
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Não foi possível atualizar', 'error')
      }
    })
  }

  function handleReauthorize() {
    startTransition(async () => {
      try {
        const { authUrl } = await recreateBankAuthorization(connectionId)
        window.location.href = authUrl
      } catch (error) {
        toast(
          error instanceof Error ? error.message : 'Não foi possível reabrir a autorização',
          'error',
        )
      }
    })
  }

  function handleLink(resource: Resource) {
    const selected = choice[resource.id] ?? ''

    startTransition(async () => {
      try {
        await linkResourceToAccount(
          resource.id,
          selected === '__new__'
            ? { kind: 'new', name: newName[resource.id] ?? resource.displayLabel ?? '' }
            : { kind: 'existing', accountId: selected },
        )
        toast('Conta vinculada.')
        router.refresh()
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Não foi possível vincular', 'error')
      }
    })
  }

  if (status !== 'AUTHORISED') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-700">
          Esta conexão ainda não foi autorizada no banco. Se você já autorizou, o banco pode levar
          alguns minutos para confirmar.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Se a página do banco recusou o link, ele expirou: o prazo é de poucos minutos. Reabra a
          autorização e conclua em seguida, sem deixar para depois.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={handleReauthorize} disabled={pending}>
            Reabrir autorização
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={pending}>
            Verificar de novo
          </Button>
        </div>
      </div>
    )
  }

  if (resources.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-700">
          Autorização concluída. O banco ainda está enviando as contas.
        </p>
        <Button variant="outline" className="mt-4" onClick={handleRefresh} disabled={pending}>
          Verificar de novo
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Para cada conta liberada pelo banco, escolha uma conta que já existe no floow ou crie uma
        nova. O floow não adivinha: vincular à conta errada mistura dois históricos, e é trabalhoso
        de desfazer.
      </p>

      {resources.map((resource) => {
        const compatible = accounts.filter((a) =>
          (COMPATIBLE_TYPES[resource.resourceType] ?? []).includes(a.type),
        )
        const selected = choice[resource.id] ?? ''

        return (
          <article key={resource.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="font-medium text-foreground">
              {resource.displayLabel ?? RESOURCE_LABEL[resource.resourceType] ?? resource.resourceType}
            </p>
            {resource.displayLabel && (
              <p className="text-xs text-gray-500">
                {RESOURCE_LABEL[resource.resourceType] ?? resource.resourceType}
              </p>
            )}

            {resource.accountName ? (
              <p className="mt-2 text-sm text-gray-600">
                Vinculado a <span className="text-foreground">{resource.accountName}</span>
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <select
                  value={selected}
                  onChange={(e) => setChoice((prev) => ({ ...prev, [resource.id]: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Selecione...</option>
                  {compatible.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                  <option value="__new__">+ Criar conta nova</option>
                </select>

                {selected === '__new__' && (
                  <Input
                    // Pré-preenchido com o rótulo do recurso: é o nome que
                    // distingue este cartão do outro, e digitar de novo só
                    // convida a errar.
                    value={newName[resource.id] ?? resource.displayLabel ?? ''}
                    onChange={(e) => setNewName((prev) => ({ ...prev, [resource.id]: e.target.value }))}
                    placeholder="Nome da nova conta"
                  />
                )}

                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={
                      pending ||
                      !selected ||
                      (selected === '__new__' &&
                        !(newName[resource.id] ?? resource.displayLabel ?? '').trim())
                    }
                    onClick={() => handleLink(resource)}
                  >
                    Vincular
                  </Button>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
