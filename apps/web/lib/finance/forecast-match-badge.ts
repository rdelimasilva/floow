import { unstable_cache } from 'next/cache'
import { transactionsTag } from '@/lib/cache-tags'
import { contarPropostasPendentes } from './forecast-match-queries'

/**
 * A contagem do badge, cacheada pela tag de transações.
 *
 * O `(app)/layout.tsx` roda em toda navegação do app, e hoje não faz consulta
 * nenhuma para o menu — `cfoBadgeCount` existe no `Sidebar` e ninguém o
 * alimenta. Sem cache, o badge custaria uma ida ao banco por página para
 * mostrar um número que muda poucas vezes por dia. O sync e as decisões da
 * fila já invalidam essa tag.
 *
 * `userId` entra por fora do callback cacheado de propósito: o callback do
 * `unstable_cache` roda fora do escopo de request e não pode ler cookies, e é
 * de cookies que `withUserDb` normalmente tira a identidade. Por isso
 * `contarPropostasPendentes` usa `withUserDbFor` com o `userId` já resolvido
 * — quem chama esta função resolve a identidade antes de entrar aqui (no
 * layout, é o `user.id` que `getAuthenticatedUser()` já buscou).
 *
 * A chave do cache continua só `orgId`: a contagem é da org, não do usuário —
 * dois membros da mesma org veem o mesmo número. O `userId` só decide sob que
 * contexto de RLS a consulta roda quando o cache está frio.
 */
export async function contagemDeConciliacoesPendentes(orgId: string, userId: string): Promise<number> {
  return unstable_cache(
    async () => contarPropostasPendentes(orgId, userId),
    ['conciliacoes-pendentes', orgId],
    { tags: [transactionsTag(orgId)], revalidate: 300 },
  )()
}
