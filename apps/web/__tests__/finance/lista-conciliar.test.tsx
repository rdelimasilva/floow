/**
 * RTL da lista do Conciliar (spec 2026-10-13): uma linha por lançamento com o
 * palpite e um botão; a linha some no clique e a gravação segue por trás; o
 * detalhe (peças do modo foco) só abre a pedido.
 *
 * As actions vêm de `vi.hoisted`: a factory de `vi.mock` sobe para o topo do
 * arquivo, antes de qualquer `const`, e o import de `ListaConciliar` a dispara.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'
import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'

const { vincularPrevisao, marcarSemVinculo, classificarSoEste, confirmCounterparty, aprovarDuplicata, recusarDuplicata, refresh } = vi.hoisted(() => ({
  refresh: vi.fn(),
  vincularPrevisao: vi.fn(),
  marcarSemVinculo: vi.fn(),
  classificarSoEste: vi.fn(),
  confirmCounterparty: vi.fn(),
  aprovarDuplicata: vi.fn(),
  recusarDuplicata: vi.fn(),
}))
vi.mock('@/lib/finance/conciliacao/vincular-actions', () => ({ vincularPrevisao, marcarSemVinculo, classificarSoEste, procurarPrevisoes: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/finance/duplicata-actions', () => ({ aprovarDuplicata, recusarDuplicata }))
vi.mock('@/lib/openfinance/counterparty-actions', () => ({ confirmCounterparty }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { ListaConciliar, type CategoryOption } from '@/components/finance/conciliar/lista-conciliar'

const conta = { id: 'itau', nome: 'Conta Itaú', tipo: 'checking', instituicao: 'Itaú', agencia: '0123', numero: '45219' }
const base = { date: '2026-09-12', amountCents: -150000, cardLastDigits: null, importedAt: '2026-09-13T10:00:00Z', meio: null, conta, repetido: null, classificacao: null, candidatas: [] }
const cand = (id: string, extra = {}) => ({ id, accountId: 'itau', contaNome: 'Conta Itaú', date: '2026-09-10', amountCents: -150000, description: `Prev ${id}`, categoriaNome: 'Aluguel', diasDeDiferenca: 2, diferencaCents: 0, outraConta: false, propostaId: null, nomeParecido: false, ...extra })
const classificacao = { counterpartyId: 'cp-1', displayName: 'NETFLIX.COM', nature: 'expense' as const, categoryId: 'cat-1', suggestionSource: 'historico' as const, sugestaoContaId: null, ehCpfProprio: false, outrosNaFila: 0 }
const repetido = (id: string) => ({
  propostaId: `d-${id}`,
  outro: { id: 'm', date: '2026-09-12', description: 'Facebook', amountCents: -1256, categoria: 'Outros serviços gerais', importadoEm: '2026-09-19T18:28:00Z' },
  este: { id, date: '2026-09-12', description: 'Facebook', amountCents: -1256, categoria: 'Outros serviços gerais', importadoEm: '2026-10-13T11:01:00Z' },
  horasEntreEmissoes: 697,
})
const opts = { categoryOptions: [{ id: 'cat-1', label: 'Assinaturas', type: 'expense' }] as CategoryOption[], accountOptions: [{ id: 'itau', name: 'Conta Itaú' }, { id: 'nu', name: 'Nubank' }] }

function montar(itens: unknown[], total = itens.length) {
  return render(<ToastProvider><ListaConciliar itens={itens as ItemDaFila[]} total={total} {...opts} /></ToastProvider>)
}
const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome })

beforeEach(() => {
  vi.clearAllMocks()
  vincularPrevisao.mockResolvedValue({ efetivada: true, classificou: true })
  marcarSemVinculo.mockResolvedValue({ ok: true })
  classificarSoEste.mockResolvedValue({ ok: true })
  confirmCounterparty.mockResolvedValue({ reclassified: 3 })
  aprovarDuplicata.mockResolvedValue({ efetivada: true })
  recusarDuplicata.mockResolvedValue({ recusada: true })
})

describe('ListaConciliar — o palpite de cada linha', () => {
  it('repetido: "Cópia, chegou de novo em DD/MM" e Descartar', () => {
    montar([{ ...base, id: 'a', description: 'Facebook', amountCents: -1256, repetido: repetido('a') }])
    expect(screen.getByText('Cópia, chegou de novo em 13/10')).toBeInTheDocument()
    expect(botao('Descartar')).toBeInTheDocument()
  })
  it('repetido: "São duas compras" na própria linha, sem abrir o detalhe', async () => {
    montar([{ ...base, id: 'a', description: 'Facebook', amountCents: -1256, repetido: repetido('a') }])
    await act(async () => { fireEvent.click(botao('São duas compras')) })
    expect(recusarDuplicata).toHaveBeenCalledWith('d-a')
    expect(aprovarDuplicata).not.toHaveBeenCalled()
  })
  it('previsão parecida: pergunta pela melhor e Vincular', () => {
    montar([{ ...base, id: 'a', description: 'PIX JOAO', candidatas: [cand('p1'), cand('p2')] }])
    expect(screen.getByText('É "Prev p1" de 10/09?')).toBeInTheDocument()
    expect(botao('Vincular')).toBeInTheDocument()
  })
  it('classificação completa: o nome da categoria e Confirmar', () => {
    montar([{ ...base, id: 'a', description: 'NETFLIX', classificacao }])
    expect(screen.getByText('Assinaturas')).toBeInTheDocument()
    expect(botao('Confirmar')).toBeInTheDocument()
  })
  it('sem categoria: "Escolher categoria", não marca, e o botão abre a linha', () => {
    montar([{ ...base, id: 'a', description: 'LOJA X', classificacao: { ...classificacao, categoryId: null } }])
    expect(screen.getByText('Escolher categoria')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Marcar LOJA X' })).toBeDisabled()
    fireEvent.click(botao('Escolher'))
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeInTheDocument()
  })
  it('transferência para a própria conta do lançamento não é palpite completo', () => {
    const paraSiMesma = { ...classificacao, nature: 'transfer' as const, categoryId: null, sugestaoContaId: 'itau' }
    montar([{ ...base, id: 'a', description: 'PIX EU MESMO', classificacao: paraSiMesma }])
    expect(screen.getByText('Escolher categoria')).toBeInTheDocument()
  })
})

describe('ListaConciliar — gravar', () => {
  it('a linha some no clique, antes de o servidor responder', async () => {
    let responder: (v: unknown) => void = () => {}
    aprovarDuplicata.mockReturnValue(new Promise((r) => { responder = r }))
    montar([{ ...base, id: 'a', description: 'Facebook', repetido: repetido('a') }, { ...base, id: 'b', description: 'NETFLIX', classificacao }])
    await act(async () => { fireEvent.click(botao('Descartar')) })
    expect(screen.queryByText('Facebook')).not.toBeInTheDocument()
    expect(aprovarDuplicata).toHaveBeenCalledWith('d-a')
    await act(async () => { responder({ efetivada: true }) })
    expect(screen.queryByText('Facebook')).not.toBeInTheDocument()
    expect(screen.getByText('NETFLIX')).toBeInTheDocument()
  })
  it('erro no servidor devolve a linha e avisa', async () => {
    aprovarDuplicata.mockRejectedValue(new Error('caiu'))
    montar([{ ...base, id: 'a', description: 'Facebook', repetido: repetido('a') }])
    await act(async () => { fireEvent.click(botao('Descartar')) })
    expect(screen.getByText('Facebook')).toBeInTheDocument()
    expect(screen.getByText('caiu')).toBeInTheDocument()
  })
  it('marcar todos e confirmar aplica o palpite de cada linha, na ordem', async () => {
    montar([
      { ...base, id: 'a', description: 'Facebook', repetido: repetido('a') },
      { ...base, id: 'b', description: 'Facebook', repetido: repetido('b') },
      { ...base, id: 'c', description: 'PIX JOAO', candidatas: [cand('p1')] },
    ])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar todos' }))
    await act(async () => { fireEvent.click(botao('Confirmar 3 marcados')) })
    expect(aprovarDuplicata.mock.calls).toEqual([['d-a'], ['d-b']])
    expect(vincularPrevisao).toHaveBeenCalledWith('c', 'p1')
    expect(aprovarDuplicata.mock.invocationCallOrder[1]).toBeLessThan(vincularPrevisao.mock.invocationCallOrder[0])
    expect(screen.getByText('Tudo conciliado')).toBeInTheDocument()
  })
  it('confirmar com regra resolve as outras linhas da contraparte', async () => {
    montar([
      { ...base, id: 'a', description: 'NETFLIX 1', classificacao },
      { ...base, id: 'b', description: 'NETFLIX 2', classificacao },
      { ...base, id: 'c', description: 'UBER', classificacao: { ...classificacao, counterpartyId: 'cp-2' } },
    ])
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' })[0]) })
    expect(confirmCounterparty).toHaveBeenCalledWith({ counterpartyId: 'cp-1', nature: 'expense', categoryId: 'cat-1', transferAccountId: null })
    expect(screen.queryByText('NETFLIX 2')).not.toBeInTheDocument()
    expect(screen.getByText('UBER')).toBeInTheDocument()
  })
  it('vinculou e o servidor não classificou: a linha volta pedindo a categoria', async () => {
    vincularPrevisao.mockResolvedValue({ efetivada: true, classificou: false })
    montar([{ ...base, id: 'a', description: 'PIX JOAO', candidatas: [cand('p1')], classificacao }])
    await act(async () => { fireEvent.click(botao('Vincular')) })
    expect(screen.getByText('PIX JOAO')).toBeInTheDocument()
    expect(botao('Confirmar')).toBeInTheDocument()
  })
  it('previsão vinculada some das candidatas das outras linhas', async () => {
    montar([
      { ...base, id: 'a', description: 'A', candidatas: [cand('p1')] },
      { ...base, id: 'b', description: 'B', candidatas: [cand('p1'), cand('p2')] },
    ])
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Vincular' })[0]) })
    expect(screen.getByText('É "Prev p2" de 10/09?')).toBeInTheDocument()
  })
})

describe('ListaConciliar — o detalhe', () => {
  it('clicar na linha abre a comparação; "São duas compras" recusa e a linha segue com a categoria', async () => {
    montar([{ ...base, id: 'a', description: 'UBER', repetido: repetido('a'), classificacao }])
    expect(screen.queryByText('Chegou duas vezes')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('UBER'))
    expect(screen.getByText('Chegou duas vezes')).toBeInTheDocument()
    expect(screen.getByText('A compra de 12/09 já estava aqui desde 19/09. Em 13/10 o banco mandou de novo.')).toBeInTheDocument()
    await act(async () => { fireEvent.click(botao(/São duas compras/)) })
    expect(recusarDuplicata).toHaveBeenCalledWith('d-a')
    expect(botao('Confirmar')).toBeInTheDocument()
  })
  it('"Lançar como novo" com candidatas marca sem vínculo antes de classificar', async () => {
    montar([{ ...base, id: 'a', description: 'NETFLIX', candidatas: [cand('p1')], classificacao }])
    fireEvent.click(screen.getByText('NETFLIX'))
    await act(async () => { fireEvent.click(botao(/Lançar como novo/)) })
    expect(marcarSemVinculo).toHaveBeenCalledWith('a')
    expect(marcarSemVinculo.mock.invocationCallOrder[0]).toBeLessThan(confirmCounterparty.mock.invocationCallOrder[0])
    expect(screen.getByText('Tudo conciliado')).toBeInTheDocument()
  })
  it('classificação recusada pelo servidor: a linha volta, sem as candidatas', async () => {
    classificarSoEste.mockResolvedValue({ error: 'Não deu' })
    montar([{ ...base, id: 'a', description: 'NETFLIX', candidatas: [cand('p1')], classificacao }])
    fireEvent.click(screen.getByText('NETFLIX'))
    fireEvent.click(screen.getByRole('checkbox', { name: /daqui pra frente/ }))
    await act(async () => { fireEvent.click(botao(/Lançar como novo/)) })
    expect(classificarSoEste).toHaveBeenCalled()
    expect(screen.getByText('NETFLIX')).toBeInTheDocument()
    expect(screen.getByText('Não deu')).toBeInTheDocument()
    expect(screen.getByText('Assinaturas')).toBeInTheDocument()
  })
})
