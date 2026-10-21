'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

interface AccountOption {
  id: string
  name: string
  titular?: string | null
}

interface AccountFilterProps {
  accounts: AccountOption[]
  selected: string[]
  onChange: (ids: string[]) => void
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
export function AccountFilter({ accounts, selected, onChange }: AccountFilterProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const pessoas = contasPorTitular(accounts)

  // Fecha ao clicar fora. `mousedown` e nao `click` para o painel nao sumir
  // antes do clique chegar na caixa que o usuario mirou.
  useEffect(() => {
    if (!open) return
    function handler(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id])
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs ${
          selected.length > 0
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-200 bg-white text-gray-600'
        }`}
      >
        {rotulo(accounts, selected)}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
          {/* Atalho para o estado neutro, que com muitas contas marcadas
              custaria um clique por conta. */}
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
          >
            {selected.length === 0 && <Check className="h-3.5 w-3.5 text-gray-900" />}
            Todas as contas
          </button>
          {/* Atalho da família: marca só as contas de uma pessoa. */}
          {pessoas.length > 0 && (
            <>
              <div className="my-1 h-px bg-gray-100" />
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
            </>
          )}
          <div className="my-1 h-px bg-gray-100" />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {accounts.map((account) => (
              <label
                key={account.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(account.id)}
                  onChange={() => toggle(account.id)}
                  className="rounded border-gray-300"
                />
                {account.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
