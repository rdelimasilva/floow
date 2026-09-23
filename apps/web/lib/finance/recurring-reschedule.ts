import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import type { RecurringFrequency } from '@floow/core-finance'
import { dataDeCalendario, redistribuirParcelas } from './recurring-dates'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * As parcelas que ainda são previsão pura, de hoje em diante. São as que a
 * edição da data da recorrência pode mover — o resto tem data que o banco deu
 * (saldo aplicado ou casada) ou que o usuário decidiu deixar (ignorada).
 */
export function condicoesDeParcelasPendentes(orgId: string, templateId: string, hojeStr: string) {
  return [
    eq(transactions.orgId, orgId),
    eq(transactions.recurringTemplateId, templateId),
    eq(transactions.balanceApplied, false),
    isNull(transactions.matchedTransactionId),
    eq(transactions.isIgnored, false),
    sql`${transactions.date} >= ${hojeStr}::date`,
  ]
}

/**
 * Move as parcelas pendentes para começar em `novaData`, espaçadas pela
 * `frequencia`. Não faz nada se a primeira já está em `novaData` e a
 * frequência não mudou.
 *
 * `nextDueDate` é o que o template passa a ter — um período depois da última
 * parcela, como na criação — ou `null` quando nada mudou. Com `pendentes = 0`
 * não há parcela para mover e quem chama grava `novaData` direto no template.
 */
export async function reagendarParcelasPendentes(
  tx: Tx,
  params: {
    orgId: string
    templateId: string
    novaData: string
    frequencia: RecurringFrequency
    frequenciaMudou: boolean
    hojeStr: string
  },
): Promise<{ pendentes: number; movidas: number; nextDueDate: Date | null }> {
  const { orgId, templateId, novaData, frequencia, frequenciaMudou, hojeStr } = params

  const pendentes = await tx
    .select({ id: transactions.id, date: transactions.date })
    .from(transactions)
    .where(and(...condicoesDeParcelasPendentes(orgId, templateId, hojeStr)))
    .orderBy(asc(transactions.date), asc(transactions.installmentNumber))

  if (pendentes.length === 0) return { pendentes: 0, movidas: 0, nextDueDate: null }

  if (dataDeCalendario(pendentes[0].date) === novaData && !frequenciaMudou) {
    return { pendentes: pendentes.length, movidas: 0, nextDueDate: null }
  }

  // Uma data a mais: a última vira o `next_due_date` do template.
  const datas = redistribuirParcelas(novaData, frequencia, pendentes.length + 1)

  let movidas = 0
  for (let i = 0; i < pendentes.length; i++) {
    if (dataDeCalendario(pendentes[i].date) === datas[i]) continue
    await tx
      .update(transactions)
      .set({ date: new Date(datas[i]) })
      .where(and(eq(transactions.id, pendentes[i].id), eq(transactions.orgId, orgId)))
    movidas++
  }

  return { pendentes: pendentes.length, movidas, nextDueDate: new Date(datas[pendentes.length]) }
}
