import * as React from 'react'
import { Input, type InputProps } from './input'

const FORMATO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Máscara de valor em reais: só dígitos, lidos como centavos ("15075" →
 * "150,75"). Não sobra ambiguidade entre ponto e vírgula, e o resultado é o
 * formato que `currencyToCents` entende.
 */
export function formatarMoedaDigitada(texto: string): string {
  const digitos = texto.replace(/\D/g, '').replace(/^0+/, '')
  if (!digitos) return ''
  return FORMATO.format(Number(digitos) / 100)
}

/**
 * Campo de valor positivo em reais. Funciona controlado ou com o `register`
 * do react-hook-form: o texto já formatado vai em `event.target.value`.
 */
export const InputMoeda = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'inputMode'>>(
  ({ onChange, placeholder = '0,00', ...props }, ref) => (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      onChange={(e) => {
        e.target.value = formatarMoedaDigitada(e.target.value)
        onChange?.(e)
      }}
      {...props}
    />
  ),
)
InputMoeda.displayName = 'InputMoeda'
