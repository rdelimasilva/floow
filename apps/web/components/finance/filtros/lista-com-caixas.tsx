'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

interface Opcao<T extends string> {
  valor: T
  rotulo: React.ReactNode
  // Texto puro para o resumo do botão, quando `rotulo` não é string.
  rotuloTexto?: string
  grupo?: string
}

interface ListaComCaixasProps<T extends string> {
  rotulo: string
  rotuloTodos: string
  opcoes: Opcao<T>[]
  marcados: T[]
  aoMudar: (v: T[]) => void
  resumo?: (marcados: T[]) => string
  atalhos?: React.ReactNode
  alinhar?: 'esquerda' | 'direita'
}

/**
 * Botão com painel de caixas para filtros de várias escolhas.
 *
 * Clicar numa opção marcada desmarca só ela; "todos" é o atalho para o estado
 * neutro, que com muitas marcadas custaria um clique por item.
 */
export function ListaComCaixas<T extends string>({
  rotulo,
  rotuloTodos,
  opcoes,
  marcados,
  aoMudar,
  resumo,
  atalhos,
  alinhar = 'esquerda',
}: ListaComCaixasProps<T>) {
  const [aberto, setAberto] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!aberto) return
    // `mousedown` e não `click`: o painel não pode sumir antes do clique na caixa chegar.
    function fora(event: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(event.target as Node)) setAberto(false)
    }
    function esc(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setAberto(false)
      botaoRef.current?.focus()
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  let texto = rotuloTodos
  if (marcados.length > 0) {
    texto = resumo
      ? resumo(marcados)
      : marcados.length === 1
        ? rotuloDe(opcoes.find((o) => o.valor === marcados[0])) ?? '1 selecionado'
        : `${marcados.length} selecionados`
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        ref={botaoRef}
        type="button"
        aria-expanded={aberto}
        aria-haspopup="true"
        onClick={() => setAberto((v) => !v)}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs ${
          marcados.length > 0
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-200 bg-white text-gray-600'
        }`}
      >
        {texto}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {aberto && (
        <div
          role="group"
          aria-label={rotulo}
          className={`absolute ${alinhar === 'direita' ? 'right-0' : 'left-0'} z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg`}
        >
          <CorpoDaLista
            rotuloTodos={rotuloTodos}
            opcoes={opcoes}
            marcados={marcados}
            aoMudar={aoMudar}
            atalhos={atalhos}
          />
        </div>
      )}
    </div>
  )
}

function rotuloDe<T extends string>(o?: Opcao<T>): string | undefined {
  return o?.rotuloTexto ?? (typeof o?.rotulo === 'string' ? o.rotulo : undefined)
}

interface CorpoProps<T extends string> {
  rotuloTodos: string
  opcoes: Opcao<T>[]
  marcados: T[]
  aoMudar: (v: T[]) => void
  atalhos?: React.ReactNode
}

/** Só a lista (item "todos", atalhos e caixas): o cabeçalho da coluna a usa direto no popover que já tem. */
export function CorpoDaLista<T extends string>({ rotuloTodos, opcoes, marcados, aoMudar, atalhos }: CorpoProps<T>) {
  function alternar(valor: T) {
    aoMudar(marcados.includes(valor) ? marcados.filter((v) => v !== valor) : [...marcados, valor])
  }

  let grupoAtual: string | undefined
  return (
    <>
    <button
      type="button"
      onClick={() => aoMudar([])}
      disabled={marcados.length === 0}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
    >
      {marcados.length === 0 && <Check className="h-3.5 w-3.5 text-gray-900" />}
      {rotuloTodos}
    </button>
    {atalhos && (
      <>
        <div className="my-1 h-px bg-gray-100" />
        {atalhos}
      </>
    )}
    <div className="my-1 h-px bg-gray-100" />
    <div className="max-h-56 space-y-0.5 overflow-y-auto">
      {opcoes.map((opcao) => {
        const cabecalho = opcao.grupo !== grupoAtual && opcao.grupo
        grupoAtual = opcao.grupo
        return (
          <div key={opcao.valor}>
            {cabecalho && <p className="px-2 pt-1 text-xs font-medium text-gray-500">{cabecalho}</p>}
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={marcados.includes(opcao.valor)}
                onChange={() => alternar(opcao.valor)}
                className="rounded border-gray-300"
              />
              {opcao.rotulo}
            </label>
          </div>
        )
      })}
    </div>
    </>
  )
}
