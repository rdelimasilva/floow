import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, accounts, transactions, categories, patrimonySnapshots, categoryRules, recurringTemplates, hiddenSystemCategories, fixedAssets } from '@floow/db'
import { eq, and, desc, asc, isNull, or, gte, count, ilike, lte, inArray, notExists, sql } from 'drizzle-orm'
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { sqlValorNoSaldo } from './balance-sql'
import {
  accountsTag,
  categoriesTag,
  futureTransactionsTag,
  recentTransactionsTag,
  snapshotsTag,
  transactionsTag,
} from '@/lib/cache-tags'

export interface MonthlyCashFlowSummary {
  month: string
  income: number
  expense: number
  net: number
}

async function loadMonthlyCashFlowSummary(
  orgId: string,
  months: number,
  projected: boolean,
): Promise<MonthlyCashFlowSummary[]> {
  const db = getDb()
  const boundaryDate = new Date()

  if (projected) {
    boundaryDate.setMonth(boundaryDate.getMonth() + months)
  } else {
    boundaryDate.setMonth(boundaryDate.getMonth() - months)
  }
  const boundaryDateStr = boundaryDate.toISOString().split('T')[0]

  const rows = await db.execute<{
    month: string
    income: number
    expense: number
  }>(sql`
    select
      to_char(date_trunc('month', ${transactions.date}), 'YYYY-MM') as month,
      coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountCents} else 0 end), 0)::int as income,
      coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountCents} else 0 end), 0)::int as expense
    from ${transactions}
    left join ${categories} on ${categories.id} = ${transactions.categoryId}
    where ${transactions.orgId} = ${orgId}
      and ${transactions.isIgnored} = false
      and ${transactions.reviewState} = 'confirmed'
      and ${transactions.balanceApplied} = ${!projected}
      -- affects_cash_flow efetivo: o do lançamento manda quando preenchido, o
      -- da categoria é o padrão, e o terceiro argumento cobre lançamento sem
      -- categoria — o left join devolve NULL nos dois e o default tem que ser
      -- o comportamento de hoje, contar.
      and coalesce(${transactions.affectsCashFlow}, ${categories.affectsCashFlow}, true)
      and ${projected
        ? sql`${transactions.date} <= ${boundaryDateStr}::date`
        : sql`${transactions.date} >= ${boundaryDateStr}::date`}
    group by 1
    order by 1 desc
  `)

  return rows.map((row) => ({
    month: row.month,
    income: Number(row.income),
    expense: Number(row.expense),
    net: Number(row.income) + Number(row.expense),
  }))
}

/**
 * Org ativa do requisitante.
 *
 * A implementação vive em `@/lib/auth/session`, que deriva a org de um JWT com
 * assinatura verificada. Reexportado aqui porque ~50 arquivos já importam
 * `getOrgId` deste módulo.
 */
export { getOrgId } from '@/lib/auth/session'

/**
 * Returns all active accounts for the given org, ordered by name.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getAccounts = cache(async function getAccounts(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(accounts)
        .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
        .orderBy(accounts.name)
    },
    ['finance-accounts', orgId],
    { tags: [accountsTag(orgId)], revalidate: 300 },
  )()
})

/**
 * Returns a single account by ID, verifying org ownership.
 * Returns null if account not found or doesn't belong to the org.
 */
export const getAccountById = cache(async function getAccountById(orgId: string, accountId: string) {
  const db = getDb()
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
    .limit(1)

  return account ?? null
})

/** Filter options shared between getTransactions queries. */
export interface TransactionFilterOpts {
  accountId?: string; search?: string;
  startDate?: string; endDate?: string;
  types?: string; categoryIds?: string;
  minAmount?: number; maxAmount?: number;
  /**
   * Traz tambem a previsao com data futura. Desligado por padrao: sem isso a
   * lista abre em 2031, por causa dos 60 meses que o template indefinido
   * materializa de uma vez.
   */
  includeFuture?: boolean;
}

interface TransactionQueryOpts extends TransactionFilterOpts {
  limit?: number
  offset?: number
  sortBy?: string
  sortDir?: string
}

