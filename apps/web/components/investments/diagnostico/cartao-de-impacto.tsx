import { brl, brlCurto, type Diagnostico } from '@floow/core-finance'

export function CartaoDeImpacto({ diagnostico }: { diagnostico: Diagnostico }) {
  const n = diagnostico.achados.length
  const pontos = `${n} ${n === 1 ? 'ponto' : 'pontos'}`
  const patrimonio = `patrimônio ${brl(diagnostico.patrimonioCents)}`

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      {diagnostico.impactoAnualCents > 0 ? (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Impacto estimado</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">~{brlCurto(diagnostico.impactoAnualCents)}/ano</p>
          <p className="mt-1 text-sm text-gray-500">em {pontos} · {patrimonio}</p>
        </>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Patrimônio analisado</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{brl(diagnostico.patrimonioCents)}</p>
          <p className="mt-1 text-sm text-gray-500">{n === 0 ? 'Nenhum ponto de atenção' : `${pontos} de atenção`}</p>
        </>
      )}
    </section>
  )
}
