/**
 * Implementação real (Drizzle + Claude) das deps da sugestão da fila. Roda
 * dentro da importação, sem usuário na requisição: usa o mesmo `db` de
 * serviço do sync, e cada query filtra por org_id.
 */
import { and, eq, gte, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm'
import { categories, counterparties, hiddenSystemCategories, transactions } from '@floow/db'
import { condicaoForaDeParDeTransferenciaPendente } from '@/lib/finance/forecast-match-db'
import { createCounterpartyClassifier } from './classificador-contraparte'
import type { Db } from './persist-page'
import type { SugestaoDaFilaDeps, GrupoPendente } from './sugestao-da-fila'

/** Janela do histórico que decide o destino: o hábito recente do usuário. */
const MESES_DE_HISTORICO = 12

export function sugestaoDaFilaDeps(db: Db): SugestaoDaFilaDeps {
  return {
    classificar: createCounterpartyClassifier(),

    async carregarPendentes(orgId) {
      const rows = await db
        .select({
          counterpartyId: counterparties.id,
          displayName: counterparties.displayName,
          keyType: counterparties.keyType,
          keyValue: counterparties.keyValue,
          description: transactions.description,
          type: transactions.type,
          amountCents: transactions.amountCents,
        })
        .from(transactions)
        .innerJoin(counterparties, eq(counterparties.id, transactions.counterpartyId))
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.reviewState, 'pending'),
            isNull(counterparties.confirmedAt),
            isNull(counterparties.autoAttemptedAt),
            condicaoForaDeParDeTransferenciaPendente(),
          ),
        )

      const grupos = new Map<string, GrupoPendente & { tipos: Set<string> }>()
      for (const r of rows) {
        const g = grupos.get(r.counterpartyId) ?? {
          counterpartyId: r.counterpartyId,
          displayName: r.displayName,
          keyType: r.keyType,
          keyValue: r.keyValue,
          nature: null,
          descricoes: [],
          count: 0,
          totalCents: 0,
          tipos: new Set<string>(),
        }
        g.descricoes.push(r.description)
        g.count++
        g.totalCents += r.amountCents
        g.tipos.add(r.type)
        grupos.set(r.counterpartyId, g)
      }
      return [...grupos.values()].map(({ tipos, ...g }) => {
        const [unico] = [...tipos]
        const nature = tipos.size === 1 && (unico === 'expense' || unico === 'income') ? unico : null
        return { ...g, nature }
      })
    },

    async carregarHistorico(orgId) {
      const desde = new Date()
      desde.setMonth(desde.getMonth() - MESES_DE_HISTORICO)
      const rows = await db
        .select({ description: transactions.description, categoryId: transactions.categoryId })
        .from(transactions)
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.reviewState, 'confirmed'),
            eq(transactions.isIgnored, false),
            isNotNull(transactions.categoryId),
            inArray(transactions.type, ['expense', 'income']),
            gte(transactions.date, desde),
          ),
        )
      return rows.map((r) => ({ description: r.description, categoryId: r.categoryId! }))
    },

    async carregarCategorias(orgId) {
      return db
        .select({
          id: categories.id,
          name: categories.name,
          parentId: categories.parentId,
          polpRef: categories.polpRef,
          type: categories.type,
        })
        .from(categories)
        .where(
          and(
            or(eq(categories.orgId, orgId), isNull(categories.orgId)),
            notExists(
              db
                .select({ one: sql`1` })
                .from(hiddenSystemCategories)
                .where(and(eq(hiddenSystemCategories.orgId, orgId), eq(hiddenSystemCategories.categoryId, categories.id))),
            ),
          ),
        )
    },

    async sugerir(orgId, sugestao) {
      await db
        .update(counterparties)
        .set({ suggestedCategoryId: sugestao.categoryId, suggestionSource: sugestao.origem, updatedAt: new Date() })
        .where(
          and(
            eq(counterparties.id, sugestao.counterpartyId),
            eq(counterparties.orgId, orgId),
            // Já confirmada pelo usuário: a sugestão não serve mais.
            isNull(counterparties.confirmedAt),
          ),
        )
    },

    async marcarTentativa(orgId, counterpartyIds) {
      await db
        .update(counterparties)
        .set({ autoAttemptedAt: new Date() })
        .where(and(eq(counterparties.orgId, orgId), inArray(counterparties.id, counterpartyIds)))
    },
  }
}
