import Link from 'next/link'

/**
 * As filas que esperam decisão, anunciadas no topo da lista de lançamentos.
 *
 * Elas moram aqui, e não no menu lateral, porque um item de menu fixo ocupa
 * lugar permanente para uma decisão que aparece poucas vezes por mês — e some
 * do campo de visão justamente de quem está olhando os lançamentos, que é
 * onde o assunto surge. Fila vazia não ocupa espaço nenhum.
 *
 * Sem os itens da fila aqui: o aviso diz que há o que decidir e leva para o
 * lugar de decidir. Repetir os pares na lista de transações misturaria duas
 * leituras diferentes na mesma tela.
 */
export function PendingQueuesNotice({
  duplicatas,
  conciliacoes,
}: {
  duplicatas: number
  conciliacoes: number
}) {
  if (duplicatas === 0 && conciliacoes === 0) return null

  return (
    <div className="space-y-2">
      {duplicatas > 0 && (
        <Link
          href="/transactions/duplicates"
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm transition-colors hover:bg-amber-100"
        >
          <span className="text-amber-900">
            <span aria-hidden="true">⚠ </span>
            <strong>
              {duplicatas === 1
                ? '1 possível duplicata'
                : `${duplicatas} possíveis duplicatas`}
            </strong>{' '}
            para revisar
          </span>
          <span aria-hidden="true" className="text-amber-700">
            ›
          </span>
        </Link>
      )}

      {conciliacoes > 0 && (
        <Link
          href="/transactions/matches"
          className="flex items-center justify-between gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm transition-colors hover:bg-blue-100"
        >
          <span className="text-blue-900">
            <strong>
              {conciliacoes === 1 ? '1 conciliação' : `${conciliacoes} conciliações`}
            </strong>{' '}
            esperando sua decisão
          </span>
          <span aria-hidden="true" className="text-blue-700">
            ›
          </span>
        </Link>
      )}
    </div>
  )
}
