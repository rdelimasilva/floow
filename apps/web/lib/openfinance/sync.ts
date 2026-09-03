import { and, desc, eq, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm'
import {
  getDb,
  accounts,
  categories,
  categoryRules,
  hiddenSystemCategories,
  openfinanceConnections,
  openfinanceResources,
  transactions,
} from '@floow/db'
import {
  matchCategory,
  normalizeAccountTransaction,
  normalizeCardTransaction,
  type CategoryRule,
  type NormalizedPolpTransaction,
  type PolpClient,
} from '@floow/core-finance'

/**
 * Importação das transações de uma conexão Open Finance.
 *
 * Puxada, não empurrada: o usuário aciona e esta função busca. O webhook, quando
 * existir, vai chamar exatamente o mesmo caminho com uma janela menor — ele é um
 * gatilho mais rápido, não outra implementação.
 *
 * O `org_id` NUNCA vem do dado remoto. Vem da conexão, que foi gravada com a
 * sessão do usuário no momento em que ele conectou o banco.
 */

type Db = ReturnType<typeof getDb>

export interface SyncSummary {
  imported: number
  updated: number
  /** Recursos sem conta vinculada — o dado existe na Polp e não tem onde entrar. */
  skippedUnlinked: number
}

export async function syncConnectionTransactions(
  db: Db,
  client: PolpClient,
  connection: { id: string; orgId: string },
): Promise<SyncSummary> {
  const resources = await db
    .select()
    .from(openfinanceResources)
    .where(eq(openfinanceResources.connectionId, connection.id))

  const [categoryByRef, rules, creditCardConnected] = await Promise.all([
    loadCategoryIndex(db, connection.orgId),
    loadRules(db, connection.orgId),
    hasLinkedCreditCard(db, connection.orgId),
  ])

  const summary: SyncSummary = { imported: 0, updated: 0, skippedUnlinked: 0 }

  for (const resource of resources) {
    if (!resource.accountId) {
      summary.skippedUnlinked++
      continue
    }

    // Primeira sincronização puxa tudo; as seguintes pedem só o que mudou
    // desde a última. `fromUpdatedAt` e não `fromDate` de propósito: a
    // counterparty e a categoria chegam depois, na mesma transação, e é a data
    // de atualização que as traz de volta.
    const query = resource.lastSyncedAt
      ? { fromUpdatedAt: resource.lastSyncedAt.toISOString() }
      : {}

    const startedAt = new Date()
    const pages =
      resource.resourceType === 'CREDIT_CARD_ACCOUNT'
        ? mapPages(client.streamCardTransactions(resource.polpResourceId, query), normalizeCardTransaction)
        : mapPages(client.streamAccountTransactions(resource.polpResourceId, query), (tx) =>
            // `creditCardConnected` decide o destino do pagamento de fatura que
            // aparece na conta corrente. Sem passá-lo, o pagamento entrava como
            // despesa ao lado das compras do cartão e o mês de cartão era
            // contado DUAS vezes no orçamento.
            normalizeAccountTransaction(tx, { creditCardConnected }),
          )

    for await (const page of pages) {
      const result = await persistPage(db, {
        orgId: connection.orgId,
        accountId: resource.accountId,
        normalized: page,
        categoryByRef,
        rules,
      })
      summary.imported += result.imported
      summary.updated += result.updated
    }

    await db
      .update(openfinanceResources)
      .set({ lastSyncedAt: startedAt, updatedAt: new Date() })
      .where(eq(openfinanceResources.id, resource.id))
  }

  await db
    .update(openfinanceConnections)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(openfinanceConnections.id, connection.id))

  return summary
}

async function* mapPages<T>(
  pages: AsyncGenerator<T[]>,
  normalize: (tx: T) => NormalizedPolpTransaction,
): AsyncGenerator<NormalizedPolpTransaction[]> {
  for await (const page of pages) yield page.map(normalize)
}

