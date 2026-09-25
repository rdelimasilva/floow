/**
 * Sugestão de categoria para a fila "Classificar lançamentos".
 *
 * Roda ao fim de cada importação. Para cada contraparte pendente ainda não
 * tentada:
 *   1. histórico — se o usuário já pôs aquele estabelecimento/pessoa numa
 *      categoria (≥ 2 lançamentos, ≥ 60% deles), sugere essa;
 *   2. Claude — senão, com confiança alta ou média, sugere a dele.
 *
 * A sugestão só pré-seleciona a categoria: quem confirma é o usuário. O teste
 * de 24/09/2026 contra as escolhas reais do usuário mostrou que confirmar
 * sozinho erraria 6 de 8 — quase sempre por categoria vizinha ("Hospedagem"
 * no lugar de "Viagens").
 *
 * Sem sugestão: transferência (precisa da conta de destino), natureza
 * misturada no grupo, e pessoa física (CPF) sem histórico pelo nome completo.
 * Deps injetadas: testável sem banco e sem API.
 */
import {
  destinosPorHistorico,
  isGenericCategory,
  normalizeMerchant,
  personKey,
  type SuggestionCategory,
} from '@floow/core-finance'

export type Natureza = 'expense' | 'income'

export interface GrupoPendente {
  counterpartyId: string
  displayName: string
  keyType: 'tax_id' | 'description'
  keyValue: string
  /** Natureza comum a todos os pendentes do grupo; null = transferência ou misturada. */
  nature: Natureza | null
  descricoes: string[]
  count: number
  totalCents: number
}

export interface CategoriaDaOrg extends SuggestionCategory {
  type: 'income' | 'expense' | 'transfer'
}

export interface LancamentoDoHistorico {
  description: string
  categoryId: string
}

export interface SugestaoDeCategoria {
  counterpartyId: string
  categoryId: string
  origem: 'historico' | 'claude'
}

export interface RespostaDoClassificador {
  counterpartyId: string
  categoryId: string | null
  confianca: 'alta' | 'media' | 'baixa'
}

export interface SugestaoDaFilaDeps {
  /** Contraparte pendente ainda não tentada (auto_attempted_at nulo). */
  carregarPendentes(orgId: string): Promise<GrupoPendente[]>
  /** Lançamentos já confirmados e categorizados da org. */
  carregarHistorico(orgId: string): Promise<LancamentoDoHistorico[]>
  carregarCategorias(orgId: string): Promise<CategoriaDaOrg[]>
  /** Ausente = sem chave de API: só o histórico sugere. */
  classificar?(orgId: string, grupos: GrupoPendente[], categorias: CategoriaDaOrg[]): Promise<RespostaDoClassificador[]>
  sugerir(orgId: string, sugestao: SugestaoDeCategoria): Promise<void>
  marcarTentativa(orgId: string, counterpartyIds: string[]): Promise<void>
}

export function ehPessoaFisica(g: GrupoPendente): boolean {
  return g.keyType === 'tax_id' && g.keyValue.replace(/\D/g, '').length === 11
}

export async function sugerirCategoriasDaFila(
  orgId: string,
  deps: SugestaoDaFilaDeps,
): Promise<{ sugeridas: number; semSugestao: number }> {
  const pendentes = await deps.carregarPendentes(orgId)
  if (pendentes.length === 0) return { sugeridas: 0, semSugestao: 0 }

  const [historico, categorias] = await Promise.all([deps.carregarHistorico(orgId), deps.carregarCategorias(orgId)])
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const valida = (id: string | null, nature: Natureza) => {
    const c = id ? porId.get(id) : undefined
    return !!c && c.type === nature && !isGenericCategory(c)
  }

  // Por natureza ("Uber" despesa não decide "Uber" receita) e por tipo de
  // chave: estabelecimento pelo nome, pessoa pelos dois primeiros nomes.
  const comoTx = historico.map((h) => ({ id: '', amountCents: 0, date: '', description: h.description, categoryId: h.categoryId }))
  const destinos = (nature: Natureza, pessoa: boolean) =>
    destinosPorHistorico(comoTx, (id) => valida(id, nature), pessoa ? personKey : normalizeMerchant)
  const mapas = new Map<string, Map<string, string>>()
  const destinoDe = (g: GrupoPendente & { nature: Natureza }) => {
    const pessoa = ehPessoaFisica(g)
    const k = `${g.nature}:${pessoa}`
    if (!mapas.has(k)) mapas.set(k, destinos(g.nature, pessoa))
    const chave = pessoa ? personKey(g.displayName) : normalizeMerchant(g.displayName) || normalizeMerchant(g.descricoes[0] ?? '')
    return chave ? mapas.get(k)!.get(chave) : undefined
  }

  const sugestoes: SugestaoDeCategoria[] = []
  const paraOClaude: GrupoPendente[] = []
  const tentados: string[] = []
  for (const g of pendentes) {
    if (!g.nature) {
      tentados.push(g.counterpartyId)
      continue
    }
    const doHistorico = destinoDe(g as GrupoPendente & { nature: Natureza })
    if (doHistorico) {
      sugestoes.push({ counterpartyId: g.counterpartyId, categoryId: doHistorico, origem: 'historico' })
      tentados.push(g.counterpartyId)
    } else if (ehPessoaFisica(g)) {
      tentados.push(g.counterpartyId)
    } else {
      paraOClaude.push(g)
    }
  }

  if (paraOClaude.length > 0 && deps.classificar) {
    try {
      const respostas = new Map((await deps.classificar(orgId, paraOClaude, categorias)).map((r) => [r.counterpartyId, r]))
      for (const g of paraOClaude) {
        const r = respostas.get(g.counterpartyId)
        if (r && r.confianca !== 'baixa' && valida(r.categoryId, g.nature!)) {
          sugestoes.push({ counterpartyId: g.counterpartyId, categoryId: r.categoryId!, origem: 'claude' })
        }
        tentados.push(g.counterpartyId)
      }
    } catch (err) {
      // Sem marcar tentativa: a próxima importação pergunta de novo — no caso
      // do teto de gasto, quando o mês virar.
      if (err instanceof Error && err.name === 'OrcamentoDoClaudeEsgotado') console.warn(`[sugestao-da-fila] ${err.message}`)
      else console.error(`[sugestao-da-fila] classificador falhou para org=${orgId}:`, err)
    }
  }

  for (const s of sugestoes) await deps.sugerir(orgId, s)
  if (tentados.length > 0) await deps.marcarTentativa(orgId, tentados)

  return { sugeridas: sugestoes.length, semSugestao: pendentes.length - sugestoes.length }
}
