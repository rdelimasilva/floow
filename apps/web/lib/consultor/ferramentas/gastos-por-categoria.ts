import { z } from 'zod'
import { getSpendingByCategory } from '@/lib/finance/budget-queries'
import { getCategories } from '@/lib/finance/queries-categories'
import type { Ferramenta } from './tipos'
import { LIMITE_LINHAS, dataSchema, intervaloDeDatas, normalizar, reais, validar } from './utils'

const Params = z.object({ inicio: dataSchema, fim: dataSchema, categoria: z.string().min(1).optional() })

export const gastosPorCategoria: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'gastos_por_categoria',
    description:
      'Total gasto por categoria num período (mesma conta do Plano de Gastos: despesas confirmadas, sem ignoradas nem aplicações). ' +
      'Com "categoria", filtra pelas categorias cujo nome contém o texto.',
    inputSchema: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
        fim: { type: 'string', description: 'Data final YYYY-MM-DD (inclusiva)' },
        categoria: { type: 'string', description: 'Trecho do nome da categoria (opcional)' },
      },
      required: ['inicio', 'fim'],
    },
  },
  async executar(ctx, params) {
    const p = validar(Params, params)
    const { inicio, fim } = intervaloDeDatas(p.inicio, p.fim)
    const [gastos, categorias] = await Promise.all([
      getSpendingByCategory(ctx.orgId, inicio, fim),
      getCategories(ctx.orgId),
    ])
    const nomePorId = new Map(categorias.map((c) => [c.id, c.name]))
    let linhas = gastos.map((g) => ({
      nome: g.categoryId ? (nomePorId.get(g.categoryId) ?? 'Categoria removida') : 'Sem categoria',
      gasto: g.spent,
    }))
    if (p.categoria) {
      const alvo = normalizar(p.categoria)
      linhas = linhas.filter((l) => normalizar(l.nome).includes(alvo))
      if (linhas.length === 0) return `Nenhum gasto em categoria parecida com "${p.categoria}" entre ${p.inicio} e ${p.fim}.`
    }
    if (linhas.length === 0) return `Nenhum gasto confirmado entre ${p.inicio} e ${p.fim}.`

    linhas.sort((a, b) => b.gasto - a.gasto)
    const total = linhas.reduce((s, l) => s + l.gasto, 0)
    const mostradas = linhas.slice(0, LIMITE_LINHAS)
    const resto = linhas.slice(LIMITE_LINHAS)
    return [
      `Gastos de ${p.inicio} a ${p.fim}:`,
      ...mostradas.map((l) => `- ${l.nome}: ${reais(l.gasto)}`),
      ...(resto.length ? [`- (+${resto.length} categorias menores: ${reais(resto.reduce((s, l) => s + l.gasto, 0))})`] : []),
      `Total: ${reais(total)}`,
    ].join('\n')
  },
}
