import { and, eq, isNull, or } from 'drizzle-orm'
import { categories, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>

/** Árvore de categorias rasa (pai, filha, neta); o teto só protege de ciclo. */
const PROFUNDIDADE_MAXIMA = 5

/**
 * Pai, avô… da categoria, do mais próximo ao mais distante. Usado por
 * `herancaDaPrevisao` para nunca trocar uma categoria por outra mais genérica.
 */
export async function ancestraisDaCategoria(tx: Db, orgId: string, categoryId: string): Promise<string[]> {
  const ancestrais: string[] = []
  let atual: string | null = categoryId
  while (atual && ancestrais.length < PROFUNDIDADE_MAXIMA) {
    const [linha]: { parentId: string | null }[] = await tx
      .select({ parentId: categories.parentId })
      .from(categories)
      // Categoria padrão do sistema tem org_id nulo.
      .where(and(eq(categories.id, atual), or(eq(categories.orgId, orgId), isNull(categories.orgId))))
      .limit(1)
    atual = linha?.parentId ?? null
    if (atual) ancestrais.push(atual)
  }
  return ancestrais
}
