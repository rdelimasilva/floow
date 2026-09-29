import { z } from 'zod'
import { getMonthlyCashFlowSummary } from '@/lib/finance/queries-cash-flow'
import type { Ferramenta } from './tipos'
import { mesSchema, reais, validar } from './utils'

/** A tela de Fluxo de Caixa usa a mesma consulta — os números batem. */
const MESES_COBERTOS = 24
const Params = z.object({ mes: mesSchema })

export const resumoDoMes: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'resumo_do_mes',
    description: 'Receitas, despesas e resultado de um mês (só lançamentos confirmados). Cobre os últimos 24 meses.',
    inputSchema: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'Mês no formato YYYY-MM' } },
      required: ['mes'],
    },
  },
  async executar(ctx, params) {
    const { mes } = validar(Params, params)
    const meses = await getMonthlyCashFlowSummary(ctx.orgId, MESES_COBERTOS)
    const linha = meses.find((m) => m.month === mes)
    if (!linha) return `Sem lançamentos confirmados em ${mes} (o resumo cobre os últimos ${MESES_COBERTOS} meses).`
    return [
      `Resumo de ${mes} (lançamentos confirmados):`,
      `- Receitas: ${reais(linha.income)}`,
      `- Despesas: ${reais(Math.abs(linha.expense))}`,
      `- Resultado: ${reais(linha.net)}`,
    ].join('\n')
  },
}
