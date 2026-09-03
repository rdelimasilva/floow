'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { startBankConnection } from '@/lib/openfinance/connection-actions'

interface Institution {
  id: string
  name: string
  logoUrl: string | null
  type: string
}

interface ConnectWizardProps {
  institutions: Institution[]
  loadError: string | null
}

/**
 * Os produtos que o usuário pode conectar.
 *
 * A lista é curta de propósito. A Polp aceita cinco produtos e, se nenhum for
 * enviado, pede os cinco — crédito, investimentos e câmbio inclusive. Pedir
 * permissão de acesso contínuo a dado que o floow não usa seria cobrar do
 * usuário um consentimento maior do que o serviço prestado.
 */
const PRODUCTS = [
  {
    value: 'ACCOUNT',
    label: 'Conta corrente e poupança',
    hint: 'Saldo e extrato das contas de depósito.',
  },
  {
    value: 'CREDIT_CARD_ACCOUNT',
    label: 'Cartão de crédito',
    hint: 'Compras, faturas e parcelas.',
  },
] as const

export function ConnectWizard({ institutions, loadError }: ConnectWizardProps) {
  const { toast } = useToast()
  const [institutionId, setInstitutionId] = useState('')
  const [search, setSearch] = useState('')
  const [cpf, setCpf] = useState('')
  const [products, setProducts] = useState<string[]>(['ACCOUNT', 'CREDIT_CARD_ACCOUNT'])
  const [submitting, setSubmitting] = useState(false)

  const filtered = search
    ? institutions.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : institutions

  const selected = institutions.find((i) => i.id === institutionId)

  function toggleProduct(value: string) {
    setProducts((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)

    try {
      const result = await startBankConnection({
        institutionId,
        institutionName: selected?.name,
        cpf,
        products,
      })

      if (!result.authUrl) {
        toast('Consentimento criado, mas o banco não devolveu o link de autorização.', 'error')
        return
      }

      // O usuário sai do floow para autorizar no banco e volta pela tela da
      // conexão. O link tem validade curta, por isso o redirecionamento é
      // imediato em vez de ficar guardado para depois.
      window.location.href = result.authUrl
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível iniciar a conexão', 'error')
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {loadError}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-gray-200 bg-white p-6">
      <div className="space-y-1.5">
        <Label htmlFor="institution-search">Banco</Label>
        <Input
          id="institution-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar banco pelo nome"
          autoComplete="off"
        />
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-1 py-3 text-sm text-gray-500">Nenhum banco encontrado.</p>
          ) : (
            filtered.map((institution) => (
              <label
                key={institution.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  institutionId === institution.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="institution"
                  value={institution.id}
                  checked={institutionId === institution.id}
                  onChange={() => setInstitutionId(institution.id)}
                  className="border-gray-300"
                />
                {institution.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={institution.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                )}
                <span className="text-foreground">{institution.name}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cpf">CPF do titular</Label>
        <Input
          id="cpf"
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
          placeholder="000.000.000-00"
          inputMode="numeric"
          autoComplete="off"
          required
        />
        <p className="text-xs text-gray-500">
          Usado só para criar o consentimento no banco. O floow guarda uma versão mascarada e um
          código irreversível — o número em si não fica armazenado.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">O que conectar</legend>
        {PRODUCTS.map((product) => (
          <label
            key={product.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={products.includes(product.value)}
              onChange={() => toggleProduct(product.value)}
              className="mt-1 rounded border-gray-300"
            />
            <span>
              <span className="block text-sm text-foreground">{product.label}</span>
              <span className="block text-xs text-gray-500">{product.hint}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-gray-500">
          O banco só compartilha o que estiver marcado aqui. Dá para mudar depois refazendo a
          conexão.
        </p>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={submitting || !institutionId || products.length === 0}>
          {submitting ? 'Abrindo o banco...' : 'Autorizar no banco'}
        </Button>
      </div>
    </form>
  )
}
