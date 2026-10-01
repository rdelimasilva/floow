/**
 * RTL da fila em modo foco (spec 2026-10-01 §2): um card por vez, atalhos
 * de teclado e a ordem repetido → vínculo → classificação no mesmo card.
 *
 * As actions vêm de `vi.hoisted`: a factory de `vi.mock` sobe para o topo do
 * arquivo, antes de qualquer `const`, e o import de `FilaFoco` a dispara.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'
import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'

const { vincularPrevisao, marcarSemVinculo, classificarSoEste, confirmCounterparty, aprovarDuplicata, recusarDuplicata } = vi.hoisted(() => ({
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { FilaFoco, type CategoryOption } from '@/components/finance/conciliar/fila-foco'

const conta = { id: 'itau', nome: 'Conta Itaú', tipo: 'checking', instituicao: 'Itaú', agencia: '0123', numero: '45219' }
const base = { date: '2026-09-12', amountCents: -150000, cardLastDigits: null, importedAt: '2026-09-13T10:00:00Z', conta, repetido: null, classificacao: null, candidatas: [] }
const cand = (id: string, extra = {}) => ({ id, accountId: 'itau', contaNome: 'Conta Itaú', date: '2026-09-10', amountCents: -150000, description: `Prev ${id}`, categoriaNome: 'Aluguel', diasDeDiferenca: 2, diferencaCents: 0, outraConta: false, propostaId: null, ...extra })
const classificacao = { counterpartyId: 'cp-1', displayName: 'NETFLIX.COM', nature: 'expense' as const, categoryId: 'cat-1', suggestionSource: 'historico' as const, sugestaoContaId: null, ehCpfProprio: false, outrosNaFila: 2 }
const opts = { categoryOptions: [{ id: 'cat-1', label: 'Assinaturas', type: 'expense' }] as CategoryOption[], accountOptions: [{ id: 'itau', name: 'Conta Itaú' }, { id: 'nu', name: 'Nubank' }] }

function montar(itens: unknown[], total = itens.length) {
  return render(<ToastProvider><FilaFoco itens={itens as ItemDaFila[]} total={total} {...opts} /></ToastProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vincularPrevisao.mockResolvedValue({ efetivada: true })
  marcarSemVinculo.mockResolvedValue({ ok: true })
  classificarSoEste.mockResolvedValue({ ok: true })
  confirmCounterparty.mockResolvedValue({ reclassified: 3 })
  aprovarDuplicata.mockResolvedValue({ efetivada: true })
  recusarDuplicata.mockResolvedValue({ recusada: true })
})

describe('FilaFoco', () => {
  it('mostra a conta em destaque e o progresso', () => {
    montar([{ ...base, id: 'a', description: 'PIX JOAO', candidatas: [cand('p1')] }], 27)
    expect(screen.getByText(/Itaú · Conta corrente/)).toBeInTheDocument()
    expect(screen.getByText(/••••5219/)).toBeInTheDocument()
    expect(screen.getByText('1 de 27')).toBeInTheDocument()
  })
  it('Enter vincula a melhor candidata; 2 vincula a segunda', async () => {
    montar([{ ...base, id: 'a', description: 'A', candidatas: [cand('p1'), cand('p2')] }, { ...base, id: 'b', description: 'B', candidatas: [cand('p3'), cand('p4')] }])
    await act(async () => { fireEvent.keyDown(document, { key: 'Enter' }) })
    expect(vincularPrevisao).toHaveBeenCalledWith('a', 'p1')
    await act(async () => { fireEvent.keyDown(document, { key: '2' }) })
    expect(vincularPrevisao).toHaveBeenCalledWith('b', 'p4')
  })
  it('"Não é nenhum" grava e passa para a classificação já preenchida', async () => {
    montar([{ ...base, id: 'a', description: 'NETFLIX', candidatas: [cand('p1')], classificacao }])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Não é nenhum/ })) })
    expect(marcarSemVinculo).toHaveBeenCalledWith('a')
    expect(screen.getByRole('checkbox', { name: /daqui pra frente/ })).toBeChecked()
    expect(screen.getByText('+2 na fila')).toBeInTheDocument()
  })
  it('confirmar com regra chama confirmCounterparty; sem regra, classificarSoEste', async () => {
    montar([{ ...base, id: 'a', description: 'X', classificacao }, { ...base, id: 'b', description: 'Y', classificacao: { ...classificacao, counterpartyId: 'cp-2' } }])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(confirmCounterparty).toHaveBeenCalledWith({ counterpartyId: 'cp-1', nature: 'expense', categoryId: 'cat-1', transferAccountId: null })
    fireEvent.click(screen.getByRole('checkbox', { name: /daqui pra frente/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(classificarSoEste).toHaveBeenCalledWith({ transactionId: 'b', counterpartyId: 'cp-2', nature: 'expense', categoryId: 'cat-1', transferAccountId: null })
  })
  it('atalho não dispara com foco num campo ou botão (Review Focus 5)', async () => {
    montar([{ ...base, id: 'a', description: 'X', classificacao }])
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(confirmCounterparty).not.toHaveBeenCalled()
  })
  it('transferência sugerida para a própria conta do lançamento não confirma', async () => {
    const paraSiMesma = { ...classificacao, nature: 'transfer' as const, categoryId: null, sugestaoContaId: 'itau' }
    montar([{ ...base, id: 'a', description: 'PIX EU MESMO', classificacao: paraSiMesma }])
    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeDisabled()
    await act(async () => { fireEvent.keyDown(document, { key: 'Enter' }) })
    expect(confirmCounterparty).not.toHaveBeenCalled()
    expect(classificarSoEste).not.toHaveBeenCalled()
  })
  it('previsão de outra conta aparece com aviso', () => {
    montar([{ ...base, id: 'a', description: 'X', candidatas: [cand('p1', { outraConta: true, contaNome: 'Nubank' })] }])
    expect(screen.getByText('outra conta')).toBeInTheDocument()
  })
  it('repetido: descartar chama aprovarDuplicata; "não é repetido" segue no mesmo lançamento', async () => {
    const repetido = { propostaId: 'd-1', outro: { id: 'm', date: '2026-09-12', description: 'UBER', amountCents: -2340 }, horasEntreEmissoes: 3 }
    montar([{ ...base, id: 'a', description: 'UBER', repetido, classificacao }])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Não é repetido/ })) })
    expect(recusarDuplicata).toHaveBeenCalledWith('d-1')
    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeInTheDocument()
  })
  it('pular manda para o fim; acabou → Tudo conciliado', async () => {
    montar([{ ...base, id: 'a', description: 'PRIMEIRO', classificacao }])
    fireEvent.click(screen.getByRole('button', { name: /Pular/ }))
    expect(screen.getByText(/1 pulado/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Revisar agora/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(screen.getByText('Tudo conciliado')).toBeInTheDocument()
  })
})
