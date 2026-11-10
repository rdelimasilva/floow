/**
 * R11 (vencimento próximo) e R12 (dados que faltam para o diagnóstico).
 */
import {
  CONFIG_DIAGNOSTICO as C,
  brlCurto,
  diasEntre,
  type Achado,
  type ContextoDiagnostico,
  type PosicaoDiagnostico,
} from './tipos'

function quando(dias: number): string {
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  return `vence em ${dias} dias`
}

export function regraR11(ctx: ContextoDiagnostico): Achado[] {
  const achados: Achado[] = []
  for (const p of ctx.posicoes) {
    if (p.vencimento === null || p.valorCents <= 0) continue
    const dias = diasEntre(ctx.hoje, p.vencimento)
    if (dias < 0 || dias >= C.r11Dias) continue
    achados.push({
      ruleId: 'R11',
      severidade: 'info',
      titulo: `${p.nome} ${quando(dias)} (${brlCurto(p.valorCents)})`,
      posicoes: [p.assetId],
      metricas: { dias, valorCents: p.valorCents },
      impactoAnualCents: null,
      exposicaoCents: p.valorCents,
      dica: 'No vencimento o dinheiro cai na conta. Vale decidir antes para onde ele vai, para não ficar parado.',
    })
  }
  return achados
}

const RENDA_FIXA = new Set(['fixed_income', 'credit_fixed_income'])
const COM_TICKER = new Set(['br_equity', 'fii', 'etf'])

function incompleta(p: PosicaoDiagnostico): boolean {
  // Valor 0 que chega aqui é ativo manual sem cotação (o encerrado já saiu antes).
  if (p.valorCents <= 0) return true
  if (RENDA_FIXA.has(p.classe)) return p.percentualIndexador === null && p.taxaPrefixada === null
  if (COM_TICKER.has(p.classe)) return !p.ticker
  return false
}

export function regraR12(ctx: ContextoDiagnostico): Achado | null {
  const faltando = ctx.posicoes.filter(incompleta)
  const semGasto = ctx.gastoMensalCents === null
  if (faltando.length === 0 && !semGasto) return null

  const partes: string[] = []
  if (faltando.length > 0) {
    partes.push(`Sem taxa, sem ticker ou sem cotação: ${faltando.map((p) => p.nome).join(', ')}.`)
  }
  if (semGasto) {
    partes.push('O fluxo de caixa está sem histórico de gastos suficiente (menos de 3 meses), então colchão e dinheiro parado não foram avaliados.')
  }

  const n = faltando.length
  return {
    ruleId: 'R12',
    severidade: 'info',
    titulo: n > 0 ? `${n} ${n === 1 ? 'posição' : 'posições'} sem dados completos` : 'Pouco histórico de gastos',
    posicoes: faltando.map((p) => p.assetId),
    metricas: { posicoes: n },
    impactoAnualCents: null,
    exposicaoCents: null,
    dica: n > 0 ? `${partes.join(' ')} Essas posições ficam fora das regras que dependem do dado.` : partes.join(' '),
  }
}
