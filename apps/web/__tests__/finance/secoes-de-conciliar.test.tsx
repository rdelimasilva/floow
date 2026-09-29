import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'

/**
 * Cada seção da tela Conciliar busca os próprios dados, some quando não há
 * nada para decidir e, se a busca falhar, vira um aviso sem derrubar as
 * outras duas. Classificar aparece também só com regras confirmadas: a lista
 * de regras mora nela.
 */

const getDuplicatasPendentes = vi.fn()
const getPropostasPendentes = vi.fn()
const getPendingCounterpartyGroups = vi.fn()
const getConfirmedCounterparties = vi.fn()

vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))
vi.mock('@/lib/finance/duplicata-queries', () => ({ getDuplicatasPendentes }))
vi.mock('@/lib/finance/forecast-match-queries', () => ({ getPropostasPendentes }))
vi.mock('@/lib/openfinance/counterparty-queries', () => ({ getPendingCounterpartyGroups, getConfirmedCounterparties }))
vi.mock('@/lib/finance/queries', () => ({ getCategories: async () => [], getAccounts: async () => [] }))
vi.mock('@/components/finance/duplicate-proposal-queue', async () => {
  const React = await import('react')
  return {
    DuplicateProposalQueue: ({ propostas }: { propostas: unknown[] }) =>
      React.createElement('div', { 'data-testid': 'fila-repetidos' }, `${propostas.length} propostas`),
  }
})
vi.mock('@/components/finance/match-proposal-queue', async () => {
  const React = await import('react')
  return {
    MatchProposalQueue: ({ propostas }: { propostas: unknown[] }) =>
      React.createElement('div', { 'data-testid': 'fila-confirmar' }, `${propostas.length} propostas`),
  }
})
vi.mock('@/components/openfinance/counterparty-queue-client', async () => {
  const React = await import('react')
  return {
    CounterpartyQueueClient: ({ regraAberta }: { regraAberta?: string }) =>
      React.createElement('div', { 'data-testid': 'fila-classificar', 'data-regra': regraAberta ?? '' }),
  }
})

const { SecaoRepetidos, SecaoClassificar, SecaoConfirmar } = await import('@/components/finance/secoes-de-conciliar')

function grupo(count: number) {
  return { counterpartyId: `cp-${count}`, displayName: 'Loja', keyType: 'tax_id', count, totalCents: -1000, items: [], ehCpfProprio: false }
}

async function montar(secao: Promise<React.ReactElement | null>) {
  const el = await secao
  if (el) render(el)
  return el
}

beforeEach(() => {
  getDuplicatasPendentes.mockReset().mockResolvedValue([])
  getPropostasPendentes.mockReset().mockResolvedValue([])
  getPendingCounterpartyGroups.mockReset().mockResolvedValue([])
  getConfirmedCounterparties.mockReset().mockResolvedValue([])
})

describe('seção Repetidos', () => {
  it('vazia não aparece', async () => {
    expect(await montar(SecaoRepetidos({ orgId: 'org-1' }))).toBeNull()
  })

  it('com propostas, mostra título com contador e âncora', async () => {
    getDuplicatasPendentes.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }])

    await montar(SecaoRepetidos({ orgId: 'org-1' }))

    const secao = screen.getByRole('region', { name: /Remover repetidos/ })
    expect(secao.id).toBe('repetidos')
    within(secao).getByText('2')
    within(secao).getByTestId('fila-repetidos')
  })

  it('falha na busca vira aviso na própria seção, sem lançar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getDuplicatasPendentes.mockRejectedValue(new Error('db indisponível'))

    await montar(SecaoRepetidos({ orgId: 'org-1' }))

    const secao = screen.getByRole('region', { name: /Remover repetidos/ })
    within(secao).getByRole('alert')
  })
})

describe('seção Confirmar', () => {
  it('vazia não aparece', async () => {
    expect(await montar(SecaoConfirmar({ orgId: 'org-1' }))).toBeNull()
  })

  it('com propostas, aparece com âncora #confirmar', async () => {
    getPropostasPendentes.mockResolvedValue([{ id: 'p1' }])

    await montar(SecaoConfirmar({ orgId: 'org-1' }))

    expect(screen.getByRole('region', { name: /Confirmar previsões/ }).id).toBe('confirmar')
  })
})

describe('seção Classificar', () => {
  it('sem pendência e sem regra não aparece', async () => {
    expect(await montar(SecaoClassificar({ orgId: 'org-1' }))).toBeNull()
  })

  it('conta lançamentos, não contrapartes', async () => {
    getPendingCounterpartyGroups.mockResolvedValue([grupo(3), grupo(2)])

    await montar(SecaoClassificar({ orgId: 'org-1' }))

    within(screen.getByRole('region', { name: /Classificar lançamentos/ })).getByText('5')
  })

  it('só com regras confirmadas, aparece e abre a regra pedida', async () => {
    getConfirmedCounterparties.mockResolvedValue([{ id: 'cp-9' }])

    await montar(SecaoClassificar({ orgId: 'org-1', regraAberta: 'cp-9' }))

    const secao = screen.getByRole('region', { name: /Classificar lançamentos/ })
    expect(secao.id).toBe('classificar')
    expect(within(secao).getByTestId('fila-classificar').getAttribute('data-regra')).toBe('cp-9')
  })

  it('falha na busca vira aviso, sem lançar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getPendingCounterpartyGroups.mockRejectedValue(new Error('db indisponível'))

    await montar(SecaoClassificar({ orgId: 'org-1' }))

    within(screen.getByRole('region', { name: /Classificar lançamentos/ })).getByRole('alert')
  })
})
