/**
 * Para onde vão os códigos Polp de uma categoria excluída com reatribuição.
 *
 * A reatribuição move o histórico para o destino, mas o `polp_ref` ficava na
 * categoria que saiu — e a ingestão, que resolve `category_ref` por
 * `polp_ref`, passava a deixar aquelas transações sem categoria. O
 * redirecionamento vence o `polp_ref` das categorias na hora de importar.
 */

import { getDb, polpRefRedirects } from '@floow/db'

type Db = ReturnType<typeof getDb>

export interface Redirecionamento {
  polpRef: string
  categoryId: string
}

/** Grava (ou troca) o destino do código da categoria que está saindo. */
export async function redirecionarCodigoPolp(db: Db, orgId: string, polpRef: string | null, destinoId: string) {
  if (!polpRef) return
  await db
    .insert(polpRefRedirects)
    .values({ orgId, polpRef, categoryId: destinoId })
    .onConflictDoUpdate({
      target: [polpRefRedirects.orgId, polpRefRedirects.polpRef],
      set: { categoryId: destinoId },
    })
}

/**
 * Sobrepõe os redirecionamentos ao índice `polp_ref -> categoria`. Destino que
 * a org não vê mais é ignorado: melhor cair no índice base (ou sem categoria)
 * do que numa categoria escondida.
 */
export function aplicarRedirecionamentos(
  index: Map<string, string>,
  redirecionamentos: Redirecionamento[],
  visiveis: Set<string>,
): Map<string, string> {
  const final = new Map(index)
  for (const { polpRef, categoryId } of redirecionamentos) {
    if (visiveis.has(categoryId)) final.set(polpRef, categoryId)
  }
  return final
}
