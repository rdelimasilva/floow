import { describe, it, expect } from 'vitest'
import { calculateProjectedIncome } from '@floow/core-finance'
import { progressoAteIF } from '@/lib/planning/progresso-ate-if'

/**
 * O card "Progresso até a IF" do hub e a simulação mostravam números
 * diferentes para o mesmo plano (100% contra 23%): o hub mirava a renda
 * desejada, a simulação — que abre no modo "Tenho um aporte mensal" — mirava
 * a renda projetada. Uma conta só, usada pelos dois.
 */
const PLANO = {
  portfolioCents: 50_000_000,
  monthlyContributionCents: 100_000,
  desiredMonthlyIncomeCents: 267_771,
  annualRealReturnRate: 0.07,
  currentAge: 41,
  retirementAge: 60,
}

describe('progressoAteIF', () => {
  it('no modo aporte mira a renda projetada do cenário base', () => {
    const projetada = calculateProjectedIncome({
      currentPortfolioCents: PLANO.portfolioCents,
      monthlyContributionCents: PLANO.monthlyContributionCents,
      annualRealReturnRate: 0.07,
      yearsToRetirement: 19,
    })
    const r = progressoAteIF({ ...PLANO, mode: 'contribution' })
    expect(r?.fi.fiNumberCents).toBe(Math.round((projetada * 12) / 0.07))
    expect(r?.percent).toBe(Math.round((PLANO.portfolioCents / r!.fi.fiNumberCents) * 100))
    expect(r!.percent).toBeLessThan(100)
  })

  it('no modo renda mira a renda desejada e trava em 100%', () => {
    const r = progressoAteIF({ ...PLANO, mode: 'income' })
    expect(r?.fi.fiNumberCents).toBe(Math.round((267_771 * 12) / 0.07))
    expect(r?.percent).toBe(100)
  })

  it('sem renda alvo não há progresso', () => {
    expect(progressoAteIF({ ...PLANO, desiredMonthlyIncomeCents: 0, mode: 'income' })).toBeNull()
  })
})
