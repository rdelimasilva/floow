import { AbasDeInvestimentos } from '@/components/investments/abas-de-investimentos'
import { ExigePro } from '@/components/billing/exige-pro'

export default function InvestmentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ExigePro recurso="investimentos">
      <div className="space-y-6">
        <AbasDeInvestimentos />
        {children}
      </div>
    </ExigePro>
  )
}
