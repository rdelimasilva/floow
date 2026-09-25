'use client'

import { TelaDeErro } from '@/components/ui/tela-de-erro'

export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <TelaDeErro titulo="Algo deu errado" {...props} />
}
