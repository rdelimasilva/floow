'use client'

import { TelaDeErro } from '@/components/ui/tela-de-erro'

export default function TransactionsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <TelaDeErro titulo="Erro ao carregar transações" {...props} />
}
