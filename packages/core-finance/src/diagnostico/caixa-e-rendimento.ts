/**
 * R03 (dinheiro parado), R04 (colchão de liquidez) e R02 (renda fixa abaixo do CDI).
 */
import {
  CONFIG_DIAGNOSTICO as C,
  brlCurto,
  diasEntre,
  ehPosCdi,
  pctDe,
  type Achado,
  type ContextoDiagnostico,
  type PosicaoDiagnostico,
} from './tipos'

const RENDA_FIXA = new Set(['fixed_income', 'credit_fixed_income'])

function rfPosCdi(p: PosicaoDiagnostico): boolean {
  return RENDA_FIXA.has(p.classe) && ehPosCdi(p)
}

export function regraR03(ctx: ContextoDiagnostico): Achado | null {
  if (ctx.gastoMensalCents === null) return null
  const cdi = ctx.cdi12m

  // Taxa relativa ao CDI de cada item; null quando não dá para saber.
  const itens: { valor: number; taxa: number | null }[] = []
  for (const c of ctx.caixa) {
    if (c.saldoCents <= 0) continue
    const taxa = c.tipo === 'savings' ? (cdi ? C.poupancaAnual / cdi : null) : 0
    itens.push({ valor: c.saldoCents, taxa })
  }
  const posicoes = ctx.posicoes.filter(
    (p) => rfPosCdi(p) && p.percentualIndexador! < C.r03TaxaMinima && p.valorCents > 0,
  )
  for (const p of posicoes) itens.push({ valor: p.valorCents, taxa: p.percentualIndexador })

  const grupo = itens.reduce((s, i) => s + i.valor, 0)
  const colchao = C.r03MesesColchao * ctx.gastoMensalCents
  const excedente = grupo - colchao
  if (excedente <= 0) return null

  let impacto: number | null = null
  if (cdi !== null && itens.every((i) => i.taxa !== null)) {
    const media = itens.reduce((s, i) => s + i.valor * i.taxa!, 0) / grupo
    impacto = Math.max(0, Math.round(excedente * cdi * (1 - media)))
  }

  const ganho = impacto === null ? '' : ` O excedente a 100% do CDI renderia ~${brlCurto(impacto)}/ano a mais.`
  return {
    ruleId: 'R03',
    severidade: 'alta',
    titulo: `${brlCurto(grupo)} parados abaixo de 90% do CDI`,
    posicoes: posicoes.map((p) => p.assetId),
    metricas: { grupoCents: grupo, colchaoCents: colchao, excedenteCents: excedente },
    impactoAnualCents: impacto,
    exposicaoCents: null,
    dica:
      `Colchão de ${C.r03MesesColchao} meses de gasto: ${brlCurto(colchao)}. Sobram ${brlCurto(excedente)}.${ganho} ` +
      'Aplicação com 100% do CDI e liquidez diária existe na maioria das corretoras.',
  }
}

function ehTesouroSelic(p: PosicaoDiagnostico): boolean {
  if (p.classe !== 'treasury') return false
  return p.indexador?.trim().toUpperCase() === 'SELIC' || /selic|\bLFT\b/i.test(p.nome)
}

export function regraR04(ctx: ContextoDiagnostico): Achado | null {
  if (ctx.gastoMensalCents === null) return null
  const caixa = ctx.caixa.reduce((s, c) => s + c.saldoCents, 0)
  const resgataveis = ctx.posicoes.filter(
    (p) => ehTesouroSelic(p) || (p.vencimento !== null && diasEntre(ctx.hoje, p.vencimento) <= 1),
  )
  const liquido = caixa + resgataveis.reduce((s, p) => s + p.valorCents, 0)
  const alvo = C.r04MesesColchao * ctx.gastoMensalCents
  if (liquido >= alvo) return null

  const falta = alvo - liquido
  return {
    ruleId: 'R04',
    severidade: 'alta',
    titulo: `Faltam ${brlCurto(falta)} para ${C.r04MesesColchao} meses de gasto à mão`,
    posicoes: resgataveis.map((p) => p.assetId),
    metricas: { liquidoCents: liquido, alvoCents: alvo, faltaCents: falta },
    impactoAnualCents: null,
    exposicaoCents: null,
    dica:
      `Dá para resgatar ${brlCurto(liquido)} em até um dia, contra ${brlCurto(alvo)} de ${C.r04MesesColchao} meses de gasto. ` +
      'A conta considera só conta corrente, poupança, dinheiro e Tesouro Selic: o banco não informa se o CDB tem liquidez diária.',
  }
}

export function regraR02(ctx: ContextoDiagnostico, jaNaR03: Set<string>): Achado[] {
  const cdi = ctx.cdi12m
  if (cdi === null) return []
  const achados: Achado[] = []
  for (const p of ctx.posicoes) {
    if (!rfPosCdi(p) || jaNaR03.has(p.assetId) || p.valorCents <= 0) continue
    const diff = cdi * (1 - p.percentualIndexador!)
    if (diff <= C.r02MargemPp) continue
    const impacto = Math.round(diff * p.valorCents)
    achados.push({
      ruleId: 'R02',
      severidade: impacto > C.r02AltaCents ? 'alta' : 'media',
      titulo: `${p.nome} rende ${pctDe(p.percentualIndexador!)} do CDI`,
      posicoes: [p.assetId],
      metricas: { percentualIndexador: p.percentualIndexador!, diferencaAnual: diff, valorCents: p.valorCents },
      impactoAnualCents: impacto,
      exposicaoCents: null,
      dica:
        `Com o CDI de 12 meses em ${pctDe(cdi, 1)}, os ${brlCurto(p.valorCents)} rendem ~${brlCurto(impacto)}/ano a menos que a 100% do CDI. ` +
        'CDB com 100% do CDI existe na maioria das corretoras. Veja antes o custo de resgatar antes do vencimento.',
    })
  }
  return achados
}
