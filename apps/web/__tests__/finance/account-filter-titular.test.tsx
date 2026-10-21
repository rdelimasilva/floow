import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AccountFilter, contasPorTitular } from '@/components/finance/account-filter'

const CONTAS = [
  { id: 'itau-r', name: 'Itaú', titular: 'Rodrigo' },
  { id: 'nu-a', name: 'Nubank', titular: 'Ana' },
  { id: 'card-r', name: 'Cartão', titular: 'Rodrigo' },
  { id: 'cash', name: 'Carteira', titular: null },
]

describe('contasPorTitular', () => {
  it('agrupa as contas por pessoa, em ordem de nome', () => {
    expect(contasPorTitular(CONTAS)).toEqual([
      ['Ana', ['nu-a']],
      ['Rodrigo', ['itau-r', 'card-r']],
    ])
  })

  it('com uma pessoa só não há atalho', () => {
    expect(contasPorTitular([CONTAS[0], CONTAS[2], CONTAS[3]])).toEqual([])
  })
})

describe('AccountFilter com titulares', () => {
  it('clicar na pessoa marca só as contas dela', () => {
    const onChange = vi.fn()
    render(<AccountFilter accounts={CONTAS} selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /todas as contas/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Rodrigo' }))
    expect(onChange).toHaveBeenCalledWith(['itau-r', 'card-r'])
  })

  it('com as contas de uma pessoa marcadas, o botão mostra o nome dela', () => {
    render(<AccountFilter accounts={CONTAS} selected={['card-r', 'itau-r']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Rodrigo/ })).toBeDefined()
  })
})
