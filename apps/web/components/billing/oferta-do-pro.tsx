import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PLANS, formatPrice } from '@/lib/stripe/plans'
import { NOME_DO_RECURSO, type Recurso } from '@/lib/plano/acesso'
import { formatarDia } from '@/lib/formatar-dia'

interface OfertaDoProProps {
  recurso: Recurso
  /** Fim do trial que já passou, para dizer desde quando o recurso está fechado. */
  trialAte?: Date | null
}

/** Ocupa o lugar da tela quando o recurso é do Pro e a org está no Free. */
export function OfertaDoPro({ recurso, trialAte }: OfertaDoProProps) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-4 pt-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <Lock className="h-5 w-5 text-gray-600" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">{NOME_DO_RECURSO[recurso]} é do plano Pro</h2>
          <p className="text-sm text-muted-foreground">
            {trialAte
              ? `Seu período de teste terminou em ${formatarDia(trialAte)}. Seus dados continuam guardados.`
              : 'Seus dados continuam guardados.'}{' '}
            Assine por {formatPrice(PLANS.pro.price.monthly)}/mês para voltar a usar.
          </p>
        </div>
        <ul className="space-y-1 text-left text-sm text-gray-700">
          {PLANS.pro.features.map((f) => (
            <li key={f}>✓ {f}</li>
          ))}
        </ul>
        <Button asChild variant="primary">
          <Link href="/billing">Ver planos</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
