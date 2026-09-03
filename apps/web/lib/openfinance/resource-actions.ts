'use server'

/**
 * Vínculo entre um recurso da Polp (conta ou cartão) e uma conta do floow.
 *
 * D5 da spec: o usuário escolhe, para cada recurso, vincular a uma conta que já
 * existe ou criar uma nova. Casar automaticamente por banco e número parece
 * conveniente, mas um falso positivo funde duas contas distintas e mistura
 * histórico — difícil de desfazer num app financeiro. Criar sempre nova evita a
 * ambiguidade e duplica saldo e patrimônio até o usuário arrumar à mão. A
 * escolha explícita custa uma tela e elimina os dois danos.
 */

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { getDb, accounts, openfinanceResources } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'

/** Conta espelho para cada tipo de recurso. */
const ACCOUNT_TYPE_BY_RESOURCE: Record<string, 'checking' | 'credit_card'> = {
  ACCOUNT: 'checking',
  CREDIT_CARD_ACCOUNT: 'credit_card',
}

export type LinkTarget =
  | { kind: 'existing'; accountId: string }
  | { kind: 'new'; name: string }

export async function linkResourceToAccount(resourceId: string, target: LinkTarget): Promise<void> {
  const orgId = await getOrgId()
  const db = getDb()

  const [resource] = await db
    .select()
    .from(openfinanceResources)
    .where(and(eq(openfinanceResources.id, resourceId), eq(openfinanceResources.orgId, orgId)))
    .limit(1)

  if (!resource) throw new Error('Recurso não encontrado')

  const accountId =
    target.kind === 'existing'
      ? await assertAccountInOrg(db, target.accountId, orgId)
      : await createMirrorAccount(db, orgId, target.name, resource.resourceType)

  await db
    .update(openfinanceResources)
    .set({ accountId, updatedAt: new Date() })
    .where(eq(openfinanceResources.id, resource.id))

  await invalidateTag(accountsTag(orgId))
  revalidatePath('/accounts')
}

/** Desfaz o vínculo sem apagar nada — o histórico importado continua na conta. */
export async function unlinkResource(resourceId: string): Promise<void> {
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(openfinanceResources)
    .set({ accountId: null, updatedAt: new Date() })
    .where(and(eq(openfinanceResources.id, resourceId), eq(openfinanceResources.orgId, orgId)))

  revalidatePath('/accounts')
}

async function assertAccountInOrg(
  db: ReturnType<typeof getDb>,
  accountId: string,
  orgId: string,
): Promise<string> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    .limit(1)

  if (!account) throw new Error('Conta não encontrada')
  return account.id
}

async function createMirrorAccount(
  db: ReturnType<typeof getDb>,
  orgId: string,
  name: string,
  resourceType: string,
): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Informe um nome para a conta')

  const type = ACCOUNT_TYPE_BY_RESOURCE[resourceType]
  if (!type) throw new Error(`Tipo de recurso sem conta correspondente: ${resourceType}`)

  // Saldo inicial zero de propósito: quem passa a mandar no saldo é o extrato
  // importado. Chutar um valor aqui produziria patrimônio que ninguém tem.
  const [account] = await db
    .insert(accounts)
    .values({ orgId, name: trimmed, type, balanceCents: 0 })
    .returning({ id: accounts.id })

  return account.id
}
