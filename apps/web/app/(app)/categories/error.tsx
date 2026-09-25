'use client'

import { TelaDeErro } from '@/components/ui/tela-de-erro'

export default function CategoriesError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <TelaDeErro titulo="Erro ao carregar categorias" {...props} />
}
