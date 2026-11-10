import { and, eq, inArray, isNotNull, max, sql } from 'drizzle-orm'
import {
  getServiceDb,
  assets,
  indicadoresDiarios,
  cotacoesB3,
  cotasFundos,
  fundosCvm,
  tesouroPrecos,
  execucoesMercado,
} from '@floow/db'
import type { CotaFundo, FundoCvm, Indicador, PrecoTesouro } from '@floow/core-finance'
import type { Fechamento } from './brapi'

export type Job = 'bcb' | 'cvm_cotas' | 'cvm_extrato' | 'tesouro' | 'b3'

export type Execucao = { job: Job; inicio: Date; fim: Date; ok: boolean; linhas: number; erro: string | null }

/** O que os jobs precisam do banco. Os testes usam uma versão em memória. */
export interface RepoMercado {
  gravarIndicadores(l: Indicador[]): Promise<number>
  gravarCotas(l: CotaFundo[]): Promise<number>
  gravarFundos(l: (FundoCvm & { cnpjClasse?: string | null })[]): Promise<number>
  gravarTesouro(l: PrecoTesouro[]): Promise<number>
  gravarFechamentos(l: Fechamento[]): Promise<number>
  ultimaDataTesouro(): Promise<string | null>
  tickersPorFechamentoMaisAntigo(tickers: string[]): Promise<string[]>
  /** CNPJ de classe (do informe) → CNPJ como está em assets. */
  mapaClasseParaCnpj(): Promise<Map<string, string>>
  registrarExecucao(e: Execucao): Promise<void>
  ultimoOkPorJob(): Promise<Partial<Record<Job, Date>>>
}

type Db = ReturnType<typeof getServiceDb>

const LOTE = 1000

async function emLotes<T>(linhas: T[], gravar: (lote: T[]) => Promise<unknown>): Promise<number> {
  for (let i = 0; i < linhas.length; i += LOTE) await gravar(linhas.slice(i, i + LOTE))
  return linhas.length
}

const excluido = (coluna: string) => sql.raw(`excluded.${coluna}`)

export function repoDrizzle(db: Db = getServiceDb()): RepoMercado {
  return {
    gravarIndicadores: (l) =>
      emLotes(l, (lote) =>
        db.insert(indicadoresDiarios).values(lote).onConflictDoUpdate({
          target: [indicadoresDiarios.serie, indicadoresDiarios.data],
          set: { valor: excluido('valor') },
        }),
      ),
    gravarCotas: (l) =>
      emLotes(l, (lote) =>
        db.insert(cotasFundos).values(lote).onConflictDoUpdate({
          target: [cotasFundos.cnpj, cotasFundos.data],
          set: { cota: excluido('cota'), patrimonio: excluido('patrimonio') },
        }),
      ),
    gravarFundos: (l) =>
      emLotes(l, (lote) =>
        db
          .insert(fundosCvm)
          .values(lote.map((f) => ({ ...f, atualizadoEm: new Date() })))
          .onConflictDoUpdate({
            target: fundosCvm.cnpj,
            set: {
              // Sem de-para novo, mantém o CNPJ de classe que já estava gravado.
              cnpjClasse: sql`coalesce(excluded.cnpj_classe, ${fundosCvm.cnpjClasse})`,
              nome: excluido('nome'),
              classeAnbima: excluido('classe_anbima'),
              taxaAdm: excluido('taxa_adm'),
              taxaPerformance: excluido('taxa_performance'),
              diasConversaoResgate: excluido('dias_conversao_resgate'),
              diasPagamentoResgate: excluido('dias_pagamento_resgate'),
              dataReferencia: excluido('data_referencia'),
              atualizadoEm: excluido('atualizado_em'),
            },
          }),
      ),
    gravarTesouro: (l) =>
      emLotes(l, (lote) =>
        db.insert(tesouroPrecos).values(lote).onConflictDoUpdate({
          target: [tesouroPrecos.tipo, tesouroPrecos.vencimento, tesouroPrecos.data],
          set: {
            taxaCompra: excluido('taxa_compra'),
            taxaVenda: excluido('taxa_venda'),
            puCompra: excluido('pu_compra'),
            puVenda: excluido('pu_venda'),
          },
        }),
      ),
    gravarFechamentos: (l) =>
      emLotes(l, (lote) =>
        db.insert(cotacoesB3).values(lote).onConflictDoUpdate({
          target: [cotacoesB3.ticker, cotacoesB3.data],
          set: { fechamento: excluido('fechamento') },
        }),
      ),
    async ultimaDataTesouro() {
      const [r] = await db.select({ data: max(tesouroPrecos.data) }).from(tesouroPrecos)
      return r?.data ?? null
    },
    async tickersPorFechamentoMaisAntigo(tickers) {
      if (!tickers.length) return []
      const rows = await db
        .select({ ticker: cotacoesB3.ticker, ultima: max(cotacoesB3.data) })
        .from(cotacoesB3)
        .where(inArray(cotacoesB3.ticker, tickers))
        .groupBy(cotacoesB3.ticker)
      const ultima = new Map(rows.map((r) => [r.ticker, r.ultima ?? '']))
      // Ticker que nunca teve fechamento vai primeiro.
      return [...tickers].sort((a, b) => (ultima.get(a) ?? '').localeCompare(ultima.get(b) ?? ''))
    },
    async mapaClasseParaCnpj() {
      const rows = await db
        .select({ cnpj: fundosCvm.cnpj, classe: fundosCvm.cnpjClasse })
        .from(fundosCvm)
        .where(isNotNull(fundosCvm.cnpjClasse))
      return new Map(rows.map((r) => [r.classe!, r.cnpj]))
    },
    async registrarExecucao(e) {
      await db.insert(execucoesMercado).values(e)
    },
    async ultimoOkPorJob() {
      const rows = await db
        .select({ job: execucoesMercado.job, fim: max(execucoesMercado.fim) })
        .from(execucoesMercado)
        .where(eq(execucoesMercado.ok, true))
        .groupBy(execucoesMercado.job)
      return Object.fromEntries(rows.filter((r) => r.fim).map((r) => [r.job, r.fim])) as Partial<Record<Job, Date>>
    },
  }
}

/**
 * Fundos e tickers de todas as carteiras. Cruza orgs de propósito, então só
 * roda no servidor e só devolve identificador público, nada que aponte a org.
 */
export async function universoDeMercado(db: Db = getServiceDb()): Promise<{ cnpjs: Set<string>; tickers: string[] }> {
  const fundos = await db
    .selectDistinct({ cnpj: assets.cnpj })
    .from(assets)
    .where(and(eq(assets.assetClass, 'fund'), isNotNull(assets.cnpj)))
  const papeis = await db
    .selectDistinct({ ticker: assets.ticker })
    .from(assets)
    .where(and(inArray(assets.assetClass, ['br_equity', 'fii', 'etf']), isNotNull(assets.ticker)))
  const cnpjs = new Set(fundos.map((f) => f.cnpj!.replace(/\D/g, '')).filter((c) => c.length === 14))
  const tickers = new Set(papeis.map((p) => p.ticker!.trim().toUpperCase().replace(/\.SA$/, '')).filter(Boolean))
  tickers.add('^BVSP')
  tickers.add('IFIX')
  return { cnpjs, tickers: [...tickers] }
}
