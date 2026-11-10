import { and, asc, eq, gt, lte } from 'drizzle-orm'
import { acumular, type FundoCvm } from '@floow/core-finance'
import { cotacoesB3, cotasFundos, fundosCvm, indicadoresDiarios, type getServiceDb } from '@floow/db'
import type { Job, RepoMercado } from './repo'

/**
 * Leitura dos dados de mercado para as regras do agente. Datas em aaaa-MM-dd.
 * Dado que falta volta null, nunca zero: zero seria um retorno inventado.
 * Recebe o db de quem chama (withRls na tela, conexão de serviço no cron).
 */

type Db = ReturnType<typeof getServiceDb>

const DIA_MS = 86_400_000
const diasEntre = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DIA_MS

/** Taxas por período (CDI ao dia, IPCA ao mês) compostas no intervalo (de, ate]. */
export function acumuladoNoPeriodo(linhas: { data: string; valor: number }[], de: string, ate: string, folgaDias: number): number | null {
  const noPeriodo = linhas.filter((l) => l.data > de && l.data <= ate).sort((a, b) => a.data.localeCompare(b.data))
  if (!noPeriodo.length) return null
  if (diasEntre(de, noPeriodo[0].data) > folgaDias) return null
  if (diasEntre(noPeriodo.at(-1)!.data, ate) > folgaDias) return null
  return acumular(noPeriodo.map((l) => l.valor))
}

/** Variação entre o último preço até `de` e o último até `ate`. Preço mais velho que a folga não vale. */
export function retornoPorPreco(linhas: { data: string; preco: number }[], de: string, ate: string, folgaDias = 7): number | null {
  const ultimoAte = (limite: string) =>
    linhas.filter((l) => l.data <= limite).sort((a, b) => a.data.localeCompare(b.data)).at(-1)
  const inicio = ultimoAte(de)
  const fim = ultimoAte(ate)
  if (!inicio || !fim || inicio.preco <= 0) return null
  if (diasEntre(inicio.data, de) > folgaDias || diasEntre(fim.data, ate) > folgaDias) return null
  return fim.preco / inicio.preco - 1
}

/** Só as cotas da subclasse da cota mais recente: comparar cotas de subclasses diferentes inventa retorno. */
export function daMesmaSubclasse<T extends { data: string; subclasse: string }>(linhas: T[]): T[] {
  const ultima = [...linhas].sort((a, b) => a.data.localeCompare(b.data)).at(-1)
  return ultima ? linhas.filter((l) => l.subclasse === ultima.subclasse) : []
}

async function serie(db: Db, nome: 'cdi' | 'ipca', de: string, ate: string) {
  return db
    .select({ data: indicadoresDiarios.data, valor: indicadoresDiarios.valor })
    .from(indicadoresDiarios)
    .where(and(eq(indicadoresDiarios.serie, nome), gt(indicadoresDiarios.data, de), lte(indicadoresDiarios.data, ate)))
}

export async function cdiAcumulado(db: Db, de: string, ate: string): Promise<number | null> {
  return acumuladoNoPeriodo(await serie(db, 'cdi', de, ate), de, ate, 5)
}

/** O IPCA sai uma vez por mês com mais de 30 dias de atraso, daí a folga maior. */
export async function ipcaAcumulado(db: Db, de: string, ate: string): Promise<number | null> {
  return acumuladoNoPeriodo(await serie(db, 'ipca', de, ate), de, ate, 45)
}

export async function retornoDoFundo(db: Db, cnpj: string, de: string, ate: string): Promise<number | null> {
  const linhas = await db
    .select({ data: cotasFundos.data, preco: cotasFundos.cota, subclasse: cotasFundos.subclasse })
    .from(cotasFundos)
    .where(and(eq(cotasFundos.cnpj, cnpj), lte(cotasFundos.data, ate)))
    .orderBy(asc(cotasFundos.data))
  return retornoPorPreco(daMesmaSubclasse(linhas), de, ate)
}

export async function retornoDoTicker(db: Db, ticker: string, de: string, ate: string): Promise<number | null> {
  const linhas = await db
    .select({ data: cotacoesB3.data, preco: cotacoesB3.fechamento })
    .from(cotacoesB3)
    .where(and(eq(cotacoesB3.ticker, ticker), lte(cotacoesB3.data, ate)))
    .orderBy(asc(cotacoesB3.data))
  return retornoPorPreco(linhas, de, ate)
}

export async function dadosDoFundo(db: Db, cnpj: string): Promise<FundoCvm | null> {
  const [f] = await db.select().from(fundosCvm).where(eq(fundosCvm.cnpj, cnpj))
  if (!f) return null
  return {
    cnpj: f.cnpj,
    nome: f.nome,
    classeAnbima: f.classeAnbima,
    taxaAdm: f.taxaAdm,
    taxaPerformance: f.taxaPerformance,
    diasConversaoResgate: f.diasConversaoResgate,
    diasPagamentoResgate: f.diasPagamentoResgate,
    dataReferencia: f.dataReferencia,
  }
}

/** Data do último dado bom de cada fonte, para a análise dizer "dados de mercado até dd/mm". */
export async function frescor(repo: Pick<RepoMercado, 'ultimoOkPorJob'>): Promise<Partial<Record<Job, string>>> {
  const ultimo = await repo.ultimoOkPorJob()
  return Object.fromEntries(Object.entries(ultimo).map(([job, d]) => [job, d!.toISOString().slice(0, 10)]))
}
