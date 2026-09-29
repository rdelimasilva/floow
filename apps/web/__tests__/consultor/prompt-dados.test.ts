import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Consulta encadeada (select().from().where()...) que resolve para `resultado`. */
function consultaEncadeada<T>(resultado: T) {
  const alvo: Record<string, unknown> = {}
  const proxy: unknown = new Proxy(alvo, {
    get(_t, prop: string) {
      if (prop === 'then') return (ok: (v: T) => void) => ok(resultado)
      return () => proxy
    },
  })
  return proxy
}

const insightsFalsos = [{ severity: 'warning', title: 'Delivery alto', body: 'Subiu 40%' }]
const tx = { select: vi.fn(() => consultaEncadeada(insightsFalsos)) }

vi.mock('@/lib/db/rls', () => ({ withUserDbFor: vi.fn(async (_u: string, fn: (t: unknown) => unknown) => fn(tx)) }))
vi.mock('@/lib/finance/queries-accounts', () => ({ getAccounts: vi.fn(async () => [{ name: 'Itaú' }]) }))
vi.mock('@/lib/finance/queries-categories', () => ({ getCategories: vi.fn(async () => [{ name: 'Mercado' }]) }))
vi.mock('@/lib/consultor/memorias', () => ({ listarMemorias: vi.fn() }))

import { withUserDbFor } from '@/lib/db/rls'
import { listarMemorias } from '@/lib/consultor/memorias'
import { carregarDadosDoPrompt } from '@/lib/consultor/prompt-dados'

beforeEach(() => {
  vi.mocked(withUserDbFor).mockClear()
  vi.mocked(listarMemorias).mockReset()
})

describe('carregarDadosDoPrompt', () => {
  it('memórias indisponíveis: chat segue sem depender da tabela, memorias vem vazio e o erro é logado', async () => {
    const erro = new Error('tabela consultor_memorias não existe')
    vi.mocked(listarMemorias).mockRejectedValueOnce(erro)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const dados = await carregarDadosDoPrompt('org-1', 'u1', 'web')

    expect(dados.memorias).toEqual([])
    expect(dados.contas).toEqual(['Itaú'])
    expect(dados.categorias).toEqual(['Mercado'])
    expect(log).toHaveBeenCalledWith('[consultor] falha ao carregar memórias', erro)
    log.mockRestore()
  })

  it('memórias disponíveis: seguem no resultado', async () => {
    vi.mocked(listarMemorias).mockResolvedValueOnce([{ id: 'm1', conteudo: 'x', createdAt: new Date(0) }])
    const dados = await carregarDadosDoPrompt('org-1', 'u1', 'web')
    expect(dados.memorias).toEqual([{ id: 'm1', conteudo: 'x' }])
  })
})
