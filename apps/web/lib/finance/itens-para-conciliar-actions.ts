'use server'

import { getOrgId } from '@/lib/finance/queries'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { contarItensParaConciliar } from './itens-para-conciliar'

/**
 * O total da tela Conciliar para quem está no cliente: o assistente de
 * conexão, depois do primeiro import, decide se leva o usuário para lá.
 *
 * Nunca lança. Sem o portão, este número só escolhe o destino de uma
 * navegação, e erro aqui não pode virar tela de erro no fim de uma conexão
 * que deu certo: na dúvida, 0, e o assistente fica onde está.
 */
export async function totalParaConciliar(): Promise<number> {
  try {
    const [orgId, identity] = await Promise.all([getOrgId(), getVerifiedIdentity()])
    const { total } = await contarItensParaConciliar(orgId, identity?.userId ?? null)
    return total
  } catch {
    return 0
  }
}
