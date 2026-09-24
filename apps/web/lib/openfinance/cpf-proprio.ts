import { eq } from 'drizzle-orm'
import { getDb, openfinanceConnections } from '@floow/db'
import { hashCpf, stripCpf } from './cpf'

type Db = ReturnType<typeof getDb>

/**
 * O CPF do titular, em hash, de cada conexão Open Finance da org. É o único
 * lugar onde o floow sabe quem é o dono das contas; o CPF em claro nunca é
 * gravado (ver `cpf.ts`).
 */
export async function carregarHashesDoTitular(db: Pick<Db, 'select'>, orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ cpfHash: openfinanceConnections.cpfHash })
    .from(openfinanceConnections)
    .where(eq(openfinanceConnections.orgId, orgId))
  return new Set(rows.map((r) => r.cpfHash))
}

/**
 * A contraparte é o próprio titular? Pix para si mesmo vai para contas
 * diferentes, e por isso nunca pode virar regra de conta fixa (spec §6).
 *
 * Nunca lança: CNPJ, org sem conexão ou ambiente sem `POLP_CPF_SALT` só
 * querem dizer "não dá para saber", e aí vale o comportamento de sempre.
 */
export function ehCpfProprio(
  taxId: string | null | undefined,
  hashes: Set<string>,
  salt: string | undefined = process.env.POLP_CPF_SALT,
): boolean {
  if (!taxId || hashes.size === 0 || !salt) return false
  if (stripCpf(taxId).length !== 11) return false
  return hashes.has(hashCpf(taxId, salt))
}
