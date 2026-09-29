import { z } from 'zod'
import { withUserDbFor } from '@/lib/db/rls'
import { getBudgetEntriesForMonth, getInvestmentContributions, getSpendingByCategory } from '@/lib/finance/budget-queries'
import { buscarOcorrenciasDeRecorrentes } from '@/lib/finance/recurring-budget-queries'
import { combinarMetasDoMes, somarRecorrentesPorCategoria } from '@/lib/finance/recurring-budget'
import { getCategories } from '@/lib/finance/queries-categories'
import type { ContextoFerramenta, Ferramenta } from './tipos'
import { LIMITE_LINHAS, intervaloDoMes, mesSchema, reais, validar } from './utils'

const Params = z.object({ mes: mesSchema, tipo: z.enum(['spending', 'investing']) })

async function planoDeInvestimentos(ctx: ContextoFerramenta, mes: string): Promise<string> {
  const { inicio, fim } = intervaloDoMes(mes)
  const [linhas, aportado] = await Promise.all([
    getBudgetEntriesForMonth(ctx.orgId, inicio, 'investing'),
    getInvestmentContributions(ctx.orgId, inicio, fim),
  ])
  if (linhas.length === 0) return `Nenhuma meta de investimento para ${mes}. Aportado no mês: ${reais(aportado)}.`
  const meta = linhas.reduce((s, l) => s + l.plannedCents, 0)
  return [
    `Meta de investimentos de ${mes}:`,
    ...linhas.map((l) => `- ${l.name ?? 'Aportes'}: ${reais(l.plannedCents)}`),
    `Meta total: ${reais(meta)}`,
    `Aportado: ${reais(aportado)}`,
    `Falta: ${reais(Math.max(0, meta - aportado))}`,
  ].join('\n')
}

/**
 * Metas + recorrentes-meta, pelo mesmo caminho da tela
 * (`getSpendingPlanForMonth` em `lib/finance/recurring-budget-queries.ts`):
 * sob o RLS do usuário do contexto.
 */
async function planoDeGastos(ctx: ContextoFerramenta, mes: string): Promise<string> {
  const { inicio, fim } = intervaloDoMes(mes)
  const [manuais, ocorrencias, gastos, categorias] = await Promise.all([
    getBudgetEntriesForMonth(ctx.orgId, inicio, 'spending'),
    withUserDbFor(ctx.userId, (tx) => buscarOcorrenciasDeRecorrentes(tx, ctx.orgId, inicio, fim)),
    getSpendingByCategory(ctx.orgId, inicio, fim),
    getCategories(ctx.orgId),
  ])
  const plano = combinarMetasDoMes(
    manuais.map((e) => ({ id: e.id, categoryId: e.categoryId, plannedCents: e.plannedCents })),
    somarRecorrentesPorCategoria(ocorrencias),
  )
  if (plano.length === 0) return `Nenhum plano de gastos para ${mes}.`

  const nomePorId = new Map(categorias.map((c) => [c.id, c.name]))
  const gastoPor = new Map(gastos.map((g) => [g.categoryId, g.spent]))
  const noPlano = new Set(plano.map((l) => l.categoryId))
  const linhas = plano.map((l) => {
    const gasto = gastoPor.get(l.categoryId) ?? 0
    const nome = (l.categoryId && nomePorId.get(l.categoryId)) || 'Sem categoria'
    const saldo = gasto > l.plannedCents ? `estourou ${reais(gasto - l.plannedCents)}` : `resta ${reais(l.plannedCents - gasto)}`
    return { gasto, texto: `- ${nome}: planejado ${reais(l.plannedCents)}, gasto ${reais(gasto)}, ${saldo}` }
  })
  const planejado = plano.reduce((s, l) => s + l.plannedCents, 0)
  const gastoNoPlano = linhas.reduce((s, l) => s + l.gasto, 0)
  const fora = gastos.filter((g) => !noPlano.has(g.categoryId)).reduce((s, g) => s + g.spent, 0)
  return [
    `Plano de gastos de ${mes}:`,
    ...linhas.slice(0, LIMITE_LINHAS).map((l) => l.texto),
    `Total planejado: ${reais(planejado)}; gasto nas categorias do plano: ${reais(gastoNoPlano)}`,
    `Gasto fora do plano: ${reais(fora)}`,
  ].join('\n')
}

export const planoDoMes: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'plano_do_mes',
    description:
      'Plano do mês. tipo "spending" = Plano de Gastos (planejado × gasto por categoria); ' +
      'tipo "investing" = Meta de Investimentos (meta × aportado).',
    inputSchema: {
      type: 'object',
      properties: {
        mes: { type: 'string', description: 'Mês no formato YYYY-MM' },
        tipo: { type: 'string', enum: ['spending', 'investing'] },
      },
      required: ['mes', 'tipo'],
    },
  },
  async executar(ctx, params) {
    const { mes, tipo } = validar(Params, params)
    return tipo === 'investing' ? planoDeInvestimentos(ctx, mes) : planoDeGastos(ctx, mes)
  },
}
