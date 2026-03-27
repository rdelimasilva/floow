'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Wallet, ArrowLeftRight, TrendingUp, Tags, BarChart3,
  PiggyBank, Target, Building2, Landmark, HelpCircle, Search,
} from 'lucide-react'

interface CommandItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  keywords: string[]
}

const COMMANDS: CommandItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, keywords: ['inicio', 'home', 'visao geral'] },
  { label: 'Fluxo de Caixa', href: '/cash-flow', icon: BarChart3, keywords: ['fluxo', 'caixa', 'grafico'] },
  { label: 'Transações', href: '/transactions', icon: ArrowLeftRight, keywords: ['extrato', 'lancamentos'] },
  { label: 'Importar Extrato', href: '/transactions/import', icon: ArrowLeftRight, keywords: ['importar', 'ofx', 'csv', 'banco'] },
  { label: 'Meta de Gastos', href: '/budgets/spending', icon: PiggyBank, keywords: ['orcamento', 'gastos', 'limite'] },
  { label: 'Meta de Investimentos', href: '/budgets/investing', icon: Target, keywords: ['aporte', 'investir', 'meta'] },
  { label: 'Investimentos', href: '/investments', icon: TrendingUp, keywords: ['carteira', 'portfolio', 'acoes', 'fundos'] },
  { label: 'Ativos Imobilizados', href: '/fixed-assets', icon: Building2, keywords: ['imovel', 'carro', 'bens'] },
  { label: 'Controle de Dívidas', href: '/debts', icon: Landmark, keywords: ['divida', 'emprestimo', 'financiamento'] },
  { label: 'Planejamento', href: '/planning', icon: Target, keywords: ['aposentadoria', 'fi', 'simulacao'] },
  { label: 'Simulação', href: '/planning/simulation', icon: BarChart3, keywords: ['cenario', 'projecao'] },
  { label: 'Calculadora FI', href: '/planning/fi-calculator', icon: Target, keywords: ['independencia', 'financeira', 'numero fi'] },
  { label: 'Estratégia de Retirada', href: '/planning/withdrawal', icon: Wallet, keywords: ['retirada', '4%', 'aposentadoria'] },
  { label: 'Plano Sucessório', href: '/planning/succession', icon: HelpCircle, keywords: ['heranca', 'itcmd', 'herdeiros'] },
  { label: 'Contas', href: '/accounts', icon: Wallet, keywords: ['conta corrente', 'poupanca', 'cartao'] },
  { label: 'Categorias', href: '/categories', icon: Tags, keywords: ['tags', 'classificacao'] },
  { label: 'Ajuda', href: '/help', icon: HelpCircle, keywords: ['faq', 'duvida', 'glossario'] },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const filtered = query.trim()
    ? COMMANDS.filter((cmd) => {
        const q = query.toLowerCase()
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.keywords.some((k) => k.includes(q))
        )
      })
    : COMMANDS

  const navigate = useCallback((href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }, [router])

  // Keyboard shortcut to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      <div className="fixed inset-x-0 top-[15%] z-[101] mx-auto w-full max-w-lg px-4 animate-in fade-in slide-in-from-top-2 duration-150">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar página ou ação..."
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
