import { AbasDeAnalises } from '@/components/finance/abas-de-analises'

export default function AnalisesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <AbasDeAnalises />
      {children}
    </div>
  )
}
