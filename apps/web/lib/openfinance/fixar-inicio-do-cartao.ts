import { and, eq } from 'drizzle-orm'
import { accounts, openfinanceResources } from '@floow/db'
import type { PolpCardBill, PolpClient } from '@floow/core-finance'
import type { Db } from './persist-page'
import { inicioDoHistorico } from './inicio-do-cartao'

interface RecursoDoCartao {
  id: string
  orgId: string
  accountId: string | null
  polpResourceId: string
  syncFromDate: string | null
}

/**
 * O início do histórico do cartão, gravado em `sync_from_date` na primeira vez
 * e nunca mais mudado: recalcular a cada passada o empurraria um mês adiante,
 * já que antes dele nada é importado. A primeira compra vem de uma leitura
 * completa do cartão, uma vez só.
 */
export async function fixarInicioDoCartao(
  db: Db,
  client: PolpClient,
  recurso: RecursoDoCartao,
  faturas: readonly PolpCardBill[],
): Promise<string | null> {
  if (recurso.syncFromDate) return recurso.syncFromDate
  if (!recurso.accountId) return null

  let primeira: string | null = null
  for await (const pagina of client.streamCardTransactions(recurso.polpResourceId)) {
    for (const t of pagina) {
      const d = t.transaction_date_time?.slice(0, 10)
      if (d && (!primeira || d < primeira)) primeira = d
    }
  }
  if (!primeira) return null

  const [conta] = await db
    .select({ closingDay: accounts.closingDay })
    .from(accounts)
    .where(and(eq(accounts.id, recurso.accountId), eq(accounts.orgId, recurso.orgId)))
    .limit(1)
  const inicio = inicioDoHistorico(primeira, faturas, conta?.closingDay ?? null)
  if (!inicio) return null

  await db
    .update(openfinanceResources)
    .set({ syncFromDate: inicio, updatedAt: new Date() })
    .where(eq(openfinanceResources.id, recurso.id))
  return inicio
}
