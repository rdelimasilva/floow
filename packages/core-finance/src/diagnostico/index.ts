import {
  ordenarAchados,
  patrimonioCents,
  type Achado,
  type ContextoDiagnostico,
  type Diagnostico,
} from './tipos'

export * from './tipos'

export function diagnosticar(ctx: ContextoDiagnostico): Diagnostico {
  const achados: Achado[] = []
  const ordenados = ordenarAchados(achados)
  return {
    achados: ordenados,
    impactoAnualCents: ordenados.reduce((s, a) => s + (a.impactoAnualCents ?? 0), 0),
    patrimonioCents: patrimonioCents(ctx),
  }
}
