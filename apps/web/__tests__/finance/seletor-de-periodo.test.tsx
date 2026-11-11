import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SeletorDePeriodo } from '@/components/finance/filtros/seletor-de-periodo'

describe('SeletorDePeriodo', () => {
  it('modo mes: as setas devolvem o mês inteiro vizinho', () => {
    const aoMudar = vi.fn()
    render(<SeletorDePeriodo modo="mes" startDate="2026-10-01" endDate="2026-10-31" aoMudar={aoMudar} />)
    fireEvent.click(screen.getByLabelText('Próximo mês'))
    expect(aoMudar).toHaveBeenCalledWith({ startDate: '2026-11-01', endDate: '2026-11-30' }, null)
  })

  it('modo intervalo: atalho passa a chave', () => {
    const aoMudar = vi.fn()
    render(<SeletorDePeriodo modo="intervalo" startDate="" endDate="" aoMudar={aoMudar} />)
    fireEvent.click(screen.getByRole('button', { name: /Todo o período/ }))
    fireEvent.click(screen.getByRole('button', { name: /Últimos 3 meses/ }))
    expect(aoMudar).toHaveBeenCalledWith(expect.objectContaining({ startDate: expect.any(String) }), 'last3Months')
  })

  it('modo intervalo: × da data inicial limpa só ela', () => {
    const aoMudar = vi.fn()
    render(<SeletorDePeriodo modo="intervalo" startDate="2026-10-01" endDate="2026-10-31" aoMudar={aoMudar} />)
    fireEvent.click(screen.getByLabelText('Limpar data inicial'))
    expect(aoMudar).toHaveBeenCalledWith({ startDate: '', endDate: '2026-10-31' }, null)
  })
})
