import { and, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm'
import { getDb, accounts, openfinanceResources, transactions, transactionNatureRules } from '@floow/db'
import {
  detectNatureSuspects,
  type ConnectedCard,
  type KnownTransfer,
  type SuspectCandidate,
  type SuspectGroup,
} from './nature-suspects'
import { natureForDescription, type NatureRule } from './nature-rules'

/**
 * O que o detector precisa saber, buscado do banco.
 *
 * Sem cache de RSC: o resultado muda a cada confirmação do usuário e a cada
 * sincronização, e servir uma versão de sessenta segundos atrás faria o banner
 * anunciar grupos que o usuário acabou de resolver.
 */

/**
 * Janela do detector. Treze meses cobrem o histórico que o orçamento e o pacing
 * usam; ir além encareceria a consulta sem mudar decisão nenhuma.
 */
const LOOKBACK_MONTHS = 13

/** Tipos de conta onde o problema existe. Cartão não entra: veio limpo. */
const CASH_ACCOUNT_TYPES = ['checking', 'savings'] as const

/**
 * Primeiro dia do mês de treze meses atrás.
 *
 * `setMonth(getMonth() - 13)` transborda: em 31 de março, "13 meses atrás" cai
 * em 31 de fevereiro, que o JavaScript escorrega para 2 ou 3 de março — a
 * janela encolhe um mês inteiro, e só nos dias 29 a 31. Ancorar no dia 1 não
 * tem dia inexistente para escorregar, e o corte fica igual todo dia do mês.
 */
function lookbackDate(): Date {
  const hoje = new Date()
  return new Date(hoje.getFullYear(), hoje.getMonth() - LOOKBACK_MONTHS, 1)
}

export async function getNatureSuspects(orgId: string): Promise<SuspectGroup[]> {
  const db = getDb()
  const cutoff = lookbackDate()

  const [rows, transferRows, cardRows, ruleRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        accountName: accounts.name,
        description: transactions.description,
        amountCents: transactions.amountCents,
        categoryRef: transactions.categoryRef,
        polpType: transactions.polpType,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.orgId, orgId),
          inArray(accounts.type, [...CASH_ACCOUNT_TYPES]),
          eq(transactions.type, 'expense'),
          // Só dado do Open Finance. Lançamento manual do usuário é decisão
          // dele, e o app não tem o que sugerir sobre ela.
          isNotNull(transactions.externalId),
          isNull(transactions.transferGroupId),
          gte(transactions.date, cutoff),
        ),
      ),

    db
      .select({
        accountId: transactions.accountId,
        description: transactions.description,
        // O detector descarta as entradas: reembolso não contradiz a despesa
        // que ele devolve. O filtro mora lá, junto do motivo e do teste.
        amountCents: transactions.amountCents,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.orgId, orgId),
          inArray(accounts.type, [...CASH_ACCOUNT_TYPES]),
          eq(transactions.type, 'transfer'),
          isNotNull(transactions.externalId),
          gte(transactions.date, cutoff),
        ),
      ),

    // O rótulo do recurso e o nome da conta espelho, juntos: o usuário costuma
    // batizar a conta com um pedaço do nome que o banco não mandou.
    db
      .select({
        displayLabel: openfinanceResources.displayLabel,
        digits: openfinanceResources.identificationDigits,
        accountName: accounts.name,
      })
      .from(openfinanceResources)
      .innerJoin(accounts, eq(accounts.id, openfinanceResources.accountId))
      .where(
        and(
          eq(openfinanceResources.orgId, orgId),
          eq(openfinanceResources.resourceType, 'CREDIT_CARD_ACCOUNT'),
        ),
      ),

    db
      .select()
      .from(transactionNatureRules)
      .where(eq(transactionNatureRules.orgId, orgId)),
  ])

  const rules: NatureRule[] = ruleRows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    matchType: row.matchType,
    matchValue: row.matchValue,
    nature: row.nature,
    priority: row.priority,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt,
  }))

  // Grupo que o usuário já respondeu não volta a perguntar — inclusive quando a
  // resposta foi "é despesa mesmo". Um alerta que não se resolve é um alerta que
  // se aprende a ignorar.
  const candidates: SuspectCandidate[] = rows.filter(
    (row) => natureForDescription(row.description, row.accountId, rules) === undefined,
  )

  const cards: ConnectedCard[] = cardRows.map((row) => ({
    label: [row.displayLabel, row.accountName].filter(Boolean).join(' '),
    digits: row.digits,
  }))

  const knownTransfers: KnownTransfer[] = transferRows

  return detectNatureSuspects({ candidates, cards, knownTransfers })
}
