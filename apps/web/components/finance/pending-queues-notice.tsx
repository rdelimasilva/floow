import Link from 'next/link'

/**
 * O que espera decisão, anunciado no topo da lista de lançamentos, numa linha
 * só que leva à tela Conciliar.
 *
 * Mora aqui, e não no menu lateral, porque item fixo ocupa lugar permanente
 * para uma decisão que aparece poucas vezes por mês, e some do campo de visão
 * de quem está olhando os lançamentos, que é onde o assunto surge. Sem nada
 * para conciliar não renderiza nada: alarme que toca sempre deixa de ser lido.
 *
 * Âmbar só quando há repetido: aprovar um repetido tira dinheiro do saldo,
 * classificar só rotula. As três filas em amarelo dariam a mesma urgência a
 * decisões de peso diferente.
 */
export function PendingQueuesNotice({ total, repetidos }: { total: number; repetidos: number }) {
  if (total <= 0) return null

  const destaque = repetidos > 0
  const contagem = total === 1 ? '1 item' : `${total} itens`

  return (
    <Link
      href="/transactions/conciliar"
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
        destaque
          ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
          : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
      }`}
    >
      <span>
        {destaque && <span aria-hidden="true">⚠ </span>}
        <strong>{contagem}</strong> para conciliar
      </span>
      <span aria-hidden="true" className={destaque ? 'text-amber-700' : 'text-gray-400'}>
        ›
      </span>
    </Link>
  )
}