/**
 * O escopo do saldo acumulado — de quem e o saldo que a coluna mostra.
 *
 * So organizacao e conta. Periodo, categoria, tipo, busca e valor ficam de
 * fora de proposito: eles escolhem o que APARECE na tela, e filtro nao pode
 * mudar saldo.
 *
 * O defeito que isto corrige: o saldo era uma funcao de janela sobre o
 * conjunto ja filtrado, ou seja "soma das linhas que estou mostrando" em vez
 * de "saldo naquela data". Filtrando "este mes" numa conta, o topo mostrava
 * R$ 323,00 onde o saldo real era R$ 140.801,00. O filtro de conta acertava
 * por acidente, porque somar todos os lancamentos de uma conta da o saldo
 * dela.
 */
export function buildBalanceScopeConditions(
  orgId: string,
  opts?: TransactionFilterOpts,
  tx: { orgId: AnyPgColumn; accountId: AnyPgColumn } = transactions,
) {
  const conditions = [eq(tx.orgId, orgId)]
  if (opts?.accountId) conditions.push(eq(tx.accountId, opts.accountId))
  return conditions
}

/** Builds WHERE conditions for transaction queries — single source of truth. */
/** Hoje em Sao Paulo, e nao no fuso do servidor do banco. */
function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function buildTransactionConditions(orgId: string, opts?: TransactionFilterOpts) {
  const conditions = [eq(transactions.orgId, orgId)]

  if (opts?.accountId) conditions.push(eq(transactions.accountId, opts.accountId))
  if (opts?.search) conditions.push(ilike(transactions.description, `%${opts.search}%`))
  if (opts?.startDate) conditions.push(gte(transactions.date, new Date(opts.startDate)))
  if (opts?.endDate) conditions.push(lte(transactions.date, new Date(opts.endDate)))

  // A lista abre em HOJE, nao em 2031.
  //
  // `generateInstallmentDates` materializa 60 meses de lancamentos de uma vez
  // quando o template e indefinido (recurring-batch.ts:42). Com 5 templates
  // assim, sao 263 linhas de previsao no futuro, ate 15/04/2031 — cinco
  // paginas delas antes do primeiro lancamento real, e a coluna de saldo
  // mostrando no topo a projecao de 2031.
  //
  // Cortado em hoje, o topo vira o saldo de hoje, que bate com a soma dos
  // saldos das contas. O futuro continua a um clique, pelo filtro de periodo
  // ou pelo toggle de previsoes.
  //
  // `endDate` explicito manda: quem pediu 2031 quer ver 2031.
  if (!opts?.includeFuture && !opts?.endDate) {
    conditions.push(lte(transactions.date, sql`${hojeSP()}::date`))
  }

  if (opts?.types) {
    const typeList = opts.types.split(',').filter(Boolean) as ('income' | 'expense' | 'transfer')[]
    if (typeList.length > 0) conditions.push(inArray(transactions.type, typeList))
  }
  if (opts?.categoryIds) {
    const catList = opts.categoryIds.split(',').filter(Boolean)
    if (catList.length > 0) conditions.push(inArray(transactions.categoryId, catList))
  }
  if (opts?.minAmount !== undefined) {
    conditions.push(sql`ABS(${transactions.amountCents}) >= ${opts.minAmount}`)
  }
  if (opts?.maxAmount !== undefined) {
    conditions.push(sql`ABS(${transactions.amountCents}) <= ${opts.maxAmount}`)
  }

  return conditions
}

