/**
 * RTL do CounterpartyQueueClient, focado na exceção por lançamento: o grupo
 * tem uma natureza/categoria padrão, mas um lançamento específico pode sair
 * dali com outra — sem virar regra da contraparte (ver
 * lib/openfinance/counterparty-actions.ts).
 *
 * `@/components/ui/select` é mockado (Radix + jsdom não combinam bem em
 * teste, mesmo racional de `__tests__/finance/dashboard.test.tsx` pros
 * componentes de recharts) por um `<select>` nativo com a mesma interface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/openfinance/counterparty-actions', () => ({
  confirmCounterparty: vi.fn(async () => ({ reclassified: 2 })),
}))

// vi.hoisted é necessário: a factory de vi.mock sobe para o topo do arquivo,
// antes de qualquer `const` — sem isso, `toastMock` ainda não existiria no
// momento em que a factory roda (mesmo racional de auth/session.test.ts).
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

vi.mock('@/components/ui/select', () => ({
  // Um <select> nativo sem <option value=""> correspondente ao value=''
  // "sem seleção" cai no default do próprio DOM: seleciona a primeira option
  // da lista e `.value` reporta o valor dela, não ''. A option vazia aqui
  // resolve isso — sem ela, ler `.value` pra provar "nenhuma conta escolhida
  // ainda" dava falso positivo (ver task-7 fix round 1).
  Select: ({ value, onValueChange, children }: any) =>
    React.createElement(
      'select',
      { value: value ?? '', onChange: (e: any) => onValueChange(e.target.value) },
      React.createElement('option', { value: '' }),
      children
    ),
  SelectTrigger: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectValue: ({ placeholder }: any) => React.createElement('span', null, placeholder),
  SelectContent: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectItem: ({ value, children }: any) => React.createElement('option', { value }, children),
}))

import { CounterpartyQueueClient } from '@/components/openfinance/counterparty-queue-client'
import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'

const PENDING = [
  {
    counterpartyId: 'cp-1',
    displayName: 'Pix enviado Maraisa Ramos',
    keyType: 'tax_id' as const,
    count: 2,
    totalCents: -9_075_000,
    ehCpfProprio: false,
    items: [
      { id: 'tx-normal', date: '2026-01-05', description: 'Pix enviado Maraisa Ramos', amountCents: -75_000, accountId: 'conta-origem', sugestaoContaId: null },
      { id: 'tx-outlier', date: '2026-01-29', description: 'Pix enviado Maraisa Ramos', amountCents: -9_000_000, accountId: 'conta-origem', sugestaoContaId: null },
    ],
  },
]

const CATEGORY_OPTIONS = [{ id: 'cat-expense', label: 'Aluguel', type: 'expense' as const }]
const ACCOUNT_OPTIONS = [
  { id: 'conta-destino', name: 'Poupança' },
  // A conta onde os próprios lançamentos estão. O seletor a oferece, e é daí
  // que vinha o erro de produção de 16/09/2026.
  { id: 'conta-origem', name: 'Itaú' },
]

beforeEach(() => {
  vi.mocked(confirmCounterparty).mockClear()
  toastMock.mockClear()
})

describe('CounterpartyQueueClient — exceção por lançamento', () => {
  it('confirma o grupo com padrão + uma exceção num lançamento específico', async () => {
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: PENDING,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )

    fireEvent.click(screen.getByText('ver lançamentos'))

    // padrão do grupo: despesa / aluguel
    fireEvent.click(screen.getByRole('button', { name: 'Despesa' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-expense' } })

    // o lançamento atípico foge do padrão: vira transferência pra uma conta própria
    const outlierRow = screen.getByTestId('item-tx-outlier')
    fireEvent.click(within(outlierRow).getByText('usar classificação diferente'))
    fireEvent.click(within(outlierRow).getByRole('button', { name: 'Transferência' }))
    fireEvent.change(within(outlierRow).getByRole('combobox'), { target: { value: 'conta-destino' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).toHaveBeenCalledTimes(1)
    expect(confirmCounterparty).toHaveBeenCalledWith({
      counterpartyId: 'cp-1',
      nature: 'expense',
      categoryId: 'cat-expense',
      transferAccountId: null,
      exceptions: [{ transactionId: 'tx-outlier', nature: 'transfer', categoryId: null, transferAccountId: 'conta-destino' }],
    })
  })
})

describe('CounterpartyQueueClient — sinal do valor', () => {
  it('débito mostra o total do grupo e o valor do lançamento com sinal negativo', () => {
    const debitPending = [
      {
        counterpartyId: 'cp-2',
        displayName: 'Pix enviado Fulano',
        keyType: 'tax_id' as const,
        count: 1,
        totalCents: -75_000,
        ehCpfProprio: false,
        items: [{ id: 'tx-debito', date: '2026-01-05', description: 'Pix enviado Fulano', amountCents: -75_000, accountId: 'conta-origem', sugestaoContaId: null }],
      },
    ]

    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: debitPending,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )

    // `getByText` já lança se não achar — a asserção é a própria query.
    screen.getByText('-R$ 750,00')

    fireEvent.click(screen.getByText('ver lançamentos'))
    const row = screen.getByTestId('item-tx-debito')
    within(row).getByText('-R$ 750,00')
  })
})

describe('CounterpartyQueueClient — transferência com conta de destino', () => {
  it('confirma o grupo como transferência com a conta escolhida', async () => {
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: PENDING,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transferência' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'conta-destino' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).toHaveBeenCalledWith({
      counterpartyId: 'cp-1',
      nature: 'transfer',
      categoryId: null,
      transferAccountId: 'conta-destino',
      exceptions: [],
    })
  })
})

describe('CounterpartyQueueClient — rótulo da conta segue a direção', () => {
  const ENTRADA = [
    {
      counterpartyId: 'cp-cdb',
      displayName: 'Resgate CDB',
      keyType: 'tax_id' as const,
      count: 1,
      totalCents: 100_000,
      ehCpfProprio: false,
      items: [{ id: 'tx-resgate', date: '2026-01-05', description: 'Resgate CDB', amountCents: 100_000, accountId: 'conta-origem', sugestaoContaId: null }],
    },
  ]

  function renderComPendentes(pending: typeof ENTRADA) {
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transferência' }))
  }

  it('entrada pede conta de ORIGEM — o dinheiro veio de lá', () => {
    // Resgate de CDB credita a conta corrente. A segunda perna debita a conta
    // escolhida (ver transfer-leg.ts), então ela é a origem. Chamar de
    // "destino" invertia o sentido para o usuário.
    renderComPendentes(ENTRADA)

    screen.getByText('Conta de origem')
  })

  it('saída pede conta de DESTINO — o dinheiro foi para lá', () => {
    renderComPendentes(PENDING as unknown as typeof ENTRADA)

    screen.getByText('Conta de destino')
  })
})

/**
 * O servidor recusa transferência cuja conta de destino é a própria conta do
 * lançamento (`applyTransferSingle`, counterparty-actions.ts:106) — e está
 * certo. O problema era a fila oferecer essa escolha e o lote inteiro morrer
 * com a mensagem crua da exceção depois de enviado. Em produção, 16/09/2026.
 */
