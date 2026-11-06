'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import type { Account, Category } from '@floow/db'
import { TransactionForm } from '@/components/finance/transaction-form'
import { useToast } from '@/components/ui/toast'
import { EVENTO_NOVA_TRANSACAO } from '@/lib/paleta'
import { getOpcoesDaNovaTransacao } from '@/lib/finance/nova-transacao-actions'

type Opcoes = Awaited<ReturnType<typeof getOpcoesDaNovaTransacao>>

/**
 * Nova transação de qualquer tela, sem sair dela. Aberto pelo botão do menu,
 * pela tecla N e pela paleta (evento `EVENTO_NOVA_TRANSACAO`).
 *
 * Não é um <dialog> nativo: o showModal() põe o modal na camada de cima, e os
 * Selects do formulário (portal no body) ficariam por baixo dele.
 */
export function NovaTransacaoDialog() {
  const [aberto, setAberto] = useState(false)
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null)
  const [erro, setErro] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const caixaRef = useRef<HTMLDivElement>(null)
  const quemAbriu = useRef<HTMLElement | null>(null)

  const fechar = useCallback(() => {
    setAberto(false)
    quemAbriu.current?.focus()
  }, [])

  useEffect(() => {
    const abrir = () => {
      quemAbriu.current = document.activeElement as HTMLElement | null
      setAberto(true)
    }
    window.addEventListener(EVENTO_NOVA_TRANSACAO, abrir)
    return () => window.removeEventListener(EVENTO_NOVA_TRANSACAO, abrir)
  }, [])

  // Contas e categorias mudam fora daqui; busca de novo a cada abertura.
  useEffect(() => {
    if (!aberto) return
    let cancelado = false
    setOpcoes(null)
    setErro(false)
    getOpcoesDaNovaTransacao()
      .then((o) => { if (!cancelado) setOpcoes(o) })
      .catch(() => { if (!cancelado) setErro(true) })
    return () => { cancelado = true }
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    caixaRef.current?.focus()
    document.body.style.overflow = 'hidden'
    const aoTeclar = (e: KeyboardEvent) => {
      // Esc dentro de um Select aberto fecha só o Select.
      if (e.key === 'Escape' && !document.querySelector('[role="listbox"]')) fechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto, fechar])

  function aoSalvar() {
    fechar()
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/transactions')) {
      router.refresh()
      toast('Transação salva')
    } else {
      toast('Transação salva', 'success', { acao: { rotulo: 'Ver', onClick: () => router.push('/transactions') } })
    }
  }

  if (!aberto) return null

  return (
    // z-50 e depois do menu no DOM: cobre o menu; o Select, que entra no fim
    // do body, fica por cima.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && fechar()}
    >
      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-transacao-titulo"
        tabIndex={-1}
        className="w-full max-w-xl rounded-xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="nova-transacao-titulo" className="text-lg font-semibold text-gray-900">Nova transação</h2>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded p-1 text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          {erro ? (
            <p className="py-6 text-center text-sm text-gray-600">Não deu para carregar suas contas. Feche e tente de novo.</p>
          ) : !opcoes ? (
            <p className="py-6 text-center text-sm text-gray-500" aria-live="polite">Carregando…</p>
          ) : (
            <TransactionForm
              accounts={opcoes.accounts as Account[]}
              transferAccounts={opcoes.transferAccounts}
              categories={opcoes.categories as Category[]}
              onSuccess={aoSalvar}
            />
          )}
        </div>
      </div>
    </div>
  )
}
