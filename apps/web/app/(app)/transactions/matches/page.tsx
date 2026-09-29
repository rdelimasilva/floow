import { redirect } from 'next/navigation'

/** Confirmar previsões virou uma seção de /transactions/conciliar; a rota fica para links antigos. */
export default function MatchesPage() {
  redirect('/transactions/conciliar#confirmar')
}
