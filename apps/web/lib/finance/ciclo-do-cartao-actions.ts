'use server'

import { and, eq } from 'drizzle-orm'
import { accounts } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { getOrgId } from './queries'
import { revalidateAccountData, revalidateTransactionData } from './revalidate'

/**
 * Grava o fechamento e o vencimento de um cartão — o cadastro que todo
 * cartão precisa ter (ver `exigirCicloDoCartao` em @floow/shared). Usado pelo
 * aviso de cartão sem ciclo, que aparece para cartão vindo do Open Finance ou
 * cadastrado antes de os dias serem obrigatórios.
 *
 * Devolve `{ error }` em vez de lançar: em produção o Next esconde a mensagem
 * de exceção de server action.
 */
export async function salvarCicloDoCartao(
  accountId: string,
  closingDay: number,
  dueDay: number,
): Promise<{ error?: string }> {
  const valido = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31
  if (!valido(closingDay) || !valido(dueDay)) return { error: 'Os dias precisam estar entre 1 e 31.' }

  const orgId = await getOrgId()
  const [salvo] = await withUserDb((db) => db
    .update(accounts)
    .set({ closingDay, dueDay, updatedAt: new Date() })
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId), eq(accounts.type, 'credit_card')))
    .returning({ id: accounts.id }))
  if (!salvo) return { error: 'Cartão não encontrado.' }

  revalidateAccountData(orgId)
  revalidateTransactionData(orgId)
  return {}
}
