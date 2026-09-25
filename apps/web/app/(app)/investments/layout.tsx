import { AbasDeInvestimentos } from '@/components/investments/abas-de-investimentos'

export default function InvestmentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <AbasDeInvestimentos />
      {children}
    </div>
  )
}
