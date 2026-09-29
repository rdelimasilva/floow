import { and, eq } from 'drizzle-orm'
import { openfinanceResources, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>

/**
 * O motor de conciliação vale para conta corrente e poupança: recurso Open
 * Finance vivo do tipo `ACCOUNT` (Ruling P12). Cartão (`CREDIT_CARD_ACCOUNT`)
 * fica como antes — a fatura registra o pagamento em outra data, e o legado
 * sem prova tiraria dinheiro do saldo sem contrapartida.
 *
 * Fonte única para motor, "nasce aguardando", auditor e script do legado.
 * `isOpenFinanceLinkedAccount` segue decidindo `:transfer-par` ×
 * `:transfer-dest` (qualquer recurso vivo), que não muda.
 */
export const TIPO_DE_RECURSO_CONCILIAVEL = 'ACCOUNT'

export function condicaoDeRecursoConciliavel(orgId: string, accountId: string) {
  return and(
    eq(openfinanceResources.orgId, orgId),
    eq(openfinanceResources.accountId, accountId),
    eq(openfinanceResources.status, 'AVAILABLE'),
    eq(openfinanceResources.resourceType, TIPO_DE_RECURSO_CONCILIAVEL),
  )
}

export async function contaConciliavel(db: Db, orgId: string, accountId: string): Promise<boolean> {
  const [recurso] = await db
    .select({ id: openfinanceResources.id })
    .from(openfinanceResources)
    .where(condicaoDeRecursoConciliavel(orgId, accountId))
    .limit(1)
  return Boolean(recurso)
}
