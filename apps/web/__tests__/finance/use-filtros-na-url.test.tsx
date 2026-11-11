import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const replace = vi.fn()
let busca = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(busca),
}))

import { useFiltrosNaUrl } from '@/components/finance/filtros/use-filtros-na-url'
import { lerRecorte } from '@/lib/finance/recorte'

const cookieRecorte = () => /(?:^|; )recorte=([^;]*)/.exec(document.cookie)?.[1]

describe('useFiltrosNaUrl', () => {
  beforeEach(() => {
    replace.mockClear()
    document.cookie = 'recorte=; path=/; max-age=0'
    busca = 'search=x&page=3&accountId=a'
  })

  it('valor vazio apaga a chave e tira page', () => {
    const { result } = renderHook(() => useFiltrosNaUrl('/transactions'))
    act(() => result.current.trocar({ search: '' }))
    expect(replace).toHaveBeenCalledWith('/transactions?accountId=a', { scroll: false })
  })

  it('grava o recorte novo no cookie', () => {
    const { result } = renderHook(() => useFiltrosNaUrl('/transactions'))
    act(() => result.current.trocar({ startDate: '2026-10-01' }))
    const r = lerRecorte({ recorte: cookieRecorte() })
    expect(r?.startDate).toBe('2026-10-01')
    expect(r?.accountIds).toEqual(['a'])
  })

  it('gravaRecorte: false não mexe no cookie', () => {
    const { result } = renderHook(() => useFiltrosNaUrl('/transactions', { gravaRecorte: false }))
    act(() => result.current.trocar({ startDate: '2026-10-01' }))
    expect(cookieRecorte()).toBeUndefined()
  })

  it('chama aoMudar com a URL nova', () => {
    const aoMudar = vi.fn()
    const { result } = renderHook(() => useFiltrosNaUrl('/transactions', { aoMudar }))
    act(() => result.current.trocar({ search: 'y' }))
    expect(aoMudar.mock.calls[0][0].get('search')).toBe('y')
  })

  it('desligar conta e período também fica lembrado', () => {
    busca = 'accountId=a&startDate=2026-10-01'
    const { result } = renderHook(() => useFiltrosNaUrl('/transactions'))
    act(() => result.current.trocar({ accountId: '' }))
    expect(lerRecorte({ recorte: cookieRecorte() })?.accountIds).toEqual([])
    busca = 'startDate=2026-10-01'
    const { result: r2 } = renderHook(() => useFiltrosNaUrl('/transactions'))
    act(() => r2.current.trocar({ startDate: '', endDate: '' }))
    const r = lerRecorte({ recorte: cookieRecorte() })
    expect(r?.startDate).toBe('')
    expect(r?.accountIds).toEqual([])
    expect(replace).toHaveBeenLastCalledWith('/transactions?', { scroll: false })
  })
})
