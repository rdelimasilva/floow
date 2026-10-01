import { redirect } from 'next/navigation'

/** Remover repetidos virou o modo foco em /transactions/conciliar; a rota fica para links antigos. */
export default function DuplicatesPage() {
  redirect('/transactions/conciliar')
}
