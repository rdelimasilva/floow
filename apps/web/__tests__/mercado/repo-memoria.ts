import type { RepoMercado, Job, Execucao } from '@/lib/mercado/repo'

/** Repositório em memória com a mesma semântica de upsert pela PK do banco. */
export function repoMemoria() {
  const tabelas = {
    indicadores: new Map<string, unknown>(),
    cotas: new Map<string, unknown>(),
    fundos: new Map<string, { cnpj: string; cnpjClasse?: string | null }>(),
    tesouro: new Map<string, { data: string }>(),
    fechamentos: new Map<string, { ticker: string; data: string }>(),
  }
  const execucoes: Execucao[] = []
  const upsert =
    <T>(m: Map<string, unknown>, chave: (l: T) => string) =>
    async (ls: T[]) => {
      // Como o Postgres: ON CONFLICT não aceita a mesma chave duas vezes no mesmo INSERT.
      const chaves = ls.map(chave)
      if (new Set(chaves).size !== chaves.length) throw new Error('ON CONFLICT DO UPDATE command cannot affect row a second time')
      for (const l of ls) m.set(chave(l), l)
      return ls.length
    }
  const repo: RepoMercado = {
    gravarIndicadores: upsert(tabelas.indicadores, (l) => `${l.serie}|${l.data}`),
    gravarCotas: upsert(tabelas.cotas, (l) => `${l.cnpj}|${l.data}`),
    gravarFundos: upsert(tabelas.fundos as Map<string, unknown>, (l) => l.cnpj),
    gravarTesouro: upsert(tabelas.tesouro as Map<string, unknown>, (l) => `${l.tipo}|${l.vencimento}|${l.data}`),
    gravarFechamentos: upsert(tabelas.fechamentos as Map<string, unknown>, (l) => `${l.ticker}|${l.data}`),
    async ultimaDataTesouro() {
      return [...tabelas.tesouro.values()].map((l) => l.data).sort().at(-1) ?? null
    },
    async tickersPorFechamentoMaisAntigo(tickers) {
      const ultima = (t: string) =>
        [...tabelas.fechamentos.values()].filter((f) => f.ticker === t).map((f) => f.data).sort().at(-1) ?? ''
      return [...tickers].sort((a, b) => ultima(a).localeCompare(ultima(b)))
    },
    async mapaClasseParaCnpj() {
      const m = new Map<string, string>()
      for (const f of tabelas.fundos.values()) if (f.cnpjClasse) m.set(f.cnpjClasse, f.cnpj)
      return m
    },
    async registrarExecucao(e) {
      execucoes.push(e)
    },
    async ultimoOkPorJob() {
      const r: Partial<Record<Job, Date>> = {}
      for (const e of execucoes) if (e.ok && (!r[e.job] || r[e.job]! < e.fim)) r[e.job] = e.fim
      return r
    },
  }
  return { repo, tabelas, execucoes }
}
