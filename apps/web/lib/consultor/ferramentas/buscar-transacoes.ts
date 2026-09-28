import { z } from 'zod'
import { getTransactionsWithCount } from '@/lib/finance/queries-transactions'
import { getCategories } from '@/lib/finance/queries-categories'
import { getAccounts } from '@/lib/finance/queries-accounts'
import type { Ferramenta } from './tipos'
import { LIMITE_LINHAS, dataISO, dataSchema, intervaloDeDatas, normalizar, reais, validar } from './utils'

/** Teto da consulta. O total só é exato abaixo dele. */
export const BUSCA_MAX = 200

const Params = z.object({
  inicio: dataSchema,
  fim: dataSchema,
  texto: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  conta: z.string().min(1).optional(),
})

function idsQueCasam(itens: { id: string; name: string }[], trecho: string): string[] {
  const alvo = normalizar(trecho)
  return itens.filter((i) => normalizar(i.name).includes(alvo)).map((i) => i.id)
}

export const buscarTransacoes: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'buscar_transacoes',
    description:
      'Lançamentos confirmados de um período, com filtros opcionais por texto da descrição (ex.: "ifood"), ' +
      'categoria e conta (trechos do nome). Devolve totais e os 30 mais recentes.',
    inputSchema: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
        fim: { type: 'string', description: 'Data final YYYY-MM-DD (inclusiva)' },
        texto: { type: 'string', description: 'Trecho da descrição do lançamento' },
        categoria: { type: 'string', description: 'Trecho do nome da categoria' },
        conta: { type: 'string', description: 'Trecho do nome da conta' },
      },
      required: ['inicio', 'fim'],
    },
  },
  async executar(ctx, params) {
    const p = validar(Params, params)
    intervaloDeDatas(p.inicio, p.fim)

    let categoryIds: string | undefined
    if (p.categoria) {
      const ids = idsQueCasam(await getCategories(ctx.orgId), p.categoria)
      if (ids.length === 0) return `Nenhuma categoria parecida com "${p.categoria}".`
      categoryIds = ids.join(',')
    }
    let accountId: string | undefined
    if (p.conta) {
      const ids = idsQueCasam(await getAccounts(ctx.orgId), p.conta)
      if (ids.length === 0) return `Nenhuma conta parecida com "${p.conta}".`
      accountId = ids.join(',')
    }

    const { transactions: linhas } = await getTransactionsWithCount(ctx.orgId, {
      startDate: p.inicio, endDate: p.fim, search: p.texto, categoryIds, accountId, limit: BUSCA_MAX,
    })
    const validas = linhas.filter((t) => t.reviewState === 'confirmed' && !t.isIgnored)
    if (validas.length === 0) return 'Nenhum lançamento confirmado encontrado com esses filtros.'

    const soma = (tipo: string) => validas.filter((t) => t.type === tipo).reduce((s, t) => s + Math.abs(t.amountCents), 0)
    const cortada = linhas.length >= BUSCA_MAX
    return [
      cortada
        ? `INCOMPLETO: a busca parou em ${BUSCA_MAX} lançamentos; os totais abaixo são parciais. Refine período ou filtros antes de citar total.`
        : `${validas.length} lançamentos.`,
      `Total de despesas: ${reais(soma('expense'))}`,
      `Total de receitas: ${reais(soma('income'))}`,
      ...validas.slice(0, LIMITE_LINHAS).map(
        (t) => `- ${dataISO(t.date)} | ${t.description} | ${reais(t.amountCents)} | ${t.categoryName ?? 'Sem categoria'}`,
      ),
      ...(validas.length > LIMITE_LINHAS ? [`(mostrando os ${LIMITE_LINHAS} mais recentes)`] : []),
    ].join('\n')
  },
}
