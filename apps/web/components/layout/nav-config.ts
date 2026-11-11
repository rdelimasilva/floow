import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  TrendingUp,
  Tags,
  Target,
  Compass,
  Building2,
  BarChart3,
  Gauge,
  PiggyBank,
  Landmark,
  Bot,
  RefreshCw,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export interface NavSection {
  title: string
  items: NavItem[]
}

// Seção de um item só funde com a vizinha; Ajuda mora no rodapé do menu.
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/cfo', label: 'Consultor Financeiro', icon: Bot },
    ],
  },
  {
    title: 'Dia a dia',
    items: [
      { href: '/cash-flow', label: 'Análises', icon: BarChart3 },
      { href: '/transactions', label: 'Transações', icon: ArrowLeftRight },
      { href: '/transactions/recurring', label: 'Recorrentes', icon: RefreshCw },
    ],
  },
  {
    title: 'Planejamento',
    items: [
      { href: '/budgets/pacing', label: 'Ritmo de Gastos', icon: Gauge },
      { href: '/budgets/spending', label: 'Plano de Gastos', icon: PiggyBank },
      { href: '/budgets/investing', label: 'Meta de Investimentos', icon: Target },
      { href: '/planning', label: 'Planos Futuros', icon: Compass },
    ],
  },
  {
    title: 'Patrimônio',
    items: [
      { href: '/investments', label: 'Investimentos', icon: TrendingUp },
      { href: '/fixed-assets', label: 'Bens', icon: Building2 },
      { href: '/debts', label: 'Controle de Dívidas', icon: Landmark },
    ],
  },
  {
    title: 'Cadastros',
    items: [
      { href: '/accounts', label: 'Contas', icon: Wallet },
      { href: '/categories', label: 'Categorias', icon: Tags },
    ],
  },
]

export const MAX_FAVORITOS = 5

const ITENS = new Map(NAV_SECTIONS.flatMap((s) => s.items).map((i) => [i.href, i]))

export function itemDoMenu(href: string): NavItem | undefined {
  return ITENS.get(href)
}

/**
 * Os favoritos vêm do `user_metadata`, que a própria pessoa consegue editar
 * pela API do Auth. Só passa o que é item do menu, sem repetição, até o limite.
 */
export function favoritosValidos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  const vistos = new Set<string>()
  for (const v of valor) {
    if (typeof v === 'string' && ITENS.has(v)) vistos.add(v)
    if (vistos.size === MAX_FAVORITOS) break
  }
  return [...vistos]
}
