import { and, eq, lt, or, sql } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import { extrairApuracaoDoSaldo, extrairSaldoDisponivelCents, type PolpClient } from '@floow/core-finance'
import type { Db } from './persist-page'

/**
 * O saldo da conta antes do primeiro lançamento do extrato.
 *
 * O extrato do Open Finance começa num dia qualquer (o Itaú, em 09/09/2025),
 * e a conta já tinha dinheiro antes dele: R$ 269,52. Somando só o extrato, o
 * app nunca chega ao saldo do banco, e conta conectada não aceita ajuste à mão
 * (`account-actions.ts`) — o saldo anterior não tinha por onde entrar.
 *
 * Sai só do banco: o saldo que ele informa menos a soma do extrato que ele
 * mandou até a apuração desse saldo. Nada do que o app tem entra na conta,
 * então lançamento duplicado ou faltando continua aparecendo como diferença.
 *
 * Gravado uma vez, no dia anterior ao primeiro lançamento. Só é refeito
 * quando a releitura pede (`refazer`), e ela pede uma vez por versão do sync
 * que muda a conta. Refazer a cada leitura parece robusto e não é: o extrato
 * às vezes anda atrás do banco. Em 15/10/2026 o Itaú debitou a fatura da Visa
 * (R$ 1.509,30) de madrugada e o extrato só a trouxe no dia seguinte,
 * carimbada depois da apuração. A releitura daquele dia trocou os R$ 698,63
 * certos por −R$ 810,67, e a Visa, ao chegar, contou duas vezes. Diferença que
 * persiste é para o aviso de divergência mostrar, não para o saldo de abertura
 * engolir.
 *
 * Quando a janela do Open Finance anda, o começo do extrato deixa de vir e o
 * valor congela de vez. Só em conta cujo histórico começa no extrato — linha
 * mais antiga que ele é saldo de outra origem (OFX, lançamento manual) e já
 * cobre esse período.
 */

export const ID_SALDO_DE_ABERTURA = 'saldo-de-abertura'

export interface ExtratoLido {
  /** Soma do extrato até a apuração do saldo (inclusive). */
  somaAte: (apuracao: Date) => number
  /** Primeiro dia do extrato, AAAA-MM-DD. */
  primeiroDia: string
  /** Algum item não foi lido: a soma estaria incompleta. */
  incompleto: boolean
}

function diaAnterior(d: string): string {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() - 1)
  return x.toISOString().slice(0, 10)
}

function diaEmSaoPaulo(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Soma do extrato até a apuração. Pelo instante, no segundo: a apuração vem
 * sem milésimos e é o instante do último lançamento. Sem instante, pelo dia.
 */
export function somarExtratoAte(
  itens: { date: string; ocorridoEm: string | null; amountCents: number }[],
  apuracao: Date,
): number {
  const dia = diaEmSaoPaulo(apuracao)
  const limite = Math.floor(apuracao.getTime() / 1000)
  return itens.reduce((soma, i) => {
    const antes = i.ocorridoEm ? Math.floor(new Date(i.ocorridoEm).getTime() / 1000) <= limite : i.date <= dia
    return antes ? soma + i.amountCents : soma
  }, 0)
}

/** O saldo de abertura, em centavos. */
export function calcularSaldoDeAbertura(saldoDoBancoCents: number, somaDoExtratoCents: number): number {
  return saldoDoBancoCents - somaDoExtratoCents
}

export async function registrarSaldoDeAbertura(
  db: Db,
  client: PolpClient,
  args: {
    orgId: string
    accountId: string
    polpResourceId: string
    extrato: ExtratoLido
    /** Troca o valor já gravado pela leitura de agora. Sem isso, o gravado fica. */
    refazer: boolean
  },
): Promise<number | null> {
  const { orgId, accountId, polpResourceId, extrato, refazer } = args
  if (extrato.incompleto) return null

  const [jaTem] = await db
    .select({ id: transactions.id, amountCents: transactions.amountCents, date: transactions.date })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.accountId, accountId), eq(transactions.externalId, ID_SALDO_DE_ABERTURA)))
    .limit(1)
  if (jaTem && !refazer) return null
  // A janela andou: o extrato que a soma precisa já não vem.
  if (jaTem && jaTem.date.toISOString().slice(0, 10) !== diaAnterior(extrato.primeiroDia)) return null

  // O próprio saldo de abertura é anterior ao extrato: só confere sem ele.
  // Ajuste de saldo feito à mão já acertou a conta; somar a abertura contaria duas vezes.
  const [anterior] = jaTem ? [] : await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, accountId),
      eq(transactions.isIgnored, false),
      or(lt(transactions.date, new Date(`${extrato.primeiroDia}T00:00:00Z`)), eq(transactions.origem, 'ajuste')),
    ))
    .limit(1)
  if (anterior) return null

  const detalhe = await client.getResourceDetail('ACCOUNT', polpResourceId).catch(() => null)
  const saldo = extrairSaldoDisponivelCents(detalhe)
  const apuracao = extrairApuracaoDoSaldo(detalhe)
  if (saldo == null || !apuracao) return null

  const abertura = calcularSaldoDeAbertura(saldo, extrato.somaAte(apuracao))

  if (jaTem) {
    const delta = abertura - jaTem.amountCents
    if (delta === 0) return null
    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({ amountCents: abertura, type: abertura >= 0 ? 'income' : 'expense' })
        .where(and(eq(transactions.id, jaTem.id), eq(transactions.orgId, orgId)))
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${delta}` })
        .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    })
    return abertura
  }

  if (abertura === 0) return 0

  await db.transaction(async (tx) => {
    await tx.insert(transactions).values({
      orgId,
      accountId,
      type: abertura > 0 ? 'income' : 'expense',
      amountCents: abertura,
      description: 'Saldo inicial (antes do extrato do Open Finance)',
      date: new Date(`${diaAnterior(extrato.primeiroDia)}T12:00:00Z`),
      externalId: ID_SALDO_DE_ABERTURA,
      balanceApplied: true,
      origem: 'ajuste',
      // Dinheiro que já estava na conta, não entrada do mês.
      affectsCashFlow: false,
      reviewState: 'confirmed',
    })
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${abertura}` })
      .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
  })
  return abertura
}
