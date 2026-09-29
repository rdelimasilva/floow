import type { OrigemDaTransacao } from '@floow/db'
import { contrapartesCompativeis } from '../openfinance/duplicata'

/**
 * Numa conta Open Finance, só o extrato daquela conta move o saldo. Todo o
 * resto que entra nela aguarda o extrato, e o extrato, quando chega, absorve.
 *
 * Absorver sem perguntar é seguro porque a linha provisória nunca esteve no
 * saldo: um casamento errado troca uma etiqueta, nunca o saldo. É o oposto da
 * previsão de recorrência (21/09), em que casar errado escondia dinheiro de
 * verdade — lá a aprovação continua.
 *
 * Ver docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md
 */

/** Quem aguarda o extrato, e só em conta Open Finance viva. */
export const ORIGENS_QUE_AGUARDAM_EXTRATO: readonly OrigemDaTransacao[] = ['manual', 'arquivo', 'perna']

export function deveAguardarExtrato(origem: OrigemDaTransacao, contaOpenFinance: boolean): boolean {
  return contaOpenFinance && ORIGENS_QUE_AGUARDAM_EXTRATO.includes(origem)
}

/** Folga entre a data que o usuário (ou o outro banco) deu e a do extrato. */
export const JANELA_DE_ABSORCAO_DIAS = 3

const DIA_EM_MS = 24 * 60 * 60 * 1000

export interface LinhaParaConciliar {
  id: string
  amountCents: number
  /** AAAA-MM-DD. */
  dateISO: string
  counterpartyTaxId: string | null
}

export interface ParConciliado {
  aguardandoId: string
  extratoId: string
}

export function chaveDoPar(aguardandoId: string, extratoId: string): string {
  return `${aguardandoId}|${extratoId}`
}

function distanciaEmDias(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA_EM_MS
}

function compativeis(aguardando: LinhaParaConciliar, extrato: LinhaParaConciliar): boolean {
  return (
    aguardando.amountCents === extrato.amountCents &&
    distanciaEmDias(aguardando.dateISO, extrato.dateISO) <= JANELA_DE_ABSORCAO_DIAS &&
    contrapartesCompativeis(aguardando, extrato)
  )
}

/**
 * R1: absorve o par ÚNICO dos dois lados (o extrato tem um só aguardando
 * compatível e vice-versa). Mais de um candidato de qualquer lado não escolhe:
 * propõe o de data mais próxima, para o usuário decidir.
 *
 * Uma proposta por ponta, nunca duas: `uq_fmp_previsao_pendente` e
 * `uq_fmp_realizado_pendente` aceitam uma pendente por lado. As outras
 * candidatas nascem na passada seguinte, depois da decisão.
 *
 * `recusados` (chaves de `chaveDoPar`) é o que o usuário já disse que não é o
 * mesmo dinheiro — não volta nem como absorção nem como proposta.
 */
export function conciliarExtratoComAguardando(
  extrato: LinhaParaConciliar[],
  aguardando: LinhaParaConciliar[],
  recusados: ReadonlySet<string> = new Set(),
): { absorver: ParConciliado[]; propor: ParConciliado[] } {
  const candidatosDe = new Map<string, LinhaParaConciliar[]>()
  const grauDoExtrato = new Map<string, number>()

  for (const a of aguardando) {
    const cs = extrato.filter((e) => !recusados.has(chaveDoPar(a.id, e.id)) && compativeis(a, e))
    candidatosDe.set(a.id, cs)
    for (const e of cs) grauDoExtrato.set(e.id, (grauDoExtrato.get(e.id) ?? 0) + 1)
  }

  // Ordem estável: o resultado não pode depender da ordem em que o banco
  // devolveu as linhas.
  const ordenados = [...aguardando].sort((x, y) => x.dateISO.localeCompare(y.dateISO) || x.id.localeCompare(y.id))

  const absorver: ParConciliado[] = []
  const extratoUsado = new Set<string>()
  for (const a of ordenados) {
    const cs = candidatosDe.get(a.id)!
    if (cs.length === 1 && grauDoExtrato.get(cs[0].id) === 1) {
      absorver.push({ aguardandoId: a.id, extratoId: cs[0].id })
      extratoUsado.add(cs[0].id)
    }
  }

  const absorvidos = new Set(absorver.map((p) => p.aguardandoId))
  const propor: ParConciliado[] = []
  for (const a of ordenados) {
    if (absorvidos.has(a.id)) continue
    const livres = candidatosDe.get(a.id)!.filter((e) => !extratoUsado.has(e.id))
    if (livres.length === 0) continue
    const [melhor] = [...livres].sort(
      (x, y) => distanciaEmDias(a.dateISO, x.dateISO) - distanciaEmDias(a.dateISO, y.dateISO) || x.id.localeCompare(y.id),
    )
    propor.push({ aguardandoId: a.id, extratoId: melhor.id })
    extratoUsado.add(melhor.id)
  }

  return { absorver, propor }
}

export interface ProvisoriaParaEfeito {
  origem: OrigemDaTransacao
  categoryId: string | null
  description: string
}

export interface ExtratoParaEfeito {
  reviewState: 'confirmed' | 'pending'
  categoryId: string | null
  isAutoCategorized: boolean
}

export type EfeitoDaAbsorcao =
  | { type: 'transfer'; categoryId: null; reviewState: 'confirmed'; transferAccountId: string }
  | { categoryId: string; description: string; reviewState: 'confirmed'; isAutoCategorized: false }

/**
 * O que muda na linha do extrato quando ela absorve a provisória.
 *
 * Perna de transferência: o extrato vira a ponta da transferência — o mesmo
 * efeito que `aprovarProposta` dava à perna prevista (spec de 24/09 §3.3).
 * O `transfer_group_id` NÃO vai junto: `deleteTransaction` e
 * `desfazerParDaRegra` tratam o grupo inteiro, e estornariam o saldo do
 * extrato junto com a perna.
 *
 * Manual ou arquivo: o extrato herda o que o usuário decidiu, só se ainda não
 * foi classificado à mão. Categoria automática (regra, Polp, contraparte) é
 * palpite da máquina e perde para a escolha do usuário.
 */
export function efeitoDaAbsorcao(
  provisoria: ProvisoriaParaEfeito,
  extrato: ExtratoParaEfeito,
  outraConta: string | null,
): EfeitoDaAbsorcao | null {
  if (provisoria.origem === 'perna') {
    return outraConta ? { type: 'transfer', categoryId: null, reviewState: 'confirmed', transferAccountId: outraConta } : null
  }
  const classificadoAMao = extrato.reviewState === 'confirmed' && extrato.categoryId !== null && !extrato.isAutoCategorized
  if (classificadoAMao || provisoria.categoryId === null) return null
  return { categoryId: provisoria.categoryId, description: provisoria.description, reviewState: 'confirmed', isAutoCategorized: false }
}
