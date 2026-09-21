import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

/**
 * A conta marcada sobrevive à troca de menu, e pode ser mais de uma.
 *
 * Antes era um `select` de escolha única, e o estado morava só na URL: ir em
 * Dashboard e voltar em Transações voltava para "todas as contas". Quem
 * trabalha numa conta refazia o filtro a cada volta.
 *
 * Agora a escolha vai para o cookie `tx-accounts` a cada mudança — inclusive
 * quando esvazia, senão "todas as contas" seria impossível de pedir: o
 * servidor leria o cookie antigo e ressuscitaria a conta que o usuário acabou
 * de desmarcar.
 */

const replace = vi.fn()
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}))

const { TransactionFilters } = await import('@/components/finance/transaction-filters')

const CONTAS = [
  { id: 'acc-1', name: 'Itaú' },
  { id: 'acc-2', name: 'Nubank' },
  { id: 'acc-3', name: 'Corretora' },
]

const urlDoUltimoReplace = () => new URL(replace.mock.calls.at(-1)![0], 'http://x')
const contasNaUrl = () => urlDoUltimoReplace().searchParams.get('accountId')

const clicar = async (nome: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: nome }))
  })
}

const marcar = async (nome: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: nome }))
  })
}

beforeEach(() => {
  replace.mockClear()
  params = new URLSearchParams()
  document.cookie = 'tx-accounts=; path=/; max-age=0'
})

describe('filtro de contas', () => {
  it('fechado, anuncia quantas contas estão marcadas', () => {
    params = new URLSearchParams({ accountId: 'acc-1,acc-2' })
    render(<TransactionFilters accounts={CONTAS} />)

    expect(screen.getByRole('button', { name: /2 contas/ })).toBeTruthy()
  })

  it('sem nenhuma marcada, diz "Todas as contas"', () => {
    render(<TransactionFilters accounts={CONTAS} />)

    expect(screen.getByRole('button', { name: /Todas as contas/ })).toBeTruthy()
  })

  it('marca duas contas e as duas viajam na URL', async () => {
    render(<TransactionFilters accounts={CONTAS} />)

    await clicar(/Todas as contas/)
    await marcar('Itaú')
    await marcar('Nubank')

    expect(contasNaUrl()).toBe('acc-1,acc-2')
  })

  it('clicar na conta marcada desmarca só ela', async () => {
    params = new URLSearchParams({ accountId: 'acc-1,acc-2' })
    render(<TransactionFilters accounts={CONTAS} />)

    await clicar(/2 contas/)
    await marcar('Itaú')

    expect(contasNaUrl()).toBe('acc-2')
  })

  it('a escolha vai para o cookie, para atravessar a troca de menu', async () => {
    render(<TransactionFilters accounts={CONTAS} />)

    await clicar(/Todas as contas/)
    await marcar('Nubank')

    expect(document.cookie).toContain('tx-accounts=acc-2')
  })

  it('desmarcar tudo esvazia o cookie, senão o servidor ressuscita a conta', async () => {
    params = new URLSearchParams({ accountId: 'acc-2' })
    document.cookie = 'tx-accounts=acc-2; path=/'
    render(<TransactionFilters accounts={CONTAS} />)

    await clicar(/Nubank/)
    await marcar('Nubank')

    expect(contasNaUrl()).toBeNull()
    expect(document.cookie).not.toContain('tx-accounts=acc-2')
  })
})
