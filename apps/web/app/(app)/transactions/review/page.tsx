import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ regra?: string }>
}

/**
 * Classificar virou o modo foco em /transactions/conciliar. A rota fica para
 * links salvos, WhatsApp e e-mails já enviados, e `?regra=` ("Corrigir
 * regra") continua abrindo a regra em edição, agora em /conciliar/regras.
 */
export default async function ReviewPage({ searchParams }: Props) {
  const { regra } = await searchParams
  if (regra) redirect(`/transactions/conciliar/regras?regra=${encodeURIComponent(regra)}`)
  redirect('/transactions/conciliar')
}
