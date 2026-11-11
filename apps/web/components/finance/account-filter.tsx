'use client'

import { ListaComCaixas } from '@/components/finance/filtros/lista-com-caixas'

interface AccountOption {
  id: string
  name: string
  titular?: string | null
}

interface AccountFilterProps {
  accounts: AccountOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  naGaveta?: boolean
}

/**
 * As contas de cada pessoa, em ordem de nome. Vazio com menos de duas
 * pessoas: com um titular só, "só as dele" é o mesmo que todas.
 */
export function contasPorTitular(accounts: AccountOption[]): [string, string[]][] {
  const grupos = new Map<string, string[]>()
  for (const a of accounts) {
    if (!a.titular) continue
    grupos.set(a.titular, [...(grupos.get(a.titular) ?? []), a.id])
  }
  if (grupos.size < 2) return []
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
}

function mesmasContas(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

function rotulo(accounts: AccountOption[], selected: string[]): string {
  if (selected.length === 0) return 'Todas as contas'
  const pessoa = contasPorTitular(accounts).find(([, ids]) => mesmasContas(ids, selected))
  if (pessoa) return pessoa[0]
  if (selected.length === 1) {
    return accounts.find((a) => a.id === selected[0])?.name ?? '1 conta'
  }
  return `${selected.length} contas`
}

/**
 * Filtro de conta com várias escolhas.
 *
 * Era um `<select>` de escolha única: ver Itaú + Nubank juntos, sem a
 * corretora no meio, não tinha como — ou uma conta, ou todas. Um `<select
 * multiple>` resolveria no papel e não na mão: exige ctrl+clique para somar,
 * e um clique solto apaga a seleção inteira sem avisar.
 *
 * Daí a lista de caixas. Clicar numa conta marcada desmarca só ela, que é a
 * mesma regra das outras pílulas do filtro: o controle é o próprio
 * interruptor.
 */
export function AccountFilter({ accounts, selected, onChange, naGaveta }: AccountFilterProps) {
  const pessoas = contasPorTitular(accounts)

  return (
    <ListaComCaixas
      naGaveta={naGaveta}
      rotulo="Conta"
      rotuloTodos="Todas as contas"
      opcoes={accounts.map((a) => ({ valor: a.id, rotulo: a.name }))}
      marcados={selected}
      aoMudar={onChange}
      resumo={(ids) => rotulo(accounts, ids)}
      atalhos={
        // Atalho da família: marca só as contas de uma pessoa.
        pessoas.length > 0 ? (
          <div className="flex flex-wrap gap-1 px-1 py-1">
            {pessoas.map(([nome, ids]) => {
              const ativa = mesmasContas(ids, selected)
              return (
                <button
                  key={nome}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => onChange(ativa ? [] : ids)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    ativa ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {nome}
                </button>
              )
            })}
          </div>
        ) : undefined
      }
    />
  )
}
