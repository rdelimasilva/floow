import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BillingSuccessPageProps {
  searchParams: Promise<{ session_id?: string }>
}

/**
 * Checkout success page.
 *
 * The actual subscription update happens asynchronously via Stripe webhook
 * (checkout.session.completed -> webhook handler -> subscriptions table update).
 * This page confirms payment was received and directs users back to the app.
 */
export default async function BillingSuccessPage({
  searchParams,
}: BillingSuccessPageProps) {
  // session_id is available for future reference (e.g., displaying order details)
  // The webhook handles the subscription record update
  const params = await searchParams
  const sessionId = params.session_id

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-12 text-center">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-green-100 p-4">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Pagamento realizado com sucesso!
          </h1>
          <p className="text-sm text-gray-500">
            Bem-vindo ao Floow Pro. Seu plano será atualizado em instantes.
          </p>
        </div>

        {sessionId && (
          <p className="text-xs text-gray-400">
            Referência: {sessionId}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/dashboard">Ir para o Dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/billing">Ver Plano</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
