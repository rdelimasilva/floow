import Link from 'next/link'

interface Fila {
  href: string
  /** O texto em negrito: "2 lançamentos repetidos". */
  contagem: string
  /** O que fazer com eles. */
  acao: string
  destaque: boolean
}

/**
 * As filas que esperam decisão, anunciadas no topo da lista de lançamentos.
 *
 * Moram aqui, e não no menu lateral, porque item fixo ocupa lugar permanente
 * para uma decisão que aparece poucas vezes por mês — e some do campo de visão
 * de quem está olhando os lançamentos, que é onde o assunto surge. Fila vazia
 * não renderiza nada: alarme que toca sempre deixa de ser lido.
 *
 * Os nomes dizem a AÇÃO, não o jargão. "Contraparte" é vocabulário de Open
 * Finance e não significa nada para quem usa o app.
 *
 * A ordem não é arbitrária — é a ordem correta de decidir:
 *
 *  1. Repetido primeiro. Classificar ou confirmar um lançamento que vai ser
 *     descartado é trabalho jogado fora.
 *  2. Classificar depois, porque define o que o lançamento é.
 *  3. Confirmar previsão por último: só faz sentido contra um lançamento que
 *     já se sabe real e já se sabe o que é.
 *
 * Só o primeiro leva destaque de alerta. Os três em amarelo dariam a mesma
 * urgência a decisões de peso diferente — aprovar um repetido tira dinheiro do
 * saldo, classificar só rotula.
 */
export function PendingQueuesNotice({
  repetidos,
  classificar,
  previsoes,
}: {
  repetidos: number
  classificar: number
  previsoes: number
}) {
  const filas: Fila[] = []

  if (repetidos > 0) {
    filas.push({
      href: '/transactions/duplicates',
      contagem: repetidos === 1 ? '1 lançamento repetido' : `${repetidos} lançamentos repetidos`,
      acao: 'para revisar',
      destaque: true,
    })
  }

  if (classificar > 0) {
    filas.push({
      href: '/transactions/review',
      contagem:
        classificar === 1 ? '1 lançamento' : `${classificar} lançamentos`,
      acao: 'para classificar',
      destaque: false,
    })
  }

  if (previsoes > 0) {
    filas.push({
      href: '/transactions/matches',
      contagem: previsoes === 1 ? '1 previsão' : `${previsoes} previsões`,
      acao: 'esperando confirmação',
      destaque: false,
    })
  }

  if (filas.length === 0) return null

  return (
    <div className="space-y-2">
      {filas.map((fila) => (
        <Link
          key={fila.href}
          href={fila.href}
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
            fila.destaque
              ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
              : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
          }`}
        >
          <span>
            {fila.destaque && <span aria-hidden="true">⚠ </span>}
            <strong>{fila.contagem}</strong> {fila.acao}
          </span>
          <span aria-hidden="true" className={fila.destaque ? 'text-amber-700' : 'text-gray-400'}>
            ›
          </span>
        </Link>
      ))}
    </div>
  )
}
