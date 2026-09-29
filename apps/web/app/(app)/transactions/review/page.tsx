import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ regra?: string }>
}

/**
 * Classificar virou uma seção de /transactions/conciliar. A rota fica para
 * links salvos, WhatsApp e e-mails já enviados, e `?regra=` ("Corrigir regra")
 * continua abrindo a regra em edição.
 */
export default async function ReviewPage({ searchParams }: Props) {
  const { regra } = await searchParams
  const query = regra ? `?regra=${encodeURIComponent(regra)}` : ''
  redirect(`/transactions/conciliar${query}#classificar`)
}
