import { and, eq, sql } from 'drizzle-orm'
import { openfinanceResources, transactions } from '@floow/db'
import {
  normalizeAccountTransaction,
  normalizeCardTransaction,
  type NormalizedPolpTransaction,
  type PolpAccountTransaction,
  type PolpCardTransaction,
  type PolpClient,
} from '@floow/core-finance'
import { normalizeBatch } from './normalize-batch'
import type { Db } from './persist-page'
import { carregarDiaDeVencimento, dataFinalDaParcela, hojeEmSaoPaulo, parcelaSemDataDaFatura } from './parcelas-previstas'
import { corrigirDataDaParcelaAplicada } from './parcela-aplicada'
import { completarMesDaFatura } from './faturas-do-banco'
import { ocuparReemitidos, type Lancamento } from './reemitidos'
import { registrarSaldoDeAbertura } from './saldo-de-abertura'

/**
 * Releitura do histórico quando o sync passa a gravar um campo novo.
 *
 * O sync incremental pede só o que mudou desde a última passada
 * (`fromUpdatedAt`). Campo que o código novo passa a gravar nunca chega às
 * linhas que a Polp não altera mais: o `bill_id` (00075) ficou faltando em
 * agosto e setembro do Master Black, que a Polp atualizou em 04/10 e o sync
 * leu com o código antigo, e a fatura de setembro somou R$ 11.642,54 contra
 * os R$ 11.685,40 pagos.
 *
 * Cada recurso guarda a versão do sync que o leu. Abaixo da atual, a próxima
 * passada relê o histórico inteiro uma vez e atualiza só o enriquecimento das
 * linhas que já existem: não insere (não ressuscita o que o usuário apagou)
 * nem mexe em valor. A data só muda na parcela, pelo mesmo caminho do sync
 * normal, que acerta o saldo junto (`corrigirDataDaParcelaAplicada`).
 *
 * Campo novo no sync: entra em `camposDeEnriquecimento` e sobe a versão.
 */
// 1: bill_id. 2: mês da fatura pelo bill_id na parcela que chega sem data.
// 3: lançamento reemitido com outro id ocupa a linha antiga (`reemitidos.ts`).
// 4: saldo da conta antes do primeiro lançamento do extrato (`saldo-de-abertura.ts`).
// 5: instante da transação, para conferir com o saldo do banco (`ocorrido_em`).
export const VERSAO_DO_SYNC = 5

type Enriquecivel = Pick<
  NormalizedPolpTransaction,
  | 'description'
  | 'categoryRef'
  | 'polpType'
  | 'payeeMcc'
  | 'cardLastDigits'
  | 'billPostDate'
  | 'billForecastMonth'
  | 'billId'
  | 'installmentNumber'
  | 'installmentTotal'
  | 'purchaseDate'
  | 'ocorridoEm'
>

/** O que a Polp acrescenta à linha sem mudar valor, data nem saldo. */
export function camposDeEnriquecimento(tx: Enriquecivel) {
  return {
    description: tx.description,
    categoryRef: tx.categoryRef,
    polpType: tx.polpType,
    payeeMcc: tx.payeeMcc,
    cardLastDigits: tx.cardLastDigits,
    billPostDate: tx.billPostDate ? new Date(`${tx.billPostDate}T12:00:00Z`) : null,
    billForecastMonth: tx.billForecastMonth,
    billId: tx.billId,
    installmentNumber: tx.installmentNumber,
    installmentTotal: tx.installmentTotal,
    purchaseDate: tx.purchaseDate ? new Date(`${tx.purchaseDate}T12:00:00Z`) : null,
    ocorridoEm: tx.ocorridoEm ? new Date(tx.ocorridoEm) : null,
  }
}

interface RecursoLido {
  id: string
  polpResourceId: string
  resourceType: string
  syncFromDate: string | null
  lastSyncedAt: Date | null
  syncVersion: number
}

/** Recurso nunca sincronizado não relê: a primeira passada já puxa tudo. */
export function precisaReler(r: Pick<RecursoLido, 'lastSyncedAt' | 'syncVersion'>): boolean {
  return r.lastSyncedAt != null && r.syncVersion < VERSAO_DO_SYNC
}

