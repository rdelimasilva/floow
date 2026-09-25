import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSelecao } from '@/components/finance/use-selecao'

/**
 * Selecionar 20 lançamentos seguidos eram 20 cliques. Shift+clique marca o
 * intervalo desde o último clicado, como em qualquer lista de e-mails.
 */
const IDS = ['a', 'b', 'c', 'd', 'e']

describe('useSelecao', () => {
  it('clique simples alterna um item', () => {
    const { result } = renderHook(() => useSelecao(IDS))
    act(() => result.current.alternar('b', false))
    expect([...result.current.selecionados]).toEqual(['b'])
    act(() => result.current.alternar('b', false))
    expect(result.current.selecionados.size).toBe(0)
  })

  it('shift+clique marca o intervalo desde o último clicado', () => {
    const { result } = renderHook(() => useSelecao(IDS))
    act(() => result.current.alternar('b', false))
    act(() => result.current.alternar('e', true))
    expect([...result.current.selecionados].sort()).toEqual(['b', 'c', 'd', 'e'])
  })

  it('shift+clique para cima também funciona', () => {
    const { result } = renderHook(() => useSelecao(IDS))
    act(() => result.current.alternar('d', false))
    act(() => result.current.alternar('a', true))
    expect([...result.current.selecionados].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('"página toda" reflete só os itens desta página', () => {
    const { result } = renderHook(() => useSelecao(IDS))
    act(() => result.current.definir(['a', 'b', 'c', 'd', 'e', 'x', 'y']))
    expect(result.current.paginaToda).toBe(true)
    expect(result.current.selecionados.size).toBe(7)
  })
})
