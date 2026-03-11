import Link from 'next/link'

export default function InvestmentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      {/* Sub-navigation tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6" aria-label="Investimentos">
          <Link
            href="/investments"
            className="border-b-2 border-gray-900 pb-3 text-sm font-medium text-gray-900 hover:text-gray-700"
          >
            Posicoes
          </Link>
          <Link
            href="/investments/new"
            className="border-b-2 border-transparent pb-3 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
          >
            Novo Ativo / Evento
          </Link>
        </nav>
      </div>
      {children}
    </div>
  )
}
