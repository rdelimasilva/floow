import { and, desc, eq, isNull, notExists, or, sql } from 'drizzle-orm'
import {
  categories,
  categoryRules,
  hiddenSystemCategories,
  openfinanceIngestionIssues,
  openfinanceConnections,
  openfinanceResources,
  polpRefRedirects,
} from '@floow/db'
import {
  normalizeAccountTransaction,
  normalizeCardTransaction,
  type CategoryRule,
  type PolpAccountTransaction,
  type PolpCardTransaction,
  type PolpClient,
} from '@floow/core-finance'
import { normalizeBatch, type RejectedItem } from './normalize-batch'
import { loadCounterpartyIndex, resolveCounterparty } from './resolve-counterparty'
import { registrarSaldoDoBanco } from './conferir-saldo'
import { persistPage, type Db } from './persist-page'
import { sugerirCategoriasDaFila } from './sugestao-da-fila'
import { sugestaoDaFilaDeps } from './sugestao-da-fila-deps'
import { completarParcelas } from './completar-parcelas'
import { criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'
import { criarPropostasDeDuplicata } from '@/lib/finance/duplicata-db'
import { aplicarRedirecionamentos } from '@/lib/finance/polp-redirect'

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

export interface SyncSummary {
  imported: number
  updated: number
  /** Recursos sem conta vinculada — o dado existe na Polp e não tem onde entrar. */
  skippedUnlinked: number
  /** Propostas de conciliação previsto×realizado criadas nesta passada. */
  propostasDeConciliacao: number
  /** Propostas de duplicata — mesmo evento reemitido pela fonte com outro id. */
  propostasDeDuplicata: number
  /**
   * Itens que a ingestão não conseguiu ler. Ficam em
   * `openfinance_ingestion_issues` com o payload cru, e o recurso não avança a
   * janela de sincronização — eles voltam sozinhos quando o defeito for
   * corrigido.
   */
  rejected: number
}

/**
 * Investimento também é `openfinance_resources`, mas não tem conta nem
 * lançamento. Sem este filtro ele caía em `skippedUnlinked` e inflava o aviso
 * de "recurso sem conta vinculada".
 */
export function recursosDeConta<T extends { resourceType: string }>(rs: T[]): T[] {
  return rs.filter((r) => r.resourceType === 'ACCOUNT' || r.resourceType === 'CREDIT_CARD_ACCOUNT')
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

  const [categoryByRef, rules, counterpartyIndex] = await Promise.all([
    loadCategoryIndex(db, connection.orgId),
    loadRules(db, connection.orgId),
    loadCounterpartyIndex(db, connection.orgId),
  ])

  const summary: SyncSummary = { imported: 0, updated: 0, skippedUnlinked: 0, rejected: 0, propostasDeConciliacao: 0, propostasDeDuplicata: 0 }

  for (const resource of recursosDeConta(resources)) {
    if (!resource.accountId) {
      summary.skippedUnlinked++
      continue
    }

    const contasComPernaPrevista = new Set<string>()

    // Primeira sincronização puxa tudo; as seguintes pedem só o que mudou
    // desde a última. `fromUpdatedAt` e não `fromDate` de propósito: a
    // counterparty e a categoria chegam depois, na mesma transação, e é a data
    // de atualização que as traz de volta.
    // Primeira sincronização respeita o corte que o usuário escolheu, para não
    // duplicar o que a conta já tem de OFX ou de lançamento manual. As
    // seguintes pedem só o que mudou desde a última.
    const query = resource.lastSyncedAt
      ? { fromUpdatedAt: resource.lastSyncedAt.toISOString() }
      : resource.syncFromDate
        ? { fromDate: `${resource.syncFromDate}T00:00:00Z` }
        : {}

    const startedAt = new Date()
    const isCard = resource.resourceType === 'CREDIT_CARD_ACCOUNT'
    const pages = isCard
      ? client.streamCardTransactions(resource.polpResourceId, query)
      : client.streamAccountTransactions(resource.polpResourceId, query)

    let rejectedHere = 0

    for await (const page of pages as AsyncGenerator<unknown[]>) {
      // Item defeituoso não derruba o lote. Antes, um `page.map()` levava as
      // outras 499 transações junto — e o cliente via só "não foi possível
      // sincronizar", sem nada para investigar.
      const { ok, rejected } = normalizeBatch(page, (tx) =>
        isCard
          ? normalizeCardTransaction(tx as PolpCardTransaction)
          : normalizeAccountTransaction(tx as PolpAccountTransaction),
      )

      if (rejected.length > 0) {
        rejectedHere += rejected.length
        await recordIssues(db, connection.orgId, resource.id, rejected)
      }

      // Nível 2: contraparte resolve o que o Nível 1 (em normalize.ts) não
      // resolveu sozinho. Sequencial, não Promise.all — duas transações
      // novas com a MESMA contraparte na mesma página não podem correr em
      // paralelo, ou as duas tentam criar a linha ao mesmo tempo.
      const resolved = []
      for (const tx of ok) {
        resolved.push(await resolveCounterparty(db, connection.orgId, resource.accountId, tx, counterpartyIndex))
      }

      const result = await persistPage(db, {
        orgId: connection.orgId,
        accountId: resource.accountId,
        normalized: resolved,
        categoryByRef,
        rules,
      })
      summary.imported += result.imported
      summary.updated += result.updated
      for (const conta of result.contasComPernaPrevista) contasComPernaPrevista.add(conta)
    }

    summary.rejected += rejectedHere

    // Previsão das parcelas que a Polp ainda não mandou. Falha aqui não
    // derruba o sync: o dado real já entrou, e a próxima passada completa.
    if (isCard) {
      try {
        await completarParcelas(db, connection.orgId, resource.accountId)
      } catch (error) {
        console.error('[sync] falha ao completar parcelas previstas:', error)
      }
    }

    // Propõe o par previsto x realizado com o que acabou de entrar. Quem
    // efetiva é o usuário, na aprovação — o sync não decide mais.
    // Depois do loop de paginas, não dentro do persistPage: o `returning` do
    // insert de lá traz só id, valor e balanceApplied, sem data nem descrição
    // — e é delas que o casamento depende. Falha aqui não derruba o sync: o
    // dado já entrou, e a proposta é criada de novo na próxima passada.
    try {
      summary.propostasDeConciliacao += await criarPropostasDeConciliacao(db, connection.orgId, resource.accountId)

      // A perna prevista nasceu em OUTRA conta. Se a ponta real de lá já
      // chegou num sync anterior, a proposta tem que nascer agora — o próximo
      // sync daquela conta só olharia o que é novo nela.
      for (const conta of contasComPernaPrevista) {
        summary.propostasDeConciliacao += await criarPropostasDeConciliacao(db, connection.orgId, conta)
      }
    } catch (error) {
      console.error('[sync] falha ao propor conciliacao de previsto com realizado:', error)
    }

    // O dedupe da ingestao e o indice unico `(external_id, account_id)`, que
    // nao protege quando a fonte REEMITE o mesmo evento com outro id. Propor
    // e separado de importar: o par so existe depois das duas linhas dentro.
    // Falha aqui nao derruba o sync — o dado ja entrou, e a proposta volta a
    // ser criada na proxima passada.
    try {
      summary.propostasDeDuplicata += await criarPropostasDeDuplicata(db, connection.orgId, resource.accountId)
    } catch (error) {
      console.error('[sync] falha ao propor duplicata:', error)
    }

    // Contraparte nova chega na fila com a categoria pré-selecionada
    // (histórico ou Claude); quem confirma é o usuário. Falha aqui não
    // derruba o sync — a fila só fica sem sugestão, como antes.
    try {
      await sugerirCategoriasDaFila(connection.orgId, sugestaoDaFilaDeps(db))
    } catch (error) {
      console.error('[sync] falha ao sugerir categorias da fila:', error)
    }

    // O saldo do banco vale como conferencia do que ACABOU de entrar, entao
    // e lido depois da importacao. Nao entra no `try` da conciliacao: sao
    // controles independentes, e um nao deve mascarar a falha do outro.
    await registrarSaldoDoBanco(db, client, resource)

    // A janela só avança quando o recurso veio inteiro. Avançar com rejeição
    // perderia aquelas transações para sempre: a próxima sincronização pediria
    // só o que mudou DEPOIS, e elas nunca voltariam. Assim, corrigir o
    // normalizador basta — a próxima sync as traz de novo, e o índice único por
    // (external_id, account_id) evita duplicar o que já entrou.
    if (rejectedHere === 0) {
      await db
        .update(openfinanceResources)
        .set({ lastSyncedAt: startedAt, updatedAt: new Date() })
        .where(eq(openfinanceResources.id, resource.id))
    }
  }

  await db
    .update(openfinanceConnections)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(openfinanceConnections.id, connection.id))

  return summary
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

  // Código de categoria excluída com reatribuição vai para o destino escolhido.
  const redirecionamentos = await db
    .select({ polpRef: polpRefRedirects.polpRef, categoryId: polpRefRedirects.categoryId })
    .from(polpRefRedirects)
    .where(eq(polpRefRedirects.orgId, orgId))
  return aplicarRedirecionamentos(index, redirecionamentos, new Set(rows.map((r) => r.id)))
}

/**
 * Grava o que não foi possível ler, com o payload cru.
 *
 * Sem isso, "faltou uma transação no meu extrato" é indebugável: não sobra
 * nenhum vestígio do que a instituição mandou de diferente.
 */
async function recordIssues(
  db: Db,
  orgId: string,
  resourceId: string,
  rejected: RejectedItem[],
): Promise<void> {
  await db.insert(openfinanceIngestionIssues).values(
    rejected.map((item) => ({
      orgId,
      resourceId,
      externalId: item.externalId,
      reason: item.reason.slice(0, 500),
      payload: item.raw as Record<string, unknown>,
    })),
  )
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

export { sumAppliedDeltasByAccount } from './persist-page'
