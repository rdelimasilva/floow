import {
  ordenarAchados,
  patrimonioCents,
  type Achado,
  type ContextoDiagnostico,
  type Diagnostico,
} from './tipos'
import { regraR02, regraR03, regraR04 } from './caixa-e-rendimento'
import { regraR05, regraR06, regraR07 } from './concentracao'
import { regraR11, regraR12 } from './vencimento-e-dados'

export * from './tipos'

export function diagnosticar(ctx: ContextoDiagnostico): Diagnostico {
  const achados: Achado[] = []
  const r03 = regraR03(ctx)
  if (r03) achados.push(r03)
  const r04 = regraR04(ctx)
  if (r04) achados.push(r04)
  achados.push(...regraR02(ctx, new Set(r03?.posicoes ?? [])))
  achados.push(...regraR05(ctx), ...regraR06(ctx), ...regraR07(ctx), ...regraR11(ctx))
  const r12 = regraR12(ctx)
  if (r12) achados.push(r12)
  const ordenados = ordenarAchados(achados)
  return {
    achados: ordenados,
    impactoAnualCents: ordenados.reduce((s, a) => s + (a.impactoAnualCents ?? 0), 0),
    patrimonioCents: patrimonioCents(ctx),
  }
}
export { brl } from '../cfo/formato'
