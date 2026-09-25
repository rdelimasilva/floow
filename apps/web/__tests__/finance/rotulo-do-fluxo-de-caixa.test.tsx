import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { affectsCashFlowState, nextAffectsCashFlow } from '@/lib/finance/affects-cash-flow-cycle'

/**
 * O botão diz a resposta, não o mecanismo.
 *
 * O rótulo era "herda" / "fora" / "dentro". "Herda" é o estado de 99% dos
 * lançamentos e não dizia nada sobre o que acontece com aquela linha — para
 * entender era preciso saber que existe uma chave na categoria e que a linha
 * segue essa chave quando está vazia. Quem lê a lista quer saber uma coisa:
 * este lançamento entra no fluxo de caixa?
 *
 * Agora o rótulo é a resposta — "no fluxo" ou "fora do fluxo" — e o ponto
 * marca que a decisão foi tomada nesta linha, não herdada da categoria. Os
 * três estados continuam existindo embaixo, porque "vazio" e "marcado no
 * mesmo valor" são coisas diferentes: no vazio, mudar a categoria arrasta o
 * lançamento junto.
 *
 * O ciclo também mudou: o primeiro clique passa a inverter a resposta que
 * está na tela. Antes ele ia sempre para "fora", então numa categoria que já
 * não contava o clique não mudava nada visível além de aparecer um ponto.
 */

describe('rótulo do fluxo de caixa', () => {
  it('herdando de categoria que conta, diz "no fluxo" e sem ponto', () => {
    const estado = affectsCashFlowState(null, true)

    expect(estado.label).toBe('no fluxo')
    expect(estado.excecao).toBe(false)
  })

  it('herdando de categoria que não conta, diz "fora do fluxo" e sem ponto', () => {
    const estado = affectsCashFlowState(null, false)

    expect(estado.label).toBe('fora do fluxo')
    expect(estado.excecao).toBe(false)
  })

  it('sem categoria, o padrão é contar', () => {
    expect(affectsCashFlowState(null, null).label).toBe('no fluxo')
  })

  it('marcado na mão, o rótulo é a marca e ganha o ponto', () => {
    expect(affectsCashFlowState(false, true)).toMatchObject({ label: 'fora do fluxo', excecao: true })
    expect(affectsCashFlowState(true, false)).toMatchObject({ label: 'no fluxo', excecao: true })
  })

  it('marcado igual ao que a categoria diz ainda é exceção', () => {
    // Não é redundância: a linha marcada para de acompanhar a categoria.
    expect(affectsCashFlowState(true, true).excecao).toBe(true)
  })

  it('o título nomeia de onde vem a decisão', () => {
    expect(affectsCashFlowState(null, true).title).toContain('categoria')
    expect(affectsCashFlowState(false, true).title).toContain('só deste lançamento')
  })
})

describe('ciclo do botão', () => {
  it('o primeiro clique inverte o que está na tela', () => {
    expect(nextAffectsCashFlow(null, true)).toBe(false)
    expect(nextAffectsCashFlow(null, false)).toBe(true)
  })

  it('o segundo clique vai para a outra marca explícita', () => {
    expect(nextAffectsCashFlow(false, true)).toBe(true)
    expect(nextAffectsCashFlow(true, false)).toBe(false)
  })

  it('o terceiro volta a herdar da categoria', () => {
    expect(nextAffectsCashFlow(true, true)).toBeNull()
    expect(nextAffectsCashFlow(false, false)).toBeNull()
  })

  it('sem categoria, o ciclo se comporta como categoria que conta', () => {
    expect(nextAffectsCashFlow(null, null)).toBe(false)
  })
})

const { TransactionDesktopRow } = await import('@/components/finance/transaction-display-row')

const ACOES = {
  onToggleSelect: vi.fn(), onUnreconcile: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onIgnore: vi.fn(),
  onToggleCashFlow: vi.fn(), onCancelRecurring: vi.fn(), onCreateRule: vi.fn(),
} as never

const BASE = {
  id: 'tx-1',
  type: 'expense' as const,
  amountCents: -18000,
  description: 'Mercado',
  date: '2026-09-21',
  accountId: 'conta-1',
  categoryId: 'cat-1',
  categoryName: 'Mercado',
  categoryColor: null,
  categoryIcon: null,
  balanceApplied: true,
}

function renderRow(extra: Record<string, unknown>) {
  render(
    React.createElement('table', null,
      React.createElement('tbody', null,
        React.createElement(TransactionDesktopRow, {
          tx: { ...BASE, ...extra } as never,
          balance: 0, isSelected: false, loading: false, actions: ACOES,
        }))))
}

describe('a linha mostra a resposta', () => {
  it('categoria que conta, sem exceção: "no fluxo"', () => {
    renderRow({ categoryAffectsCashFlow: true, affectsCashFlow: null })

    screen.getByRole('button', { name: /no fluxo/ })
  })

  it('categoria que não conta, sem exceção: "fora do fluxo"', () => {
    renderRow({ categoryAffectsCashFlow: false, affectsCashFlow: null })

    screen.getByRole('button', { name: /fora do fluxo/ })
  })

  it('exceção da linha vence a categoria', () => {
    renderRow({ categoryAffectsCashFlow: true, affectsCashFlow: false })

    screen.getByRole('button', { name: /fora do fluxo/ })
  })
})
