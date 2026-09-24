// apps/web/lib/openfinance/parcelas-previstas.ts
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import { dataDaParcela, diaDeVencimentoMaisComum } from '@floow/core-finance'
import type { Db } from './persist-page'

/**
 * Parcela de cartão: data final e casamento com a previsão.
 *
 * A normalização não vê o banco e, sem fatura fechada, põe a parcela no dia
 * 1 do mês previsto. Aqui o dia vira o vencimento que o cartão já mostrou.
 */
export function dataFinalDaParcela(
  tx: { date: string; purchaseDate: string | null; billPostDate: string | null; billForecastMonth: string | null },
  diaDeVencimento: number | null,
): string {
  if (!tx.purchaseDate || tx.billPostDate) return tx.date
  return dataDaParcela(
    { billPostDate: null, billForecastMonth: tx.billForecastMonth, purchaseDate: tx.purchaseDate },
    diaDeVencimento,
  )
}

/**
 * Hoje em São Paulo, AAAA-MM-DD — o mesmo corte de `applyDueBankTransactions`.
 * O fim do dia no fuso do servidor (UTC) punha no saldo, às 21h, a parcela
 * que só vence amanhã.
 */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * O que muda na linha da previsão quando a parcela real chega. A categoria
 * só vem se a real trouxer uma — a da previsão pode ter sido escolhida pelo
 * usuário.
 */
export function camposDaOcupacao(
  real: { externalId: string; amountCents: number; description: string; date: string; categoryId: string | null },
  hoje: Date,
) {
  const date = new Date(`${real.date}T12:00:00Z`)
  return {
    externalId: real.externalId,
    amountCents: real.amountCents,
    description: real.description,
    date,
    isInstallmentForecast: false as const,
    balanceApplied: real.date <= hojeEmSaoPaulo(hoje),
    importedAt: new Date(),
    ...(real.categoryId ? { categoryId: real.categoryId } : {}),
  }
}

export async function carregarDiaDeVencimento(db: Db, orgId: string, accountId: string): Promise<number | null> {
  const rows = await db
    .select({ d: transactions.billPostDate })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.accountId, accountId), isNotNull(transactions.billPostDate)))
    .orderBy(desc(transactions.billPostDate))
    .limit(200)
  return diaDeVencimentoMaisComum(rows.map((r) => (r.d as Date).toISOString().slice(0, 10)))
}

export async function acharPrevisao(
  db: Db,
  orgId: string,
  accountId: string,
  chave: { purchaseDate: string; installmentTotal: number; installmentNumber: number; amountCents: number },
): Promise<string | null> {
  // Duas compras no mesmo dia com o mesmo total de parcelas dividem a chave;
  // a previsão de valor mais próximo do real é a da mesma compra.
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.isInstallmentForecast, true),
        eq(transactions.purchaseDate, new Date(`${chave.purchaseDate}T12:00:00Z`)),
        eq(transactions.installmentTotal, chave.installmentTotal),
        eq(transactions.installmentNumber, chave.installmentNumber),
      ),
    )
    .orderBy(sql`abs(${transactions.amountCents} - ${chave.amountCents})`)
    .limit(1)
  return row?.id ?? null
}

/**
 * Ocupa a previsão com a parcela real, atômico o bastante para dois syncs
 * concorrentes não somarem o saldo duas vezes: o UPDATE só pega a linha se
 * ela ainda for previsão aberta (`is_installment_forecast = true AND
 * balance_applied = false`) — se outro sync já ocupou primeiro, `returning`
 * vem vazio e este devolve `false` sem tocar no saldo. A categoria da
 * previsão nunca é apagada: só entra a da real quando a previsão não tem
 * nenhuma (`COALESCE`).
 */
export async function ocuparPrevisao(
  db: Db,
  input: {
    orgId: string
    accountId: string
    previsaoId: string
    campos: ReturnType<typeof camposDaOcupacao>
    extras: Partial<typeof transactions.$inferInsert>
  },
): Promise<boolean> {
  const { categoryId: categoriaDaReal, ...camposSemCategoria } = input.campos
  return db.transaction(async (dbTx) => {
    const [row] = await dbTx
      .update(transactions)
      .set({
        ...camposSemCategoria,
        ...input.extras,
        ...(categoriaDaReal
          ? { categoryId: sql`COALESCE(${transactions.categoryId}, ${categoriaDaReal})` }
          : {}),
      })
      .where(
        and(
          eq(transactions.id, input.previsaoId),
          eq(transactions.orgId, input.orgId),
          eq(transactions.isInstallmentForecast, true),
          eq(transactions.balanceApplied, false),
        ),
      )
      .returning({ id: transactions.id })

    if (!row) return false

    // A previsão nunca esteve no saldo; a real entra uma vez, se já venceu.
    if (input.campos.balanceApplied) {
      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${input.campos.amountCents}` })
        .where(eq(accounts.id, input.accountId))
    }

    return true
  })
}
