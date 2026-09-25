import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { InputMoeda, formatarMoedaDigitada } from '@/components/ui/input-moeda'
import { currencyToCents } from '@floow/core-finance/src/balance'

/**
 * O campo de valor era texto livre: "150.75" virava R$ 15.075,00 e "abc"
 * seguia até o servidor. A máscara aceita só dígitos e monta o valor em
 * centavos, como no app do banco.
 */
describe('formatarMoedaDigitada', () => {
  it('monta o valor a partir dos centavos digitados', () => {
    expect(formatarMoedaDigitada('1')).toBe('0,01')
    expect(formatarMoedaDigitada('15075')).toBe('150,75')
    expect(formatarMoedaDigitada('123456789')).toBe('1.234.567,89')
  })

  it('ignora o que não é dígito', () => {
    expect(formatarMoedaDigitada('R$ 1.234,5a6')).toBe('1.234,56')
  })

  it('campo vazio continua vazio', () => {
    expect(formatarMoedaDigitada('')).toBe('')
    expect(formatarMoedaDigitada('abc')).toBe('')
  })

  it('o texto formatado volta aos mesmos centavos', () => {
    expect(currencyToCents(formatarMoedaDigitada('123456789'))).toBe(123456789)
  })
})

describe('InputMoeda', () => {
  it('formata enquanto digita e entrega o texto formatado', () => {
    const onChange = vi.fn()
    render(<InputMoeda aria-label="Valor" onChange={onChange} />)
    const campo = screen.getByLabelText('Valor') as HTMLInputElement

    fireEvent.change(campo, { target: { value: '15075' } })

    expect(campo.value).toBe('150,75')
    expect(onChange.mock.calls[0][0].target.value).toBe('150,75')
  })

  it('abre o teclado numérico no celular', () => {
    render(<InputMoeda aria-label="Valor" />)
    expect(screen.getByLabelText('Valor').getAttribute('inputmode')).toBe('numeric')
  })
})
