/**
 * Checagem de nome único de categoria, compartilhada por `category-actions.ts`
 * (ainda em `getDb()`) e por `category-suggestions/accept.ts` (já em
 * `withUserDb()`/RlsTx). Por isso o parâmetro `db` aceita as duas formas —
 * só precisa de `.select`.
 */
import { and, eq, ilike, isNull, or } from 'drizzle-orm'
import { categories, type getDb, type RlsTx } from '@floow/db'

type Db = ReturnType<typeof getDb>

export async function assertNameIsFree(
  db: Pick<Db, 'select'> | RlsTx,
  orgId: string,
  name: string,
  exceptId?: string,
): Promise<void> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(ilike(categories.name, name), or(eq(categories.orgId, orgId), isNull(categories.orgId))))

  if (rows.some((row) => row.id !== exceptId)) {
    throw new Error('Já existe uma categoria com esse nome')
  }
}
