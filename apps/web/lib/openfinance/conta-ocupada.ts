import { and, eq, isNull, ne } from 'drizzle-orm'
import { openfinanceConnections, openfinanceResources, type getDb } from '@floow/db'

type Db = Pick<ReturnType<typeof getDb>, 'select'>

/**
 * A conta do floow já espelha um recurso de conexão viva?
 *
 * Duas contas do banco na mesma conta local somariam dois extratos no mesmo
 * saldo. Conexão encerrada (revoked_at) não importa mais nada, então o vínculo
 * que ficou nela não prende a conta — é o caso de quem reconecta o banco.
 */
export async function contaOcupada(
  db: Db,
  orgId: string,
  accountId: string,
  exceto?: string,
): Promise<boolean> {
  const [ocupada] = await db
    .select({ id: openfinanceResources.id })
    .from(openfinanceResources)
    .innerJoin(openfinanceConnections, eq(openfinanceConnections.id, openfinanceResources.connectionId))
    .where(
      and(
        eq(openfinanceResources.orgId, orgId),
        eq(openfinanceResources.accountId, accountId),
        isNull(openfinanceConnections.revokedAt),
        exceto ? ne(openfinanceResources.id, exceto) : undefined,
      ),
    )
    .limit(1)
  return Boolean(ocupada)
}