/**
 * `polp_ref` -> id da categoria local, com a da org na frente.
 *
 * Desde o copy-on-write, editar uma categoria de sistema cria uma cópia da org
 * carregando o mesmo `polp_ref`. As duas passam a existir, e a importação tem
 * de escolher a da org: é nela que estão o nome que o usuário deu e o histórico
 * que foi movido junto. Sem a precedência, a escolha dependeria da ordem em que
 * o banco devolvesse as linhas.
 */
async function loadCategoryIndex(db: Db, orgId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: categories.id, polpRef: categories.polpRef, orgId: categories.orgId })
    .from(categories)
    .where(
      and(
        or(eq(categories.orgId, orgId), isNull(categories.orgId)),
        // Categoria que a org escondeu não recebe importação: melhor a
        // transação chegar sem categoria do que cair numa que ninguém vê.
        notExists(
          db
            .select({ one: sql`1` })
            .from(hiddenSystemCategories)
            .where(
              and(
                eq(hiddenSystemCategories.orgId, orgId),
                eq(hiddenSystemCategories.categoryId, categories.id),
              ),
            ),
        ),
      ),
    )

  const index = new Map<string, string>()
  for (const row of rows) {
    if (!row.polpRef) continue
    const daOrg = row.orgId !== null
    if (daOrg || !index.has(row.polpRef)) index.set(row.polpRef, row.id)
  }
  return index
}

/**
 * A org tem algum cartao de credito conectado E vinculado a uma conta?
 *
 * Se tem, o pagamento de fatura que aparece na conta corrente e transferencia:
 * as compras que ele quita ja entraram uma a uma. Se nao tem, aquele pagamento
 * e o unico registro daquele gasto e precisa contar como despesa.
 *
 * Limitacao conhecida: o critério é por org, nao por cartao. Quem tem um cartao
 * conectado e outro fora do floow vai ter o pagamento da fatura do segundo
 * tratado como transferencia, e aquele gasto fica subestimado. A transacao da
 * conta nao diz de qual cartao e a fatura, entao nao ha como casar sem chutar —
 * e chutar errado aqui dobra ou apaga um mes inteiro de gasto. O `category_ref`
 * original fica gravado, o que deixa o caso rastreavel para revisao.
 */
async function hasLinkedCreditCard(db: Db, orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: openfinanceResources.id })
    .from(openfinanceResources)
    .where(
      and(
        eq(openfinanceResources.orgId, orgId),
        eq(openfinanceResources.resourceType, 'CREDIT_CARD_ACCOUNT'),
        isNotNull(openfinanceResources.accountId),
      ),
    )
    .limit(1)

  return Boolean(row)
}

/**
 * Regras do usuario, ja filtradas e ordenadas.
 *
 * `matchCategory` NAO olha `isEnabled` — quem chama e que precisa tirar as
 * desligadas antes, senao uma regra que o usuario desativou volta a valer.
 */
async function loadRules(db: Db, orgId: string): Promise<CategoryRule[]> {
  const rows = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.orgId, orgId), eq(categoryRules.isEnabled, true)))
    .orderBy(desc(categoryRules.priority))

  return rows as CategoryRule[]
}

interface PersistInput {
  orgId: string
  accountId: string
  normalized: NormalizedPolpTransaction[]
  categoryByRef: Map<string, string>
  rules: CategoryRule[]
}

