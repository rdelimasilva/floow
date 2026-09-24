/**
 * RTL do RegrasConfirmadas: editor de regra já confirmada, com prévia do que
 * muda quando o histórico é marcado (spec 2026-09-24-corrigir-regra-contraparte).
 *
 * `@/components/ui/select` é mockado por um `<select>` nativo, mesma
 * convenção de counterparty-queue-client.test.tsx — Radix + jsdom não
 * combinam bem em teste.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { vi, it, expect, beforeEach, describe } from 'vitest'

const corrigir = vi.fn(async (..._args: any[]) => ({ reprocessados: 11, ignorados: 0 }))
const previa = vi.fn(async (..._args: any[]): Promise<any> => ({ mudam: 11, foraPorParDoOutroLado: [], deltas: { xp: 6446627, corretora: -6446627 }, naContaNova: 0 }))
vi.mock('@/lib/openfinance/corrigir-regra-actions', () => ({
  corrigirRegra: (...a: any[]) => corrigir(...a),
  previaCorrecaoDeRegra: (...a: any[]) => previa(...a),
}))

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: toastMock }) }))

// Mesmo mock de counterparty-queue-client.test.tsx: <select> nativo com uma
// <option value=""> vazia, pra `.value` reportar '' quando nada foi escolhido
// ainda (sem ela, o DOM cai no default e seleciona a primeira option real).
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) =>
    React.createElement(
      'select',
      { value: value ?? '', onChange: (e: any) => onValueChange(e.target.value) },
      React.createElement('option', { value: '' }),
      children,
    ),
  SelectTrigger: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectValue: ({ placeholder }: any) => React.createElement('span', null, placeholder),
  SelectContent: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectItem: ({ value, children }: any) => React.createElement('option', { value }, children),
}))

import { RegrasConfirmadas } from '@/components/openfinance/regras-confirmadas'

const regra = {
  id: 'r1',
  displayName: 'Resgate CDB DI',
  nature: 'transfer' as const,
  categoryId: null,
  transferAccountId: 'xp',
  transferAccountName: 'XP Corretora',
  confirmedAt: '2026-09-08T19:18:09Z',
  keyType: 'description' as const,
  direction: 'in' as const,
  ehCpfProprio: false,
  // Regra por descrição: vale nos lançamentos do extrato do Itaú.
  accountId: 'itau',
}
const contas = [
  { id: 'xp', name: 'XP Corretora' },
  { id: 'corretora', name: 'Itaú - Corretora' },
  { id: 'itau', name: 'Itaú' },
]

beforeEach(() => {
  corrigir.mockClear()
  previa.mockClear()
  refresh.mockClear()
  toastMock.mockClear()
})

describe('RegrasConfirmadas', () => {
  it('abre direto pela ?regra= e mostra a prévia quando marca o histórico', async () => {
    render(
      React.createElement(RegrasConfirmadas, {
        confirmed: [regra],
        categoryOptions: [],
        accountOptions: contas,
        regraAberta: 'r1',
      }),
    )

    // Combobox mockado como <select> nativo: trocar a conta de destino via change.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'corretora' } })
    fireEvent.click(screen.getByLabelText('Aplicar também aos lançamentos já classificados'))

    expect(await screen.findByText(/11 lançamentos mudam/)).toBeTruthy()
    expect(screen.getByText(/XP Corretora \+R\$\s64\.466,27/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }))

    await vi.waitFor(() => {
      expect(corrigir).toHaveBeenCalledWith({
        counterpartyId: 'r1',
        nature: 'transfer',
        categoryId: null,
        transferAccountId: 'corretora',
        aplicarAoHistorico: true,
      })
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('mudar a decisão depois da prévia dispara nova prévia para a nova decisão', async () => {
    render(
      React.createElement(RegrasConfirmadas, {
        confirmed: [regra],
        categoryOptions: [],
        accountOptions: contas,
        regraAberta: 'r1',
      }),
    )

    fireEvent.click(screen.getByLabelText('Aplicar também aos lançamentos já classificados'))
    await screen.findByText(/11 lançamentos mudam/)
    expect(previa).toHaveBeenCalledWith({ counterpartyId: 'r1', nature: 'transfer', categoryId: null, transferAccountId: 'xp' })

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'corretora' } })

    await vi.waitFor(() => {
      expect(previa).toHaveBeenLastCalledWith({
        counterpartyId: 'r1',
        nature: 'transfer',
        categoryId: null,
        transferAccountId: 'corretora',
      })
    })
    expect(previa).toHaveBeenCalledTimes(2)
  })

  it('?regra= desconhecida: lista fechada, sem erro', () => {
    render(
      React.createElement(RegrasConfirmadas, {
        confirmed: [regra],
        categoryOptions: [],
        accountOptions: contas,
        regraAberta: 'nao-existe',
      }),
    )

    expect(screen.queryByRole('button', { name: 'Salvar correção' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Corrigir' })).toBeTruthy()
  })

  it('mudar a natureza sem escolher categoria mantém Salvar desabilitado (histórico desmarcado)', () => {
    render(
      React.createElement(RegrasConfirmadas, {
        confirmed: [regra],
        categoryOptions: [],
        accountOptions: contas,
        regraAberta: 'r1',
      }),
    )

    // direção 'in': só Receita e Transferência aparecem (ver naturezas no componente).
    fireEvent.click(screen.getByRole('button', { name: 'Receita' }))

    const botao = screen.getByRole('button', { name: 'Salvar correção' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(corrigir).not.toHaveBeenCalled()
  })

  it('trocar a decisão depois da prévia limpa a prévia antiga na hora, antes de a nova resolver', async () => {
    let resolverSegunda!: (v: unknown) => void
    const segundaPrevia: Promise<any> = new Promise((resolve) => {
      resolverSegunda = resolve
    })
    previa.mockImplementationOnce(async () => ({ mudam: 11, foraPorParDoOutroLado: [], deltas: { xp: 6446627, corretora: -6446627 } }))
    previa.mockImplementationOnce(() => segundaPrevia)

    render(
      React.createElement(RegrasConfirmadas, {
        confirmed: [regra],
        categoryOptions: [],
        accountOptions: contas,
        regraAberta: 'r1',
      }),
    )

    fireEvent.click(screen.getByLabelText('Aplicar também aos lançamentos já classificados'))
    await screen.findByText(/11 lançamentos mudam/)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'corretora' } })

    // A prévia antiga some na mesma atualização que troca a conta — não fica
    // visível até a segunda chamada (ainda pendente) resolver.
    expect(screen.queryByText(/11 lançamentos mudam/)).toBeNull()
    const botao = screen.getByRole('button', { name: 'Salvar correção' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)

    await act(async () => {
      resolverSegunda({ mudam: 5, foraPorParDoOutroLado: [], deltas: {} })
    })

    expect(await screen.findByText(/5 lançamentos mudam/)).toBeTruthy()
    expect(botao.disabled).toBe(false)
  })

  it('regra do CPF próprio não pede conta', () => {
    render(
      React.createElement(RegrasConfirmadas, {
        confirmed: [{ ...regra, keyType: 'tax_id', ehCpfProprio: true }],
        categoryOptions: [],
        accountOptions: contas,
        regraAberta: 'r1',
      }),
    )

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/voltam para Classificar/)).toBeTruthy()
  })

  it('destino = conta onde a regra vale: avisa e não deixa salvar (achado 4)', () => {
    render(React.createElement(RegrasConfirmadas, { confirmed: [regra], categoryOptions: [], accountOptions: contas, regraAberta: 'r1' }))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'itau' } })

    expect(screen.getByText(/Esta regra vale para os lançamentos da própria conta escolhida/)).toBeTruthy()
    const botao = screen.getByRole('button', { name: 'Salvar correção' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
  })

  it('prévia com lançamentos na conta nova: avisa e não deixa salvar (achado 4)', async () => {
    previa.mockImplementationOnce(async () => ({ mudam: 3, foraPorParDoOutroLado: [], deltas: {}, naContaNova: 2 }))
    render(React.createElement(RegrasConfirmadas, { confirmed: [{ ...regra, accountId: null }], categoryOptions: [], accountOptions: contas, regraAberta: 'r1' }))

    fireEvent.click(screen.getByLabelText('Aplicar também aos lançamentos já classificados'))

    expect(await screen.findByText(/2 lançamentos desta regra estão na própria conta escolhida/)).toBeTruthy()
    const botao = screen.getByRole('button', { name: 'Salvar correção' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
  })

  it('CPF próprio confirmado errado como Transferência pode virar Receita (achado 6)', async () => {
    render(
      React.createElement(RegrasConfirmadas, {
        confirmed: [{ ...regra, keyType: 'tax_id', ehCpfProprio: true, accountId: null }],
        categoryOptions: [{ id: 'cat-rec', label: 'Reembolso', type: 'income' }],
        accountOptions: contas,
        regraAberta: 'r1',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Receita' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-rec' } })
    expect(screen.queryByText(/voltam para Classificar/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }))

    await vi.waitFor(() => {
      expect(corrigir).toHaveBeenCalledWith({
        counterpartyId: 'r1',
        nature: 'income',
        categoryId: 'cat-rec',
        transferAccountId: null,
        aplicarAoHistorico: false,
      })
    })
  })

  it('CPF próprio em Transferência continua sem seletor de conta (achado 6)', () => {
    render(
      React.createElement(RegrasConfirmadas, {
        confirmed: [{ ...regra, keyType: 'tax_id', ehCpfProprio: true, accountId: null }],
        categoryOptions: [],
        accountOptions: contas,
        regraAberta: 'r1',
      }),
    )

    expect(screen.getByRole('button', { name: 'Transferência' })).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
