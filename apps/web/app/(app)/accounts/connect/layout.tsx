import { ExigePro } from '@/components/billing/exige-pro'

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return <ExigePro recurso="open_finance">{children}</ExigePro>
}