describe('CounterpartyQueueClient — destino igual à conta do lançamento', () => {
  function renderFila() {
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: PENDING,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transferência' }))
  }

  const escolherConta = (id: string) =>
    fireEvent.change(screen.getByRole('combobox'), { target: { value: id } })

  const botaoConfirmar = () => screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement

  it('avisa na tela quando a conta escolhida é a dos lançamentos', () => {
    renderFila()
    escolherConta('conta-origem')

    screen.getByRole('alert')
    screen.getByText('Os 2 lançamentos desta contraparte estão no Itaú. Escolha outra conta de destino.')
  })

  it('desabilita o Confirmar enquanto o conflito existe', () => {
    renderFila()
    escolherConta('conta-origem')

    expect(botaoConfirmar().disabled).toBe(true)
  })

  it('escolhendo outra conta, o aviso sai e o Confirmar volta', () => {
    renderFila()
    escolherConta('conta-origem')
    escolherConta('conta-destino')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(botaoConfirmar().disabled).toBe(false)
  })

  it('nem tenta enviar o lote que o servidor recusaria', async () => {
    renderFila()
    escolherConta('conta-origem')

    await act(async () => {
      fireEvent.click(botaoConfirmar())
    })

    expect(confirmCounterparty).not.toHaveBeenCalled()
  })

  it('a exceção de um lançamento também é checada', () => {
    renderFila()
    escolherConta('conta-destino')
    fireEvent.click(screen.getByText('ver lançamentos'))

    const linha = screen.getByTestId('item-tx-outlier')
    fireEvent.click(within(linha).getByText('usar classificação diferente'))
    fireEvent.click(within(linha).getByRole('button', { name: 'Transferência' }))
    fireEvent.change(within(linha).getByRole('combobox'), { target: { value: 'conta-origem' } })

    screen.getByRole('alert')
    expect(botaoConfirmar().disabled).toBe(true)
  })
})

describe('CounterpartyQueueClient — natureza já decidida pelo banco', () => {
  it('grupo só de transferências abre com Transferência escolhida, pedindo a conta', async () => {
    const pending = [{
      counterpartyId: 'cp-aplic', displayName: 'APLICACAO CDB DI', keyType: 'description' as const,
      count: 1, totalCents: -100_000, ehCpfProprio: false,
      items: [{ id: 'tx-a', date: '2026-01-05', description: 'APLICACAO CDB DI', amountCents: -100_000, accountId: 'conta-origem', type: 'transfer' as const, sugestaoContaId: null }],
    }]
    render(React.createElement(CounterpartyQueueClient, {
      mode: 'page', pending, confirmed: [], categoryOptions: CATEGORY_OPTIONS, accountOptions: ACCOUNT_OPTIONS,
    }))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'conta-destino' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar' })) })

    expect(confirmCounterparty).toHaveBeenCalledWith(expect.objectContaining({
      counterpartyId: 'cp-aplic', nature: 'transfer', categoryId: null, transferAccountId: 'conta-destino',
    }))
  })
})

