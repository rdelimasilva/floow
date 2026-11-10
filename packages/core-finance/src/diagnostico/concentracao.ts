/**
 * R05 (ativo ou emissor), R06 (acima do FGC) e R07 (classe) — concentração.
 */
import {
  CONFIG_DIAGNOSTICO as C,
  brlCurto,
  conglomerado,
  patrimonioCents,
  pctDe,
  type Achado,
  type ContextoDiagnostico,
  type PosicaoDiagnostico,
} from './tipos'

const RENDA_FIXA = new Set(['fixed_income', 'credit_fixed_income'])
const SEM_TITULAR = 'sem titular'

/** Peso no título: com uma casa quando o arredondamento cairia no próprio limite. */
function pesoNoTitulo(peso: number, limite: number): string {
  return pctDe(peso, Math.round(peso * 100) <= Math.round(limite * 100) ? 1 : 0)
}

interface Grupo {
  chave: string
  posicoes: PosicaoDiagnostico[]
  soma: number
}

function agrupar(posicoes: PosicaoDiagnostico[], chave: (p: PosicaoDiagnostico) => string): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const p of posicoes) {
    const k = chave(p)
    const g = grupos.get(k) ?? { chave: k, posicoes: [], soma: 0 }
    g.posicoes.push(p)
    g.soma += p.valorCents
    grupos.set(k, g)
  }
  return [...grupos.values()]
}

/** Nome legível do emissor: o banco conhecido, senão o emissor ou o nome da primeira posição. */
function nomeDoEmissor(g: Grupo, banco: string): string {
  if (!/^\d+$/.test(banco) && !banco.startsWith('ativo:')) return banco
  return g.posicoes[0].emissor ?? g.posicoes[0].nome
}

export function regraR05(ctx: ContextoDiagnostico): Achado[] {
  const total = patrimonioCents(ctx)
  if (total <= 0) return []

  const avulsos = ctx.posicoes.filter((p) => p.classe === 'br_equity' || p.classe === 'fii')
  const rf = ctx.posicoes.filter((p) => RENDA_FIXA.has(p.classe))
  const grupos = [
    ...agrupar(avulsos, (p) => p.ticker?.trim().toUpperCase() || p.assetId).map((g) => ({ g, nome: g.posicoes[0].ticker ?? g.posicoes[0].nome })),
    ...agrupar(rf, (p) => conglomerado(p.cnpjEmissor, p.assetId)).map((g) => ({ g, nome: nomeDoEmissor(g, g.chave) })),
  ]

  const achados: Achado[] = []
  for (const { g, nome } of grupos) {
    const peso = g.soma / total
    if (peso <= C.r05Limite) continue
    achados.push({
      ruleId: 'R05',
      severidade: peso > C.r05Alta ? 'alta' : 'media',
      titulo: `${pesoNoTitulo(peso, C.r05Limite)} da carteira em ${nome}`,
      posicoes: g.posicoes.map((p) => p.assetId),
      metricas: { peso, valorCents: g.soma },
      impactoAnualCents: null,
      exposicaoCents: null,
      dica:
        `São ${brlCurto(g.soma)} de ${brlCurto(total)}. O limite usado aqui é ${pctDe(C.r05Limite)} num único ativo ou emissor: ` +
        'um problema nele afeta uma parte grande do patrimônio.',
    })
  }
  return achados
}

export function regraR06(ctx: ContextoDiagnostico): Achado[] {
  if (patrimonioCents(ctx) <= 0) return []
  const fgc: readonly string[] = C.subtiposFgc
  const cobertos = ctx.posicoes.filter((p) => fgc.includes((p.subtipo ?? '').trim().toUpperCase()))
  const grupos = agrupar(
    cobertos,
    (p) => `${p.titular ?? SEM_TITULAR}\u0000${conglomerado(p.cnpjEmissor, p.assetId)}`,
  )

  const achados: Achado[] = []
  for (const g of grupos) {
    if (g.soma <= C.r06LimiteFgcCents) continue
    const [titular, banco] = g.chave.split('\u0000')
    const excedente = g.soma - C.r06LimiteFgcCents
    achados.push({
      ruleId: 'R06',
      severidade: 'media',
      titulo: `${brlCurto(g.soma)} em ${nomeDoEmissor(g, banco)}${titular === SEM_TITULAR ? '' : ` (titular: ${titular})`}`,
      posicoes: g.posicoes.map((p) => p.assetId),
      metricas: { valorCents: g.soma, limiteCents: C.r06LimiteFgcCents },
      impactoAnualCents: null,
      exposicaoCents: excedente,
      dica:
        `${brlCurto(excedente)} acima dos ${brlCurto(C.r06LimiteFgcCents)} que o FGC cobre por CPF em cada instituição. ` +
        'Com o valor dividido entre bancos de grupos diferentes, tudo fica coberto.',
    })
  }
  return achados
}

const BALDE: Record<string, { chave: string; nome: string }> = {
  fixed_income: { chave: 'renda_fixa', nome: 'renda fixa' },
  credit_fixed_income: { chave: 'renda_fixa', nome: 'renda fixa' },
  treasury: { chave: 'renda_fixa', nome: 'renda fixa' },
  br_equity: { chave: 'acoes', nome: 'ações' },
  fii: { chave: 'fii', nome: 'fundos imobiliários' },
  etf: { chave: 'etf', nome: 'ETFs' },
  fund: { chave: 'fundos', nome: 'fundos' },
  crypto: { chave: 'cripto', nome: 'cripto' },
  international: { chave: 'internacional', nome: 'ativos no exterior' },
}

export function regraR07(ctx: ContextoDiagnostico): Achado[] {
  if (ctx.perfil !== 'moderado' && ctx.perfil !== 'arrojado') return []
  const total = patrimonioCents(ctx)
  if (total <= 0) return []

  const baldes = new Map<string, { nome: string; soma: number }>()
  const somar = (chave: string, nome: string, valor: number) => {
    const b = baldes.get(chave) ?? { nome, soma: 0 }
    b.soma += valor
    baldes.set(chave, b)
  }
  somar('caixa', 'caixa', ctx.caixa.reduce((s, c) => s + c.saldoCents, 0))
  for (const p of ctx.posicoes) {
    const b = BALDE[p.classe] ?? { chave: p.classe, nome: p.classe }
    somar(b.chave, b.nome, p.valorCents)
  }

  const achados: Achado[] = []
  for (const [chave, b] of baldes) {
    const peso = b.soma / total
    if (peso <= C.r07Limite) continue
    achados.push({
      ruleId: 'R07',
      severidade: 'media',
      titulo: `${pesoNoTitulo(peso, C.r07Limite)} da carteira em ${b.nome}`,
      posicoes: chave === 'caixa' ? [] : ctx.posicoes.filter((p) => (BALDE[p.classe]?.chave ?? p.classe) === chave).map((p) => p.assetId),
      metricas: { peso, valorCents: b.soma },
      impactoAnualCents: null,
      exposicaoCents: null,
      dica:
        `Para quem se diz ${ctx.perfil}, mais de ${pctDe(C.r07Limite)} numa classe só deixa a carteira presa ao humor dela. ` +
        'Vale ver se essa divisão é de propósito.',
    })
  }
  return achados
}
