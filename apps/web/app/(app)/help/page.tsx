import { PageHeader } from '@/components/ui/page-header'
import { CentralDeAjuda } from '@/components/ajuda/central-de-ajuda'

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Ajuda" description="Tire suas dúvidas sobre como usar o floow" />
      <CentralDeAjuda />
    </div>
  )
}
