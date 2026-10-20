import { ExigePro } from '@/components/billing/exige-pro'

export default function NewAccountLayout({ children }: { children: React.ReactNode }) {
  return <ExigePro recurso="contas">{children}</ExigePro>
}
