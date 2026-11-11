/**
 * Hook de chegada: valor inválido não grava; month grava o mês sem tocar as contas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let busca = ''
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(busca) }))

import { useGravarRecorteNaChegada } from '@/components/finance/filtros/use-gravar-recorte-na-chegada'
import { gravarRecorte, recorteDoNavegador } from '@/lib/finance/recorte'

describe('useGravarRecorteNaChegada', () => {
  beforeEach(() => { busca = ''; gravarRecorte({ startDate: '2026-01-01', endDate: '2026-01-31', accountIds: ['a1'] }) })

  it('URL só com valor inválido não grava nada', () => {
    busca = 'startDate=abc'
    renderHook(() => useGravarRecorteNaChegada(null))
    expect(recorteDoNavegador()).toMatchObject({ startDate: '2026-01-01', endDate: '2026-01-31', accountIds: ['a1'] })
  })

  it('?month grava o mês inteiro e deixa as contas do cookie', () => {
    busca = 'month=2026-10-01'
    renderHook(() => useGravarRecorteNaChegada(null))
    expect(recorteDoNavegador()).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-31', accountIds: ['a1'] })
  })

  it('?month igual ao do cookie (menu/redirect) não achata o período', () => {
    gravarRecorte({ startDate: '2026-01-01', endDate: '2026-12-31', accountIds: [] })
    busca = 'month=2026-12-01'
    renderHook(() => useGravarRecorteNaChegada(null))
    expect(recorteDoNavegador()).toMatchObject({ startDate: '2026-01-01', endDate: '2026-12-31' })
    busca = 'month=2026-10-01'
    renderHook(() => useGravarRecorteNaChegada(null))
    expect(recorteDoNavegador()).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-31' })
  })

  it('chegada com search (abrir um lançamento) não grava o recorte', () => {
    gravarRecorte({ startDate: '2026-10-01', endDate: '2026-10-31', accountIds: [] })
    busca = 'search=x&startDate=2026-09-05&endDate=2026-09-05&accountId=a'
    renderHook(() => useGravarRecorteNaChegada(null))
    expect(recorteDoNavegador()).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-31', accountIds: [] })
  })
})
