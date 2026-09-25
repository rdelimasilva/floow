import Link from 'next/link'
import { HelpCircle } from 'lucide-react'

/** "Como funciona?" que leva direto à pergunta da Ajuda sobre a tela atual. */
export function LinkDeAjuda({ topico }: { topico: string }) {
  return (
    <Link
      href={`/help#${topico}`}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
    >
      <HelpCircle className="h-4 w-4" aria-hidden />
      Como funciona?
    </Link>
  )
}
