import { ExigePro } from '@/components/billing/exige-pro'

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return <ExigePro recurso="planejamento">{children}</ExigePro>
}