async function persistPage(
  db: Db,
  input: PersistInput,
): Promise<{ imported: number; updated: number }> {
  if (input.normalized.length === 0) return { imported: 0, updated: 0 }

  const externalIds = input.normalized.map((t) => t.externalId)

  // Quem já está no banco entra por UPDATE; o resto por INSERT. Separar antes
  // evita o upsert cego, que não diria quais linhas são novas — e sem isso não
  // há como somar o saldo apenas uma vez.
  const existing = await db
    .select({ id: transactions.id, externalId: transactions.externalId })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, input.orgId),
        eq(transactions.accountId, input.accountId),
        inArray(transactions.externalId, externalIds),
      ),
    )

  const existingByExternalId = new Map(existing.map((row) => [row.externalId, row.id]))
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const toInsert: (typeof transactions.$inferInsert)[] = []
  let updated = 0

  for (const tx of input.normalized) {
    const categoryId =
      matchCategory(tx.description, input.rules) ??
      (tx.categoryRef ? (input.categoryByRef.get(tx.categoryRef) ?? null) : null)

    const date = new Date(`${tx.date}T12:00:00Z`)
    const existingId = existingByExternalId.get(tx.externalId)

    if (existingId) {
      // Só o enriquecimento é atualizado. Valor, data e tipo ficam como
      // entraram: mexer neles depois exigiria desfazer o efeito no saldo, e
      // errar isso deixa o saldo errado em silêncio, que é o pior desfecho
      // possível num app de finanças.
      await db
        .update(transactions)
        .set({
          description: tx.description,
          categoryRef: tx.categoryRef,
          payeeMcc: tx.payeeMcc,
          billPostDate: tx.billPostDate ? new Date(`${tx.billPostDate}T12:00:00Z`) : null,
          billForecastMonth: tx.billForecastMonth,
          installmentNumber: tx.installmentNumber,
          installmentTotal: tx.installmentTotal,
          // Categoria manual do usuário nunca é sobrescrita (mesma regra da v1.1).
          ...(categoryId ? { categoryId: sql`COALESCE(${transactions.categoryId}, ${categoryId})` } : {}),
        })
        // O id ja veio de uma consulta filtrada por org; repetir o filtro aqui
        // e defesa em profundidade — no caminho do app o RLS nao vale, porque a
        // conexao usa o role dono do banco.
        .where(and(eq(transactions.id, existingId), eq(transactions.orgId, input.orgId)))

      updated++
      continue
    }

    // Lançamento agendado ainda não aconteceu: entra para o usuário ver, mas
    // fora das somas, senão vira gasto que ninguém fez.
    const isScheduled = tx.settlement === 'scheduled'
    const applied = !isScheduled && date <= today

    toInsert.push({
      orgId: input.orgId,
      accountId: input.accountId,
      categoryId,
      type: tx.type,
      amountCents: tx.amountCents,
      description: tx.description,
      date,
      externalId: tx.externalId,
      importedAt: new Date(),
      isAutoCategorized: categoryId !== null,
      isIgnored: isScheduled,
      balanceApplied: applied,
      categoryRef: tx.categoryRef,
      payeeMcc: tx.payeeMcc,
      billPostDate: tx.billPostDate ? new Date(`${tx.billPostDate}T12:00:00Z`) : null,
      billForecastMonth: tx.billForecastMonth,
      installmentNumber: tx.installmentNumber,
      installmentTotal: tx.installmentTotal,
    })
  }

  if (toInsert.length === 0) return { imported: 0, updated }

  const imported = await db.transaction(async (dbTx) => {
    // O índice único (external_id, account_id) é a rede: se dois syncs
    // correrem juntos, o segundo não duplica.
    const inserted = await dbTx
      .insert(transactions)
      .values(toInsert)
      .onConflictDoNothing()
      .returning({ id: transactions.id, amountCents: transactions.amountCents, applied: transactions.balanceApplied })

    // Só o que entrou de fato move o saldo — o que colidiu já estava contado.
    const realDelta = inserted
      .filter((row) => row.applied)
      .reduce((sum, row) => sum + row.amountCents, 0)

    if (realDelta !== 0) {
      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${realDelta}` })
        .where(eq(accounts.id, input.accountId))
    }

    return inserted.length
  })

  // `imported` conta o que entrou de fato: `onConflictDoNothing` descarta em
  // silencio o que outro sync ja tinha gravado.
  return { imported, updated }
}
