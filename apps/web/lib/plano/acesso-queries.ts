import { cache } from 'react'
import { orgs, subscriptions, accounts } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { and, count, eq } from 'drizzle-orm'
import { getOrgId } from '@/lib/auth/session'
import { calcularAcesso, mensagemDeUpgrade, LIMITE_DE_CONTAS_FREE, type Acesso, type Recurso } from './acesso'

/** Acesso da org ao Pro: assinatura do Stripe ou trial de 30 dias. */
export const getAcesso = cache(async function getAcesso(orgId: string): Promise<Acesso> {
  const [linha] = await withUserDb((tx) => tx
    .select({ criadaEm: orgs.createdAt, planTier: subscriptions.planTier, status: subscriptions.status })
    .from(orgs)
    .leftJoin(subscriptions, eq(subscriptions.orgId, orgs.id))
    .where(eq(orgs.id, orgId))
    .limit(1))
  // Org sem linha não acontece com sessão válida; se acontecer, não bloqueia.
  if (!linha) return { pro: true, trialAte: null, motivo: 'trial' }
  const assinatura = linha.planTier && linha.status ? { planTier: linha.planTier, status: linha.status } : null
  return calcularAcesso(assinatura, linha.criadaEm)
})

export async function contarContasAtivas(orgId: string): Promise<number> {
  const [linha] = await withUserDb((tx) => tx
    .select({ n: count() })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true))))
  return Number(linha?.n ?? 0)
}

/** Free no limite de contas: criar mais uma exige o Pro. */
export async function noLimiteDeContas(orgId: string): Promise<boolean> {
  const acesso = await getAcesso(orgId)
  if (acesso.pro) return false
  return (await contarContasAtivas(orgId)) >= LIMITE_DE_CONTAS_FREE
}

/**
 * Guarda das server actions. A tela já troca o recurso pela oferta do Pro;
 * isto fecha a chamada direta da action.
 */
export async function exigirPro(recurso: Recurso, orgId?: string): Promise<void> {
  const id = orgId ?? (await getOrgId())
  const bloqueado = recurso === 'contas' ? await noLimiteDeContas(id) : !(await getAcesso(id)).pro
  if (bloqueado) throw new Error(mensagemDeUpgrade(recurso))
}