/**
 * Relê o recurso inteiro e atualiza o enriquecimento das linhas existentes.
 * Item que não normaliza fica de fora: o sync normal já o registra como
 * rejeitado. Devolve quantas linhas foram atualizadas.
 */
export async function relerHistorico(
  db: Db,
  client: PolpClient,
  orgId: string,
  accountId: string,
  recurso: RecursoLido,
  mesesDasFaturas: ReadonlyMap<string, string> = new Map(),
): Promise<number> {
  const isCard = recurso.resourceType === 'CREDIT_CARD_ACCOUNT'
  // Mesmo corte da primeira sincronização: antes dele a conta tem outra origem.
  const query = recurso.syncFromDate ? { fromDate: `${recurso.syncFromDate}T00:00:00Z` } : {}
  const pages = isCard
    ? client.streamCardTransactions(recurso.polpResourceId, query)
    : client.streamAccountTransactions(recurso.polpResourceId, query)

  const hoje = hojeEmSaoPaulo()
  const diaDeVencimento = isCard ? await carregarDiaDeVencimento(db, orgId, accountId) : null
  let atualizadas = 0
  const idsDaPolp = new Set<string>()
  const semLinha: Lancamento[] = []
  let primeira: string | null = null
  // Conta corrente: o extrato inteiro, por dia, para o saldo de abertura.
  const somaPorDia = new Map<string, number>()
  let rejeitados = 0
  for await (const page of pages as AsyncGenerator<unknown[]>) {
    const { ok, rejected } = normalizeBatch(page, (tx) =>
      isCard
        ? normalizeCardTransaction(tx as PolpCardTransaction)
        : normalizeAccountTransaction(tx as PolpAccountTransaction),
    )
    rejeitados += rejected.length
    for (const recebida of ok) {
      if (!isCard) somaPorDia.set(recebida.date, (somaPorDia.get(recebida.date) ?? 0) + recebida.amountCents)
      const tx = completarMesDaFatura(recebida, mesesDasFaturas)
      // Só parcela com data da fatura muda de data; sem ela, a gravada fica.
      const ehParcela = tx.purchaseDate != null && !parcelaSemDataDaFatura(tx)
      const dataFinal = dataFinalDaParcela(tx, diaDeVencimento)
      const linhas = await db
        .update(transactions)
        .set({
          ...camposDeEnriquecimento(tx),
          // Parcela fora do saldo vai direto para a data certa; a aplicada,
          // logo abaixo, com o saldo junto.
          ...(ehParcela ? { date: sql`CASE WHEN ${transactions.balanceApplied} THEN ${transactions.date} ELSE ${dataFinal}::date END` } : {}),
        })
        .where(and(
          eq(transactions.orgId, orgId),
          eq(transactions.accountId, accountId),
          eq(transactions.externalId, tx.externalId),
        ))
        .returning({ id: transactions.id })
      atualizadas += linhas.length
      idsDaPolp.add(tx.externalId)
      if (!primeira || tx.date < primeira) primeira = tx.date
      if (linhas.length === 0) semLinha.push({ id: tx.externalId, amountCents: tx.amountCents, date: tx.date })
      if (ehParcela && linhas[0]) {
        await corrigirDataDaParcelaAplicada(db, { orgId, accountId, transactionId: linhas[0].id, dataFinal, hoje })
      }
    }
  }

  // Antes do sync normal: o reemitido que ocupou a linha antiga chega a ele
  // como linha conhecida, e não entra de novo.
  if (primeira) atualizadas += await ocuparReemitidos(db, orgId, accountId, semLinha, idsDaPolp, primeira)

  if (!isCard && primeira) {
    const primeiroDia = primeira
    await registrarSaldoDeAbertura(db, client, {
      orgId,
      accountId,
      polpResourceId: recurso.polpResourceId,
      extrato: {
        primeiroDia,
        incompleto: rejeitados > 0,
        somaAte: (dia) => [...somaPorDia].reduce((soma, [d, v]) => (d <= dia ? soma + v : soma), 0),
      },
    }).catch((error) => console.error('[sync] falha ao registrar o saldo de abertura:', error))
  }

  await db
    .update(openfinanceResources)
    .set({ syncVersion: VERSAO_DO_SYNC, updatedAt: new Date() })
    .where(eq(openfinanceResources.id, recurso.id))
  return atualizadas
}
