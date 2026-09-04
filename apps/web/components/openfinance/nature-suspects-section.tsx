import { getNatureSuspects } from '@/lib/openfinance/nature-queries'
import { NatureSuspectsBanner } from './nature-suspects-banner'

/**
 * O detector fora do caminho crítico do render de `/transactions`.
 *
 * `getNatureSuspects` varre treze meses de extrato sem paginação, para toda org
 * — inclusive as que nem têm conexão Open Finance. Dentro do `Promise.all` da
 * página, ela atrasava a lista de transações inteira por um aviso que é
 * acessório. Aqui ela roda dentro de um `<Suspense>`: a página pinta primeiro e
 * o aviso aparece quando ficar pronto.
 *
 * NÃO devolve `null` quando não há grupos. Quem decide isso é o banner, que
 * precisa continuar montado para o painel aberto sobreviver ao usuário resolver
 * o último grupo.
 */
export async function NatureSuspectsSection({ orgId }: { orgId: string }) {
  const groups = await getNatureSuspects(orgId)
  return <NatureSuspectsBanner groups={groups} />
}
