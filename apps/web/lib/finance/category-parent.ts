/**
 * Escolha da categoria mãe ao criar ou editar uma categoria.
 *
 * A árvore tem dois níveis: raiz e filha. A tela só sabe abrir e fechar raiz,
 * e o rollup de orçamento soma filha na raiz. Por isso a mãe precisa ser raiz,
 * e uma categoria que já tem filhas não pode virar filha de outra.
 */
import { and, eq, isNull, or } from 'drizzle-orm'
import { categories, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>

interface Mae {
  id: string
  type: string
  parentId: string | null
}

/** Devolve a mensagem de erro, ou null quando a mãe serve. Módulo puro. */
export function problemaComAMae(opcoes: {
  categoriaId?: string
  tipo: string
  mae: Mae | null
  temFilhas: boolean
}): string | null {
  const { categoriaId, tipo, mae, temFilhas } = opcoes
  if (!mae) return 'Categoria mãe não encontrada'
  if (mae.id === categoriaId) return 'Uma categoria não pode ser mãe dela mesma'
  if (mae.parentId) return 'A categoria mãe precisa ser uma categoria principal'
  if (mae.type !== tipo) return 'A categoria mãe precisa ser do mesmo tipo'
  if (temFilhas) return 'Esta categoria tem subcategorias e não pode virar subcategoria de outra'
  return null
}

/**
 * Lê `parentId` do formulário. `undefined` quando o campo não veio (mantém a
 * mãe atual), `null` para virar categoria principal, ou o id da mãe validada.
 */
export async function lerCategoriaMae(
  db: Db,
  orgId: string,
  formData: FormData,
  tipo: string,
  categoriaId?: string,
): Promise<string | null | undefined> {
  const campo = formData.get('parentId')
  if (campo === null) return undefined
  if (campo === '') return null
  const maeId = String(campo)

  const visivel = or(eq(categories.orgId, orgId), isNull(categories.orgId))
  const [[mae], filhas] = await Promise.all([
    db
      .select({ id: categories.id, type: categories.type, parentId: categories.parentId })
      .from(categories)
      .where(and(eq(categories.id, maeId), visivel))
      .limit(1),
    categoriaId
      ? db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.parentId, categoriaId), visivel))
          .limit(1)
      : Promise.resolve([]),
  ])

  const problema = problemaComAMae({ categoriaId, tipo, mae: mae ?? null, temFilhas: filhas.length > 0 })
  if (problema) throw new Error(problema)
  return maeId
}
