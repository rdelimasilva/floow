import { and, eq, isNull } from 'drizzle-orm'
import { getDb, counterparties } from '@floow/db'
import type { NormalizedPolpTransaction } from '@floow/core-finance'
import { counterpartyKeyFor, compositeKey, type CounterpartyKey } from './counterparty-key'

/**
 * Resolução de contraparte — o Nível 2 da ingestão. Nível 1 (sinal estrutural
 * do BCB) já resolveu em `normalize.ts`, puro; aqui é onde a identidade
 * encontra (ou cria) a decisão gravada pelo usuário.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */

type Db = ReturnType<typeof getDb>

export interface CounterpartyRecord {
  id: string
  keyType: 'tax_id' | 'description'
  keyValue: string
  direction: 'in' | 'out'
  accountId: string | null
  nature: 'income' | 'expense' | 'transfer' | null
  categoryId: string | null
  confirmedAt: Date | null
}

export interface ResolvedTransaction extends NormalizedPolpTransaction {
  reviewState: 'confirmed' | 'pending'
  counterpartyId: string | null
  /**
   * Autoritativa sempre que `counterpartyId` não é null — null enquanto
   * pendente, o que o `categoryId` da contraparte diz quando confirmada.
   * Quem persiste (sync.ts) só deixa `matchCategory`/`categoryByRef`
   * decidirem quando `counterpartyId` é null (Nível 1, sem contraparte).
   */
  categoryId: string | null
}

/** Todas as contrapartes da org, uma vez por chamada de sincronização — o
 * mesmo padrão que `loadCategoryIndex`/`loadRules` já usam em `sync.ts`. O
 * volume por org é de centenas, não milhares: uma varredura cabe em memória
 * sem paginação. */
export async function loadCounterpartyIndex(db: Db, orgId: string): Promise<Map<string, CounterpartyRecord>> {
  const rows = await db.select().from(counterparties).where(eq(counterparties.orgId, orgId))
  const index = new Map<string, CounterpartyRecord>()
  for (const row of rows) {
    const record: CounterpartyRecord = {
      id: row.id,
      keyType: row.keyType,
      keyValue: row.keyValue,
      direction: row.direction,
      accountId: row.accountId,
      nature: row.nature,
      categoryId: row.categoryId,
      confirmedAt: row.confirmedAt,
    }
    index.set(compositeKey(record as CounterpartyKey), record)
  }
  return index
}

/**
 * Resolve UMA transação normalizada contra o índice da org, mutando o índice
 * quando cria uma contraparte nova — para que a segunda ocorrência da mesma
 * contraparte, na MESMA sincronização, não bata no banco de novo.
 */
export async function resolveCounterparty(
  db: Db,
  orgId: string,
  accountId: string,
  tx: NormalizedPolpTransaction,
  index: Map<string, CounterpartyRecord>,
): Promise<ResolvedTransaction> {
  if (tx.natureConfirmed) {
    return { ...tx, reviewState: 'confirmed', counterpartyId: null, categoryId: null }
  }

  const key = counterpartyKeyFor(tx, accountId)
  if (!key) {
    return { ...tx, reviewState: 'pending', counterpartyId: null, categoryId: null }
  }

  const k = compositeKey(key)
  let record = index.get(k)

  if (!record) {
    const [insertedRow] = await db
      .insert(counterparties)
      .values({
        orgId,
        keyType: key.keyType,
        keyValue: key.keyValue,
        direction: key.direction,
        accountId: key.accountId,
        displayName: tx.counterpartyName ?? tx.description,
      })
      .onConflictDoNothing()
      .returning()

    if (insertedRow) {
      record = {
        id: insertedRow.id,
        keyType: insertedRow.keyType,
        keyValue: insertedRow.keyValue,
        direction: insertedRow.direction,
        accountId: insertedRow.accountId,
        nature: insertedRow.nature,
        categoryId: insertedRow.categoryId,
        confirmedAt: insertedRow.confirmedAt,
      }
    } else {
      // Colidiu com outra página/sync criando a mesma contraparte entre o
      // SELECT do índice e este INSERT. Busca a linha que venceu a corrida.
      //
      // O filtro de `accountId` aqui não é opcional: chave `description` tem
      // índice único parcial ESCOPADO por conta (migração 00035) — duas
      // contas da mesma org podem ter contraparte-descrição legítima e
      // distinta com o mesmo `keyValue`/`direction`. Sem este filtro, uma
      // corrida real devolveria a linha da conta errada. Para `tax_id`,
      // `key.accountId` é sempre null e `isNull` é o filtro certo (o índice
      // único parcial desse caso já garante uma linha só).
      const [existing] = await db
        .select()
        .from(counterparties)
        .where(
          and(
            eq(counterparties.orgId, orgId),
            eq(counterparties.keyType, key.keyType),
            eq(counterparties.keyValue, key.keyValue),
            eq(counterparties.direction, key.direction),
            key.accountId === null
              ? isNull(counterparties.accountId)
              : eq(counterparties.accountId, key.accountId),
          ),
        )
        .limit(1)
      record = existing
        ? {
            id: existing.id,
            keyType: existing.keyType,
            keyValue: existing.keyValue,
            direction: existing.direction,
            accountId: existing.accountId,
            nature: existing.nature,
            categoryId: existing.categoryId,
            confirmedAt: existing.confirmedAt,
          }
        : undefined
    }

    if (record) index.set(k, record)
  }

  if (!record) {
    // Não deveria acontecer (o insert ou o select de corrida sempre acham
    // algo), mas cair pendente sem contraparte é o desfecho seguro se
    // acontecer — nunca perder a transação.
    return { ...tx, reviewState: 'pending', counterpartyId: null, categoryId: null }
  }

  if (record.confirmedAt) {
    return {
      ...tx,
      type: record.nature ?? tx.type,
      reviewState: 'confirmed',
      counterpartyId: record.id,
      categoryId: record.categoryId,
    }
  }

  return { ...tx, reviewState: 'pending', counterpartyId: record.id, categoryId: null }
}