describe('CounterpartyQueueClient — CPF próprio', () => {
  const grupoBase = {
    counterpartyId: 'cp-titular',
    displayName: 'Fulano da Silva',
    keyType: 'tax_id' as const,
    count: 2,
    totalCents: -50_000,
    ehCpfProprio: true,
  }
  const itemBase = {
    date: '2026-01-05',
    description: 'Pix enviado Fulano da Silva',
    amountCents: -25_000,
    accountId: 'conta-origem',
  }

  it('sem conta de grupo, lançamentos abertos e sugestão pré-selecionada', async () => {
    const grupo = {
      ...grupoBase,
      items: [
        { ...itemBase, id: 'i1', type: 'transfer' as const, sugestaoContaId: 'nu' },
        { ...itemBase, id: 'i2', type: 'transfer' as const, sugestaoContaId: null },
      ],
    }
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: [grupo],
        confirmed: [],
        categoryOptions: [],
        accountOptions: [{ id: 'nu', name: 'NU' }, { id: 'itau', name: 'Itaú' }],
      })
    )

    // `getByText` já lança se não achar — a asserção é a própria query (mesmo
    // racional do teste de "sinal do valor" acima).
    screen.getByText(/Pix para você mesmo/)
    // Grupo de CPF próprio já nasce expandido — sem clicar em "ver lançamentos".
    // O mock de <Select> renderiza toda opção como <option> independente do
    // valor selecionado — checar `.value` do <select>, não o texto, é o que
    // de fato prova que a sugestão do par foi pré-selecionada (ou não).
    const selectDoItem = (testId: string) =>
      within(screen.getByTestId(testId)).getByRole('combobox') as HTMLSelectElement
    expect(selectDoItem('item-i1').value).toBe('nu')
    expect(selectDoItem('item-i2').value).toBe('')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith('Escolha a conta de cada lançamento.', 'error')
  })

  it('confirma quando cada lançamento tem conta escolhida — sem conta de grupo, só exceções', async () => {
    const grupo = {
      ...grupoBase,
      items: [
        { ...itemBase, id: 'i1', type: 'transfer' as const, sugestaoContaId: 'nu' },
        { ...itemBase, id: 'i2', type: 'transfer' as const, sugestaoContaId: null },
      ],
    }
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: [grupo],
        confirmed: [],
        categoryOptions: [],
        accountOptions: [{ id: 'nu', name: 'NU' }, { id: 'itau', name: 'Itaú' }],
      })
    )

    // i2 não veio com sugestão — o usuário escolhe a conta dele.
    fireEvent.change(within(screen.getByTestId('item-i2')).getByRole('combobox'), { target: { value: 'itau' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).toHaveBeenCalledWith({
      counterpartyId: 'cp-titular',
      nature: 'transfer',
      categoryId: null,
      transferAccountId: null,
      exceptions: [
        { transactionId: 'i1', nature: 'transfer', categoryId: null, transferAccountId: 'nu' },
        { transactionId: 'i2', nature: 'transfer', categoryId: null, transferAccountId: 'itau' },
      ],
    })
  })

  it('"usar padrão do grupo" limpa a exceção do lançamento e volta a bloquear o Confirmar', async () => {
    const grupo = {
      ...grupoBase,
      items: [
        { ...itemBase, id: 'i1', type: 'transfer' as const, sugestaoContaId: 'nu' },
        { ...itemBase, id: 'i2', type: 'transfer' as const, sugestaoContaId: 'itau' },
      ],
    }
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: [grupo],
        confirmed: [],
        categoryOptions: [],
        accountOptions: [{ id: 'nu', name: 'NU' }, { id: 'itau', name: 'Itaú' }],
      })
    )

    // Os dois lançamentos nasceram com sugestão — limpar a de um deles
    // (voltando ao "padrão do grupo", que não existe pra CPF próprio) deixa
    // esse lançamento sem conta de novo.
    fireEvent.click(within(screen.getByTestId('item-i2')).getByText('usar padrão do grupo'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith('Escolha a conta de cada lançamento.', 'error')
  })
})

describe('CounterpartyQueueClient — aviso de descrição genérica', () => {
  it('transferência por descrição mostra o aviso de alcance', () => {
    const grupo = {
      counterpartyId: 'cp-resgate',
      displayName: 'Resgate CDB DI',
      keyType: 'description' as const,
      count: 1,
      totalCents: 100_000,
      ehCpfProprio: false,
      items: [{
        id: 'tx-resgate-cdb', date: '2026-01-05', description: 'Resgate CDB DI',
        amountCents: 100_000, accountId: 'conta-origem', type: 'transfer' as const, sugestaoContaId: null,
      }],
    }
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: [grupo],
        confirmed: [],
        categoryOptions: [],
        accountOptions: [],
      })
    )

    screen.getByText('Vale para todo lançamento com o texto "Resgate CDB DI" nesta conta.')
  })
})
