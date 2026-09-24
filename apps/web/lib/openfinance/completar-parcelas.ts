import { and, eq, gt, isNotNull, sql } from 'drizzle-orm'
import { transactions } from '@floow/db'
import { planejarParcelasFaltantes, type ParcelaConhecida, type ParcelaPlanejada } from '@floow/core-finance'
import type { Db } from './persist-page'

/**
 * Cria como previsão as parcelas que a Polp ainda não mandou.
 *
 * Compras antigas chegam só com as parcelas já faturadas (Airbnb 6x veio com
 * 1 e 2). Sem isto, os meses seguintes pareceriam livres. A previsão não tem
 * `external_id`, então `applyDueBankTransactions` nunca a põe no saldo; a
 * parcela real a ocupa em `persistPage` quando chega.
 */
function dia(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function linhaDaPrevisao(
  p: ParcelaPlanejada,
  ctx: { orgId: string; accountId: string },
): typeof transactions.$inferInsert {
  const n = String(p.installmentNumber).padStart(2, '0')
  const t = String(p.installmentTotal).padStart(2, '0')
  return {
    orgId: ctx.orgId,
    accountId: ctx.accountId,
    categoryId: p.categoryId,
    type: 'expense',
    amountCents: p.amountCents,
    description: `${p.description} ${n}/${t}`,
    date: new Date(`${p.date}T12:00:00Z`),
    purchaseDate: new Date(`${p.purchaseDate}T12:00:00Z`),
    installmentNumber: p.installmentNumber,
    installmentTotal: p.installmentTotal,
    isInstallmentForecast: true,
    externalId: null,
    recurringTemplateId: null,
    balanceApplied: false,
    isAutoCategorized: p.categoryId !== null,
  }
}

export async function completarParcelas(db: Db, orgId: string, accountId: string): Promise<number> {
  return db.transaction(async (tx) => {
    // Não dá para travar isso com índice único: o agrupamento por compra usa
    // valor ±1% (tolerância do arredondamento entre parcelas), e índice único
    // só compara igualdade exata. O lock de advisory, preso à transação e à
    // conta, serve exatamente para isso — o segundo sync concorrente espera,
    // entra depois que o primeiro já gravou as previsões, e não planeja nada.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`completar-parcelas:${accountId}`}))`)

    // Previsão aberta cuja parcela real já entrou em outra linha (a real não
    // ocupou a previsão: perdeu a corrida ou chegou antes dela) sobra contando
    // duas vezes no "a vencer" e no saldo projetado. Sai antes de planejar.
    await tx.delete(transactions).where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.isInstallmentForecast, true),
        eq(transactions.balanceApplied, false),
        sql`EXISTS (
          SELECT 1 FROM transactions AS real
          WHERE real.account_id = ${transactions.accountId}
            AND real.is_installment_forecast = false
            AND real.purchase_date = ${transactions.purchaseDate}
            AND real.installment_total = ${transactions.installmentTotal}
            AND real.installment_number = ${transactions.installmentNumber}
        )`,
      ),
    )

    const rows = await tx
      .select({
        purchaseDate: transactions.purchaseDate,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
        amountCents: transactions.amountCents,
        date: transactions.date,
        description: transactions.description,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.accountId, accountId),
          isNotNull(transactions.purchaseDate),
          gt(transactions.installmentTotal, 1),
          isNotNull(transactions.installmentNumber),
        ),
      )

    const conhecidas: ParcelaConhecida[] = rows.map((r) => ({
      purchaseDate: dia(r.purchaseDate as Date),
      installmentNumber: r.installmentNumber as number,
      installmentTotal: r.installmentTotal as number,
      amountCents: r.amountCents,
      date: dia(r.date),
      description: r.description,
      categoryId: r.categoryId,
    }))

    const planejadas = planejarParcelasFaltantes(conhecidas)
    if (planejadas.length === 0) return 0

    const inseridas = await tx
      .insert(transactions)
      .values(planejadas.map((p) => linhaDaPrevisao(p, { orgId, accountId })))
      .returning({ id: transactions.id })
    return inseridas.length
  })
}
