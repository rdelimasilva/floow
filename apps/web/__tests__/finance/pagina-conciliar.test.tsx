import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * A tela Conciliar monta as três seções na ordem de decidir (repetidos →
 * classificar → confirmar). Se cada seção some quando vazia, isso é com ela
 * (ver secoes-de-conciliar.test.tsx). Aqui fica o que é da página: a ordem, o
 * `?regra=` chegando em Classificar e o "Tudo conciliado".
 */

const contarItensParaConciliar = vi.fn()
const getConfirmedCounterparties = vi.fn()

vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('@/lib/auth/session', () => ({ getVerifiedIdentity: async () => ({ userId: 'user-1' }) }))
vi.mock('@/lib/finance/itens-para-conciliar', () => ({ contarItensParaConciliar }))
vi.mock('@/lib/openfinance/counterparty-queries', () => ({ getConfirmedCounterparties }))
vi.mock('@/components/ajuda/link-de-ajuda', () => ({ LinkDeAjuda: () => null }))
vi.mock('@/components/finance/secoes-de-conciliar', async () => {
  const React = await import('react')
  const secao = (id: string) => (props: { regraAberta?: string }) =>
    React.createElement('section', { id, 'aria-label': id, 'data-regra': props.regraAberta ?? '' })
  return {
    SecaoRepetidos: secao('repetidos'),
    SecaoClassificar: secao('classificar'),
    SecaoConfirmar: secao('confirmar'),
  }
})

const { default: ConciliarPage } = await import('@/app/(app)/transactions/conciliar/page')

async function montar(params: { regra?: string } = {}) {
  render(await ConciliarPage({ searchParams: Promise.resolve(params) }))
}

const ZERADO = { repetidos: 0, classificar: 0, confirmar: 0, total: 0 }

beforeEach(() => {
  contarItensParaConciliar.mockReset().mockResolvedValue({ repetidos: 1, classificar: 2, confirmar: 3, total: 6 })
  getConfirmedCounterparties.mockReset().mockResolvedValue([])
})

describe('tela Conciliar', () => {
  it('monta as seções na ordem repetidos → classificar → confirmar', async () => {
    await montar()

    expect(screen.getAllByRole('region').map((s) => s.id)).toEqual(['repetidos', 'classificar', 'confirmar'])
    expect(screen.queryByText('Tudo conciliado')).toBeNull()
  })

  it('?regra= chega na seção Classificar', async () => {
    await montar({ regra: 'cp-1' })

    expect(screen.getByRole('region', { name: 'classificar' }).getAttribute('data-regra')).toBe('cp-1')
  })

  it('com tudo zerado e sem regras, diz "Tudo conciliado"', async () => {
    contarItensParaConciliar.mockResolvedValue(ZERADO)

    await montar()

    screen.getByText('Tudo conciliado')
  })

  it('com nada pendente mas com regras confirmadas, não diz "Tudo conciliado" e mantém Classificar', async () => {
    contarItensParaConciliar.mockResolvedValue(ZERADO)
    getConfirmedCounterparties.mockResolvedValue([{ id: 'cp-1' }])

    await montar()

    expect(screen.queryByText('Tudo conciliado')).toBeNull()
    screen.getByRole('region', { name: 'classificar' })
  })

  it('com pendências, nem consulta as regras (o "Tudo conciliado" já está descartado)', async () => {
    await montar()

    expect(getConfirmedCounterparties).not.toHaveBeenCalled()
  })

  it('se a busca das regras falhar, não afirma "Tudo conciliado"', async () => {
    contarItensParaConciliar.mockResolvedValue(ZERADO)
    getConfirmedCounterparties.mockRejectedValue(new Error('banco fora'))

    await montar()

    expect(screen.queryByText('Tudo conciliado')).toBeNull()
  })

  it('pergunta a contagem com a org e o usuário da sessão', async () => {
    await montar()

    expect(contarItensParaConciliar).toHaveBeenCalledWith('org-1', 'user-1')
  })
})