export function buildTransactionOrder(opts?: Pick<TransactionQueryOpts, 'sortBy' | 'sortDir'>) {
  const sortColumns: Record<string, any> = {
    date: transactions.date,
    description: transactions.description,
    categoryName: categories.name,
    type: transactions.type,
    amountCents: transactions.amountCents,
  }

  const sortCol = sortColumns[opts?.sortBy ?? 'date'] ?? transactions.date
  const sortFn = opts?.sortDir === 'asc' ? asc : desc

  // A listagem é uma linha do tempo. Nada de separar realizado de previsto.
  //
  // Aqui vinha `desc(transactions.balanceApplied)` na frente de tudo (commit
  // d8fcdd5, "sort applied transactions first"), de quando previsão não tinha
  // selo e só se distinguia pela posição. O efeito colateral: com 892 linhas
  // realizadas, as 263 previsões caíam na página 30 — ligar o filtro
  // "previsões" não mudava nada do que se via. Hoje a previsão tem selo
  // próprio e não precisa ser exilada.
  //
  // `id` fecha a ordenação. Nenhuma das colunas ordenáveis é única — um
  // extrato tem dezessete lançamentos no mesmo dia — e sem desempate o
  // Postgres devolve a ordem que quiser: a mesma página trocava de ordem
  // entre dois carregamentos.
  //
  // Ele segue a DIREÇÃO do sort para a ordem exibida bater com a ordem em que
  // o saldo acumula, que é (data, id) crescente. Com `id` sempre crescente
  // numa lista de data decrescente, as linhas do mesmo dia correriam ao
  // contrário do resto: o saldo de cada uma seria o da linha ABAIXO mais o
  // valor dela, em vez de menos, e a coluna pareceria saltar a cada virada de
  // dia. (Saldo corrido sobe e desce conforme o sinal de cada lançamento —
  // isso é normal; o que não pode é a sequência exibida discordar da sequência
  // acumulada.)
  return [sortFn(sortCol), sortFn(transactions.id)] as const
}

/**
 * Returns transactions + total count in a SINGLE query using COUNT(*) OVER().
 * Eliminates the extra round-trip that getTransactionCount required.
 * Joined with category data (name, color, icon).
 */
export async function getTransactionsWithCount(
  orgId: string,
  opts?: TransactionQueryOpts
) {
  const db = getDb()
  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0
  const sortDir = opts?.sortDir ?? 'desc'

  const conditions = buildTransactionConditions(orgId, opts)
  const orderBy = buildTransactionOrder(opts)
  const hoje = hojeSP()
  // Alias proprio: a subquery do saldo le a MESMA tabela da consulta externa,
  // e sem ele o `sum` interno leria as colunas da linha de fora.
  const txSaldo = alias(transactions, 'tx_saldo')
  const contaSaldo = alias(accounts, 'conta_saldo')

  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      type: transactions.type,
      amountCents: transactions.amountCents,
      description: transactions.description,
      date: transactions.date,
      transferGroupId: transactions.transferGroupId,
      externalId: transactions.externalId,
      isAutoCategorized: transactions.isAutoCategorized,
      isIgnored: transactions.isIgnored,
      recurringTemplateId: transactions.recurringTemplateId,
      balanceApplied: transactions.balanceApplied,
      affectsCashFlow: transactions.affectsCashFlow,
      matchedTransactionId: transactions.matchedTransactionId,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      // O tipo da conta viaja na linha porque a coluna de saldo decide por
      // linha no cliente (`contaNoSaldoProjetado`) e precisa saber se aquele
      // lancamento e de conta de investimento.
      accountType: accounts.type,
      // Subquery e nao join: dois bens podem apontar o mesmo lancamento, e a
      // linha duplicada corromperia o `count(*) over ()` logo abaixo e a soma
      // acumulada. O filtro por org fecha o caminho de um vinculo antigo
      // apontar para fora da org. Indice em (acquisition_transaction_id).
      acquiredAssetId: sql<string | null>`(
        select ${fixedAssets.id} from ${fixedAssets}
         where ${fixedAssets.acquisitionTransactionId} = ${transactions.id}
           and ${fixedAssets.orgId} = ${orgId}
         limit 1)`,
      acquiredAssetName: sql<string | null>`(
        select ${fixedAssets.name} from ${fixedAssets}
         where ${fixedAssets.acquisitionTransactionId} = ${transactions.id}
           and ${fixedAssets.orgId} = ${orgId}
         limit 1)`,
      totalCount: sql<number>`count(*) over ()`,
      /**
       * O saldo APOS esta linha, em ordem cronologica.
       *
       * Calculado sobre o escopo da conta (`buildBalanceScopeConditions`) e
       * nao sobre o conjunto filtrado. Era esse o defeito: as somas de janela
       * viam so as linhas exibidas, entao "este mes" numa conta mostrava
       * R$ 323,00 onde o saldo era R$ 140.801,00. Filtro escolhe o que
       * aparece; nao muda saldo.
       *
       * Subquery correlacionada e nao janela porque a janela so enxerga o
       * resultado da propria consulta — e e justamente o que nao serve aqui.
       * O desempate por `id` da uma ordem total no tempo: sem ele, linhas do
       * mesmo dia receberiam todas o acumulado do dia inteiro.
       *
       * Medido contra a consulta anterior: 129ms de trabalho contra 127ms, a
       * mesma coisa depois de descontar a latencia.
       */
      balanceAfter: sql<number>`(
        select coalesce(sum(${sqlValorNoSaldo(hoje, { tx: txSaldo, acc: contaSaldo })}), 0)
          from ${transactions} ${txSaldo}
          left join ${accounts} ${contaSaldo} on ${contaSaldo.id} = ${txSaldo.accountId}
         where ${and(...buildBalanceScopeConditions(orgId, opts, txSaldo))}
           and (${txSaldo.date}, ${txSaldo.id}) <= (${transactions.date}, ${transactions.id}))`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    // Many-to-one: nao duplica linha, entao o `count(*) over ()` e as somas
    // de janela continuam validos.
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)

  const totalCount = rows[0]?.totalCount ?? 0

  // Sem `startingBalance`: cada linha ja vem com o seu saldo, e o cliente nao
  // acumula mais nada. O acumulo no cliente so funcionava enquanto a pagina
  // continha TODAS as linhas relevantes — com qualquer filtro ativo ele somava
  // por cima de uma base que nao correspondia a nenhum saldo real.
  return {
    transactions: rows.map(({ totalCount: _totalCount, balanceAfter, ...row }) => ({
      ...row,
      runningBalance: Number(balanceAfter),
    })),
    totalCount,
  }
}

