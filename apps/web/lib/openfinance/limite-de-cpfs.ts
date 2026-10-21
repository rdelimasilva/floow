import { and, eq, isNull } from 'drizzle-orm'
import { getDb, openfinanceConnections } from '@floow/db'
import { ErroDaConexao } from './errors'

/** Quantos CPFs diferentes uma org (a família) pode conectar ao mesmo tempo. */
export const LIMITE_DE_CPFS = 5

/**
 * Conectar este CPF passa do limite? CPF que já tem conexão viva na org nunca
 * passa: outro banco do mesmo titular não ocupa vaga nova.
 */
export function excedeLimiteDeCpfs(
  hashesConectados: string[],
  novo: string,
  limite: number = LIMITE_DE_CPFS,
): boolean {
  const distintos = new Set(hashesConectados)
  return !distintos.has(novo) && distintos.size >= limite
}

/** Lança se a org já tem o limite de CPFs e este é um CPF novo. Conexão encerrada libera a vaga. */
export async function exigirVagaDeCpf(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  orgId: string,
  cpfHash: string,
): Promise<void> {
  const conectados = await db
    .select({ cpfHash: openfinanceConnections.cpfHash })
    .from(openfinanceConnections)
    .where(and(eq(openfinanceConnections.orgId, orgId), isNull(openfinanceConnections.revokedAt)))
  if (excedeLimiteDeCpfs(conectados.map((c) => c.cpfHash), cpfHash)) {
    throw new ErroDaConexao(
      `Já há ${LIMITE_DE_CPFS} CPFs conectados, que é o limite. Para conectar outro, encerre as conexões de um deles.`,
    )
  }
}
