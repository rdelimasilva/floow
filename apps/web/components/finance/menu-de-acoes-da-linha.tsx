'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  MoreHorizontal, Zap, SlidersHorizontal, Unlink, XCircle, Eye, EyeOff, Trash2, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { podeDesconciliar } from '@/lib/finance/desconciliar'
import { rotuloDeRemocao } from '@/lib/finance/delete-copy'
import type { TransactionRowData } from './transaction-list-types'

export interface ItemDoMenu {
  rotulo: string
  icone: LucideIcon
  onSelect?: () => void
  href?: string
  perigo?: boolean
  disabled?: boolean
}

interface AcoesDaLinha {
  onCreateRule: (matchValue: string, categoryId: string) => void
  onUnreconcile: (tx: TransactionRowData) => void
  onCancelRecurring: (templateId: string, description: string) => void
  onIgnore: (tx: TransactionRowData) => void
  onDelete: (tx: TransactionRowData) => void
}

/**
 * Ações secundárias da linha, na ordem em que aparecem no menu. Editar e a
 * pílula de fluxo de caixa ficam fora: uma é a ação mais usada, a outra mostra
 * estado.
 */
export function itensDaLinha(tx: TransactionRowData, acoes: AcoesDaLinha, loading: boolean): ItemDoMenu[] {
  const itens: ItemDoMenu[] = []
  // Transferência não tem categoria; sem categoria, o diálogo pede uma.
  if (tx.type !== 'transfer') {
    itens.push({
      rotulo: tx.categoryId ? 'Categorizar todas como esta' : 'Criar regra para lançamentos como este',
      icone: Zap,
      onSelect: () => acoes.onCreateRule(tx.description, tx.categoryId ?? ''),
    })
  }
  if (tx.counterpartyId) {
    itens.push({ rotulo: 'Corrigir regra', icone: SlidersHorizontal, href: `/transactions/review?regra=${tx.counterpartyId}` })
  }
  if (podeDesconciliar(tx)) {
    itens.push({ rotulo: 'Desconciliar', icone: Unlink, onSelect: () => acoes.onUnreconcile(tx) })
  }
  if (tx.recurringTemplateId) {
    const id = tx.recurringTemplateId
    itens.push({ rotulo: 'Cancelar recorrência', icone: XCircle, onSelect: () => acoes.onCancelRecurring(id, tx.description) })
  }
  if (tx.externalId) {
    itens.push({
      rotulo: tx.isIgnored ? 'Restaurar transação' : 'Ignorar transação',
      icone: tx.isIgnored ? Eye : EyeOff,
      onSelect: () => acoes.onIgnore(tx),
      disabled: loading,
    })
  } else {
    itens.push({ rotulo: rotuloDeRemocao(tx), icone: Trash2, onSelect: () => acoes.onDelete(tx), perigo: true })
  }
  return itens
}

/**
 * Botão "⋯" com o menu das ações. O menu vai para o body em posição fixa: a
 * tabela rola na horizontal e cortaria um menu absoluto nas últimas linhas.
 */
export function MenuDeAcoes({ itens, tamanho }: { itens: ItemDoMenu[]; tamanho: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const aberto = pos !== null

  useEffect(() => {
    if (!aberto) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const fora = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) setPos(null)
    }
    const fechar = () => setPos(null)
    document.addEventListener('mousedown', fora)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
    }
  }, [aberto])

  if (itens.length === 0) return null

  function alternar() {
    if (aberto) return setPos(null)
    const r = botao.current!.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }

  function teclado(e: React.KeyboardEvent) {
    const lista = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const atual = lista.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      setPos(null)
      botao.current?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const passo = e.key === 'ArrowDown' ? 1 : -1
      lista[(atual + passo + lista.length) % lista.length]?.focus()
    }
  }

  const classeItem = (perigo?: boolean) =>
    cn(
      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none disabled:opacity-50',
      perigo ? 'text-red-600 hover:bg-red-50 focus:bg-red-50' : 'text-gray-700 hover:bg-gray-100 focus:bg-gray-100',
    )

  return (
    <>
      <button
        ref={botao}
        type="button"
        title="Mais ações"
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={alternar}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <MoreHorizontal className={tamanho} />
      </button>
      {aberto &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label="Ações do lançamento"
            onKeyDown={teclado}
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
            className="z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {itens.map((item) =>
              item.href ? (
                <Link key={item.rotulo} href={item.href} role="menuitem" onClick={() => setPos(null)} className={classeItem()}>
                  <item.icone className="h-4 w-4 shrink-0" aria-hidden />
                  {item.rotulo}
                </Link>
              ) : (
                <button
                  key={item.rotulo}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setPos(null)
                    item.onSelect?.()
                  }}
                  className={classeItem(item.perigo)}
                >
                  <item.icone className="h-4 w-4 shrink-0" aria-hidden />
                  {item.rotulo}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
