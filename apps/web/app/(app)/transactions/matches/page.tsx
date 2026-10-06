import { redirect } from 'next/navigation'

/** Confirmar previsões virou o modo foco em /transactions/conciliar; a rota fica para links antigos. */
export default function MatchesPage() {
  redirect('/transactions/conciliar')
}
