'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Wallet, ArrowLeftRight, TrendingUp, Tags, BarChart3,
  PiggyBank, Target, Building2, Landmark, HelpCircle, Search,
  Bot, Gauge, RefreshCw, Settings, Coins, Plus,
} from 'lucide-react'
import { EVENTO_ABRIR_PALETA } from '@/lib/paleta'

interface CommandItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  keywords: string[]
}

export const COMMANDS: CommandItem[] = [
  { label: 'Nova transação', href: '/transactions?nova=1', icon: Plus, keywords: ['lancar', 'registrar', 'despesa', 'receita', 'adicionar'] },
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, keywords: ['inicio', 'home', 'visao geral'] },
  { label: 'Consultor Financeiro', href: '/cfo', icon: Bot, keywords: ['cfo', 'assistente', 'chat', 'insights'] },
  { label: 'Fluxo de Caixa', href: '/cash-flow', icon: BarChart3, keywords: ['fluxo', 'caixa', 'grafico'] },
  { label: 'Transações', href: '/transactions', icon: ArrowLeftRight, keywords: ['extrato', 'lancamentos'] },
  { label: 'Importar Extrato', href: '/transactions/import', icon: ArrowLeftRight, keywords: ['importar', 'ofx', 'csv', 'banco'] },
  { label: 'Recorrentes', href: '/transactions/recurring', icon: RefreshCw, keywords: ['recorrencia', 'parcelas', 'fixas', 'mensal'] },
  { label: 'Classificar lançamentos', href: '/transactions/review', icon: ArrowLeftRight, keywords: ['revisar', 'contraparte', 'fila', 'pendente', 'classificar'] },
  { label: 'Ritmo de Gastos', href: '/budgets/pacing', icon: Gauge, keywords: ['ritmo', 'pacing', 'gastos do mes'] },
  { label: 'Plano de Gastos', href: '/budgets/spending', icon: PiggyBank, keywords: ['orcamento', 'gastos', 'limite', 'meta'] },
  { label: 'Meta de Investimentos', href: '/budgets/investing', icon: Target, keywords: ['aporte', 'investir', 'meta'] },
  { label: 'Investimentos', href: '/investments', icon: TrendingUp, keywords: ['carteira', 'portfolio', 'acoes', 'fundos'] },
  { label: 'Resumo da Carteira', href: '/investments/dashboard', icon: TrendingUp, keywords: ['alocacao', 'patrimonio', 'evolucao'] },
  { label: 'Renda passiva', href: '/investments/income', icon: Coins, keywords: ['dividendos', 'proventos', 'juros'] },
  { label: 'Bens Imóveis', href: '/fixed-assets', icon: Building2, keywords: ['imovel', 'carro', 'bens'] },
  { label: 'Controle de Dívidas', href: '/debts', icon: Landmark, keywords: ['divida', 'emprestimo', 'financiamento'] },
  { label: 'Planejamento', href: '/planning', icon: Target, keywords: ['aposentadoria', 'fi', 'simulacao'] },
  { label: 'Simulação', href: '/planning/simulation', icon: BarChart3, keywords: ['cenario', 'projecao'] },
  { label: 'Plano Sucessório', href: '/planning/succession', icon: HelpCircle, keywords: ['heranca', 'itcmd', 'herdeiros'] },
  { label: 'Contas', href: '/accounts', icon: Wallet, keywords: ['conta corrente', 'poupanca', 'cartao'] },
  { label: 'Categorias', href: '/categories', icon: Tags, keywords: ['tags', 'classificacao'] },
  { label: 'Configurações', href: '/settings', icon: Settings, keywords: ['perfil', 'senha', 'notificacoes', 'whatsapp'] },
  { label: 'Ajuda', href: '/help', icon: HelpCircle, keywords: ['faq', 'duvida', 'glossario'] },
]

function semAcento(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function filtrarComandos(query: string): CommandItem[] {
  const q = semAcento(query.trim())
  if (!q) return COMMANDS
  return COMMANDS.filter(
    (cmd) => semAcento(cmd.label).includes(q) || cmd.keywords.some((k) => semAcento(k).includes(q)),
  )
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const filtered = filtrarComandos(query)

  const navigate = useCallback((href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }, [router])

  // Ctrl+K abre; o botão de busca do topo abre pelo evento. N, fora de campo
  // de texto, vai direto para uma nova transação.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
        return
      }
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      if (alvo?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      router.push('/transactions?nova=1')
    }
    const abrir = () => setOpen(true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener(EVENTO_ABRIR_PALETA, abrir)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener(EVENTO_ABRIR_PALETA, abrir)
    }
  }, [router])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Keyboard navigation inside palette
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault()
        navigate(filtered[selectedIndex].href)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, filtered, selectedIndex, navigate])

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/40 animate-in fade-in duration-100"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar página ou ação"
        className="fixed inset-x-0 top-[15%] z-[101] mx-auto w-full max-w-lg px-4 animate-in fade-in slide-in-from-top-2 duration-150"
      >
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar página ou ação..."
              aria-label="Buscar página ou ação"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nenhum resultado encontrado.</p>
            ) : (
              filtered.map((cmd, i) => (
                <button
                  key={cmd.href}
                  type="button"
                  onClick={() => navigate(cmd.href)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    i === selectedIndex
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <cmd.icon className="h-4 w-4 shrink-0" />
                  {cmd.label}
                </button>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t px-4 py-2 text-[10px] text-gray-400 flex gap-3">
            <span>↑↓ navegar</span>
            <span>↵ abrir</span>
            <span>esc fechar</span>
          </div>
        </div>
      </div>
    </>
  )
}
