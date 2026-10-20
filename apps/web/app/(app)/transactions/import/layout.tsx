import { ExigePro } from '@/components/billing/exige-pro'

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return <ExigePro recurso="importacao">{children}</ExigePro>
}
