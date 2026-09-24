// apps/web/lib/openfinance/parcelas-previstas.ts
import { and, eq, isNotNull } from 'drizzle-orm'
import { transactions } from '@floow/db'
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
 * O que muda na linha da previsão quando a parcela real chega. A categoria
 * só vem se a real trouxer uma — a da previsão pode ter sido escolhida pelo
 * usuário.
 */
export function camposDaOcupacao(
  real: { externalId: string; amountCents: number; description: string; date: string; categoryId: string | null },
  hoje: Date,
) {
  const date = new Date(`${real.date}T12:00:00Z`)
  const fimDeHoje = new Date(hoje)
  fimDeHoje.setHours(23, 59, 59, 999)
  return {
    externalId: real.externalId,
    amountCents: real.amountCents,
    description: real.description,
    date,
    isInstallmentForecast: false as const,
    balanceApplied: date <= fimDeHoje,
    importedAt: new Date(),
    ...(real.categoryId ? { categoryId: real.categoryId } : {}),
  }
}

export async function carregarDiaDeVencimento(db: Db, orgId: string, accountId: string): Promise<number | null> {
  const rows = await db
    .select({ d: transactions.billPostDate })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.accountId, accountId), isNotNull(transactions.billPostDate)))
    .limit(200)
  return diaDeVencimentoMaisComum(rows.map((r) => (r.d as Date).toISOString().slice(0, 10)))
}

export async function acharPrevisao(
  db: Db,
  orgId: string,
  accountId: string,
  chave: { purchaseDate: string; installmentTotal: number; installmentNumber: number },
): Promise<string | null> {
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
    .limit(1)
  return row?.id ?? null
}