/**
 * Returns the starting balance for running-balance display on the current page.
 * For DESC sort: totalSum - sum of transactions on earlier pages (newer txns).
 * For ASC sort: sum of transactions on earlier pages (older txns).
 */
/**
 * Returns category IDs ordered by usage frequency (most used first).
 * Used to sort category dropdowns with most-used at top.
 */
export async function getCategoryUsageOrder(orgId: string): Promise<string[]> {
  return unstable_cache(
    async () => {
      const db = getDb()
      const rows = await db
        .select({
          categoryId: transactions.categoryId,
          cnt: count(),
        })
        .from(transactions)
        .where(and(eq(transactions.orgId, orgId), sql`${transactions.categoryId} IS NOT NULL`))
        .groupBy(transactions.categoryId)
        .orderBy(desc(count()))
        .limit(50)

      return rows.map((r) => r.categoryId!)
    },
    ['finance-category-usage-order', orgId],
    { tags: [transactionsTag(orgId)], revalidate: 300 },
  )()
}

/**
 * Returns categories for the given org plus system-wide categories (orgId IS NULL).
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getCategories = cache(async function getCategories(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      // Categoria de sistema que ESTA org escondeu sai da lista. A linha
      // continua existindo para as outras orgs — ver 00029 e category-actions.
      return db
        .select()
        .from(categories)
        .where(
          and(
            or(eq(categories.orgId, orgId), isNull(categories.orgId)),
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
        .orderBy(categories.type, categories.name)
    },
    ['finance-categories', orgId],
    { tags: [categoriesTag(orgId)], revalidate: 60 },
  )()
})

/**
 * Returns the most recent patrimony snapshot for the given org, or null if none exists.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getLatestSnapshot = cache(async function getLatestSnapshot(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const results = await db
        .select()
        .from(patrimonySnapshots)
        .where(eq(patrimonySnapshots.orgId, orgId))
        .orderBy(desc(patrimonySnapshots.snapshotDate))
        .limit(1)

      return results[0] ?? null
    },
    ['finance-latest-snapshot', orgId],
    { tags: [snapshotsTag(orgId)], revalidate: 300 },
  )()
})

/**
 * Returns all categorization rules for the given org, ordered by priority DESC.
 * Pre-sorted so callers can pass the result directly to matchCategory() without re-sorting.
 * Does NOT filter by isEnabled — callers must filter enabled rules before calling matchCategory().
 */
