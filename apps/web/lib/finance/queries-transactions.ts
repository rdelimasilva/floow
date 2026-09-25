import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, accounts, transactions, categories, fixedAssets, forecastMatchProposals } from '@floow/db'
import { eq, and, desc, asc, count, gte, ilike, lte, inArray, sql } from 'drizzle-orm'
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { sqlPrevisaoAindaPorVencer, sqlValorNoSaldo } from './balance-sql'
import { futureTransactionsTag, recentTransactionsTag } from '@/lib/cache-tags'

/** Filter options shared between getTransactions queries. */
export interface TransactionFilterOpts {
  /**
   * Uma conta, ou várias separadas por vírgula (`conta-1,conta-2`).
   *
   * O nome ficou no singular porque é o parâmetro de URL de sempre e os links
   * antigos continuam valendo. Quem lê, lê por `contasDoFiltro`.
   */
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
  const contas = contasDoFiltro(opts)
  if (contas.length > 0) conditions.push(condicaoDeConta(tx.accountId, contas))
  return conditions
}

/**
 * As contas marcadas no filtro, em lista.
 *
 * O parâmetro carrega uma ou várias (`conta-1,conta-2`); vazio significa
 * "todas", que é a ausência de condição e não uma lista vazia no SQL.
 */
export function contasDoFiltro(opts?: Pick<TransactionFilterOpts, 'accountId'>): string[] {
  if (!opts?.accountId) return []
  return [...new Set(opts.accountId.split(',').filter(Boolean))]
}

/** Uma conta vira igualdade; várias, um `IN`. */
function condicaoDeConta(coluna: AnyPgColumn, contas: string[]) {
  return contas.length === 1 ? eq(coluna, contas[0]) : inArray(coluna, contas)
}

/** Builds WHERE conditions for transaction queries — single source of truth. */
/** Hoje em Sao Paulo, e nao no fuso do servidor do banco. */
function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function buildTransactionConditions(orgId: string, opts?: TransactionFilterOpts) {
  const conditions = [eq(transactions.orgId, orgId)]

  const contas = contasDoFiltro(opts)
  if (contas.length > 0) conditions.push(condicaoDeConta(transactions.accountId, contas))
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

  // Do mais antigo para o mais novo, como um extrato.
  //
  // O padrão era `desc`, e aí o saldo corrido lido de cima para baixo andava
  // para trás: cada linha mostrava o saldo ANTES da linha acima dela. Em `asc`
  // a coluna acumula na mesma direção em que se lê, e a última linha da última
  // página é o saldo de hoje. Quem abre a lista cai nessa página — ver
  // `paginaQueAbre`.
  const sortFn = opts?.sortDir === 'desc' ? desc : asc

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
 * Quantas linhas o filtro alcança, sem trazer nenhuma.
 *
 * Existe para a listagem saber em que página abrir: em ordem crescente a data
 * mais recente está na ÚLTIMA página, e o número dela depende do total. Só é
 * chamada quando a URL não traz `page` — navegando, o total já vem de graça no
 * `count(*) over ()` da consulta das linhas.
 */
export async function getTransactionCount(orgId: string, opts?: TransactionFilterOpts) {
  const db = getDb()
  const [row] = await db
    .select({ total: count() })
    .from(transactions)
    .where(and(...buildTransactionConditions(orgId, opts)))

  return Number(row?.total ?? 0)
}

/**
 * A consulta das linhas de uma pagina, montada sem executar.
 *
 * Em dois andares. Dentro, a subconsulta `pagina` filtra, ordena, conta e
 * corta — so colunas baratas. Fora, as subconsultas por linha (saldo corrido,
 * bem vinculado, proposta de conciliacao) rodam para as linhas que sobraram.
 *
 * Era um andar so, e o `count(*) over ()` obriga o Postgres a montar o
 * resultado inteiro antes do LIMIT: as subconsultas rodavam para TODOS os
 * lancamentos da org, e o saldo corrido soma todos os anteriores a cada linha
 * — custo quadratico no historico. Em producao: 150–470ms de media, pico de
 * 1,2s, crescendo a cada importacao.
 */
export function consultaDaPagina(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  orgId: string,
  opts?: TransactionQueryOpts
) {
  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0

  const conditions = buildTransactionConditions(orgId, opts)
  const orderBy = buildTransactionOrder(opts)
  const hoje = hojeSP()

  // A ordem pode ser pela categoria, entao a pagina tambem junta categories.
  // Many-to-one: nao duplica linha, entao o `count(*) over ()` continua valido.
  const pagina = db
    .select({
      id: transactions.id,
      totalCount: sql<number>`count(*) over ()`.as('total_count'),
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)
    .as('pagina')

  // Alias proprio: a subquery do saldo le a MESMA tabela da consulta externa,
  // e sem ele o `sum` interno leria as colunas da linha de fora.
  const txSaldo = alias(transactions, 'tx_saldo')
  const contaSaldo = alias(accounts, 'conta_saldo')
  // Extrato de uma conta so: a corretora nao divide a coluna com a corrente,
  // entao o aporte nao se anula e ela precisa do proprio saldo corrido.
  const incluirInvestimento = contasDoFiltro(opts).length === 1

  return db
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
      purchaseDate: transactions.purchaseDate,
      counterpartyId: transactions.counterpartyId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      // O que a categoria diz sobre fluxo de caixa. Vai para a linha porque o
      // botao mostra a resposta que vale, e nao "herda": sem isto a tela sabia
      // que herdava, mas nao o que herdava.
      categoryAffectsCashFlow: categories.affectsCashFlow,
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
      /**
       * Existe proposta de conciliação esperando decisão para esta previsão.
       *
       * Subquery e não join: a proposta é 0-ou-1 por previsão (índice único
       * parcial da 00047), mas um join a mais nesta consulta duplicaria linha
       * se aquela garantia caísse, e linha duplicada corrompe o
       * `count(*) over ()` e o saldo acumulado.
       */
      hasPendingMatchProposal: sql<boolean>`exists (
        select 1 from ${forecastMatchProposals}
         where ${forecastMatchProposals.forecastTransactionId} = ${transactions.id}
           and ${forecastMatchProposals.orgId} = ${orgId}
           and ${forecastMatchProposals.status} = 'pending')`,
      totalCount: pagina.totalCount,
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
       * Correlacionada soma todos os anteriores, entao so pode rodar para as
       * linhas da pagina — ver `consultaDaPagina`.
       */
      balanceAfter: sql<number>`(
        select coalesce(sum(${sqlValorNoSaldo(hoje, { tx: txSaldo, acc: contaSaldo }, { incluirInvestimento })}), 0)
          from ${transactions} ${txSaldo}
          left join ${accounts} ${contaSaldo} on ${contaSaldo.id} = ${txSaldo.accountId}
         where ${and(...buildBalanceScopeConditions(orgId, opts, txSaldo))}
           and (${txSaldo.date}, ${txSaldo.id}) <= (${transactions.date}, ${transactions.id}))`,
    })
    .from(transactions)
    .innerJoin(pagina, eq(pagina.id, transactions.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    // A mesma ordem de dentro: o join nao garante ordem nenhuma.
    .orderBy(...orderBy)
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
  const rows = await consultaDaPagina(getDb(), orgId, opts)

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
/**
 * Returns future transactions (balance_applied = false) for cash flow projection:
 * previsões ainda por vencer, sem vínculo com o realizado — a mesma regra do
 * saldo projetado da listagem.
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
          sqlPrevisaoAindaPorVencer(hojeSP()),
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
