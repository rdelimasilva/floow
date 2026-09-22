import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, accounts, openfinanceResources } from '@floow/db'
import { eq, and, isNotNull } from 'drizzle-orm'
import { accountsTag } from '@/lib/cache-tags'

/**
 * Returns all active accounts for the given org, ordered by name.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getAccounts = cache(async function getAccounts(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(accounts)
        .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
        .orderBy(accounts.name)
    },
    ['finance-accounts', orgId],
    { tags: [accountsTag(orgId)], revalidate: 300 },
  )()
})

/**
 * Returns a single account by ID, verifying org ownership.
 * Returns null if account not found or doesn't belong to the org.
 */
export const getAccountById = cache(async function getAccountById(orgId: string, accountId: string) {
  const db = getDb()
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
    .limit(1)

  return account ?? null
})

/**
 * Saldo que o banco informou, por conta do floow.
 *
 * Query separada, e nao um join em `getAccounts`, de proposito: o tipo
 * `Account` e consumido por dezenas de telas que nao tem nada a ver com
 * conferencia, e alargar o retorno de `getAccounts` arrastaria todas elas.
 * Quem quer conferir pede a conferencia.
 *
 * So volta linha de conta com Open Finance vinculado e saldo ja lido — cartao
 * de credito nunca aparece, porque seu detalhe traz `limits` e nao `balance`.
 */
export const getSaldosDoBanco = cache(async function getSaldosDoBanco(orgId: string) {
  const db = getDb()
  const linhas = await db
    .select({
      accountId: openfinanceResources.accountId,
      bankBalanceCents: openfinanceResources.bankBalanceCents,
      bankBalanceAt: openfinanceResources.bankBalanceAt,
    })
    .from(openfinanceResources)
    .where(and(eq(openfinanceResources.orgId, orgId), isNotNull(openfinanceResources.bankBalanceCents)))

  const porConta = new Map<string, { bankBalanceCents: number; bankBalanceAt: Date | null }>()
  for (const l of linhas) {
    if (l.accountId === null || l.bankBalanceCents === null) continue
    porConta.set(l.accountId, { bankBalanceCents: l.bankBalanceCents, bankBalanceAt: l.bankBalanceAt })
  }
  return porConta
})
