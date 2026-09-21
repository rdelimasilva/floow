import { and, asc, count, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { accounts, forecastMatchProposals, transactions } from '@floow/db'
import { withUserDb, withUserDbFor } from '@/lib/db/rls'

export interface LadoDoPar {
  id: string
  date: string
  description: string
  amountCents: number
}

export interface PropostaPendente {
  id: string
  previsao: LadoDoPar
  realizado: LadoDoPar
  contaNome: string | null
  /** Distância em dias entre as duas datas — o porquê do par, na tela. */
  diasDeDiferenca: number
  /** Diferença absoluta de valor, em centavos. */
  diferencaCents: number
}

const DIA_EM_MS = 24 * 60 * 60 * 1000

/**
 * As propostas abertas da org, com os dois lados do par e o porquê dele.
 *
 * Dois aliases de `transactions` porque a linha junta previsão e realizado, que
 * são a mesma tabela. Ordenada por dinheiro, decrescente — o mesmo princípio
 * que a fila de contrapartes validou: "R$ 92 mil" move o usuário, "12 itens"
 * não.
 */
export async function getPropostasPendentes(orgId: string): Promise<PropostaPendente[]> {
  return withUserDb(async (db) => {
    const previsao = alias(transactions, 'previsao')
    const realizado = alias(transactions, 'realizado')

    const rows = await db
      .select({
        id: forecastMatchProposals.id,
        previsaoId: previsao.id,
        previsaoDate: previsao.date,
        previsaoDescription: previsao.description,
        previsaoAmount: previsao.amountCents,
        realizadoId: realizado.id,
        realizadoDate: realizado.date,
        realizadoDescription: realizado.description,
        realizadoAmount: realizado.amountCents,
        contaNome: accounts.name,
      })
      .from(forecastMatchProposals)
      .innerJoin(previsao, eq(previsao.id, forecastMatchProposals.forecastTransactionId))
      .innerJoin(realizado, eq(realizado.id, forecastMatchProposals.realizedTransactionId))
      .leftJoin(accounts, eq(accounts.id, realizado.accountId))
      .where(
        and(
          eq(forecastMatchProposals.orgId, orgId),
          eq(forecastMatchProposals.status, 'pending'),
        ),
      )
      .orderBy(sql`abs(${realizado.amountCents}) desc`, asc(forecastMatchProposals.proposedAt))

    const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d))

    return rows.map((row) => ({
      id: row.id,
      previsao: {
        id: row.previsaoId,
        date: iso(row.previsaoDate),
        description: row.previsaoDescription,
        amountCents: row.previsaoAmount,
      },
      realizado: {
        id: row.realizadoId,
        date: iso(row.realizadoDate),
        description: row.realizadoDescription,
        amountCents: row.realizadoAmount,
      },
      contaNome: row.contaNome,
      diasDeDiferenca: Math.round(
        Math.abs(new Date(row.previsaoDate).getTime() - new Date(row.realizadoDate).getTime()) / DIA_EM_MS,
      ),
      diferencaCents: Math.abs(row.previsaoAmount - row.realizadoAmount),
    }))
  })
}

/**
 * Quantas propostas esperam decisão — alimenta o badge do menu.
 *
 * Recebe o `userId` em vez de resolvê-lo da requisição: quem chama esta
 * função é `contagemDeConciliacoesPendentes`, de dentro do callback de um
 * `unstable_cache` — e esse callback não pode ler cookies. `withUserDbFor`
 * existe exatamente para isso; ver o docblock dele em `lib/db/rls.ts`.
 */
export async function contarPropostasPendentes(orgId: string, userId: string): Promise<number> {
  return withUserDbFor(userId, async (db) => {
    const [row] = await db
      .select({ total: count() })
      .from(forecastMatchProposals)
      .where(
        and(
          eq(forecastMatchProposals.orgId, orgId),
          eq(forecastMatchProposals.status, 'pending'),
        ),
      )

    return Number(row?.total ?? 0)
  })
}