export async function getCategoryRules(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(categoryRules)
    .where(eq(categoryRules.orgId, orgId))
    .orderBy(desc(categoryRules.priority))
}

/**
 * Returns transactions from the last N months for cash flow chart aggregation.
 * Defaults to 6 months. Ordered by date descending.
 * Wrapped in React cache() to deduplicate within a single request (e.g., dashboard
 * calls this twice from StatsSection and ChartSection — cache prevents double DB round-trip).
 */
export const getRecentTransactions = cache(async function getRecentTransactions(orgId: string, months: number = 6) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - months)

      return db
        .select({
          id: transactions.id,
          orgId: transactions.orgId,
          accountId: transactions.accountId,
          type: transactions.type,
          amountCents: transactions.amountCents,
          date: transactions.date,
        })
        .from(transactions)
        .where(and(eq(transactions.orgId, orgId), gte(transactions.date, cutoff), eq(transactions.isIgnored, false), eq(transactions.balanceApplied, true)))
        .orderBy(desc(transactions.date))
    },
    ['finance-recent-transactions', orgId, String(months)],
    { tags: [recentTransactionsTag(orgId, months)], revalidate: 180 },
  )().then((rows) =>
    rows.map((row) => ({
      ...row,
      date: row.date instanceof Date ? row.date : new Date(row.date as unknown as string),
    }))
  )
})

export const getMonthlyCashFlowSummary = cache(async function getMonthlyCashFlowSummary(
  orgId: string,
  months: number = 6,
): Promise<MonthlyCashFlowSummary[]> {
  return unstable_cache(
    async () => loadMonthlyCashFlowSummary(orgId, months, false),
    ['finance-monthly-cash-flow-summary', orgId, String(months)],
    { tags: [recentTransactionsTag(orgId, months)], revalidate: 180 },
  )()
})

export const getFutureMonthlyCashFlowSummary = cache(async function getFutureMonthlyCashFlowSummary(
  orgId: string,
  months: number = 24,
): Promise<MonthlyCashFlowSummary[]> {
  return unstable_cache(
    async () => loadMonthlyCashFlowSummary(orgId, months, true),
    ['finance-future-monthly-cash-flow-summary', orgId, String(months)],
    { tags: [futureTransactionsTag(orgId, months)], revalidate: 180 },
  )()
})

/**
 * Returns all recurring templates for an org, ordered by nextDueDate ASC.
 */
export async function getRecurringTemplates(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(recurringTemplates)
    .where(eq(recurringTemplates.orgId, orgId))
    .orderBy(asc(recurringTemplates.nextDueDate))
}

/**
 * Returns active templates due within the next 30 days, ordered by nextDueDate ASC.
 * Used for the "upcoming due" section on /transactions/recurring.
 */
export async function getUpcomingRecurring(orgId: string) {
  const db = getDb()
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000)

  return db
    .select()
    .from(recurringTemplates)
    .where(
      and(
        eq(recurringTemplates.orgId, orgId),
        eq(recurringTemplates.isActive, true),
        lte(recurringTemplates.nextDueDate, thirtyDaysFromNow),
      )
    )
    .orderBy(asc(recurringTemplates.nextDueDate))
}

/**
 * Returns future transactions (balance_applied = false) for cash flow projection.
 * These are recurring installments with date > today that haven't impacted the balance yet.
 */
export async function getFutureTransactions(orgId: string, months: number = 24) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + months)

      return db
        .select({
          id: transactions.id,
          orgId: transactions.orgId,
          accountId: transactions.accountId,
          type: transactions.type,
          amountCents: transactions.amountCents,
          date: transactions.date,
        })
        .from(transactions)
        .where(and(
          eq(transactions.orgId, orgId),
          eq(transactions.balanceApplied, false),
          eq(transactions.isIgnored, false),
          lte(transactions.date, endDate),
        ))
        .orderBy(asc(transactions.date))
    },
    ['finance-future-transactions', orgId, String(months)],
    { tags: [futureTransactionsTag(orgId, months)], revalidate: 180 },
  )().then((rows) =>
    rows.map((row) => ({
      ...row,
      date: row.date instanceof Date ? row.date : new Date(row.date as unknown as string),
    }))
  )
}
