/**
 * Progresso até a independência financeira — a mesma conta no hub de
 * Planejamento e na Simulação.
 *
 * O hub mirava a renda desejada do plano; a simulação, que abre no modo
 * "Tenho um aporte mensal", mira a renda projetada do cenário base. Para o
 * mesmo plano o card dizia 100% e a simulação 23%. Agora o hub chama esta
 * função no modo em que a simulação abre, e a simulação no modo escolhido.
 */
import { calculateFI, calculateProjectedIncome, type FIResult } from '@floow/core-finance'

export interface ProgressoAteIFInput {
  mode: 'contribution' | 'income'
  portfolioCents: number
  monthlyContributionCents: number
  desiredMonthlyIncomeCents: number
  annualRealReturnRate: number
  currentAge: number
  retirementAge: number
}

export interface ProgressoAteIF {
  fi: FIResult
  /** 0–100, arredondado. */
  percent: number
}

export function progressoAteIF(input: ProgressoAteIFInput): ProgressoAteIF | null {
  const alvo =
    input.mode === 'income'
      ? input.desiredMonthlyIncomeCents
      : calculateProjectedIncome({
          currentPortfolioCents: input.portfolioCents,
          monthlyContributionCents: input.monthlyContributionCents,
          annualRealReturnRate: input.annualRealReturnRate,
          yearsToRetirement: Math.max(1, input.retirementAge - input.currentAge),
        })
  if (alvo <= 0) return null

  const fi = calculateFI({
    currentPortfolioCents: input.portfolioCents,
    monthlyContributionCents: input.monthlyContributionCents,
    targetMonthlyPassiveIncomeCents: alvo,
    annualRealReturnRate: input.annualRealReturnRate,
    currentAge: input.currentAge,
  })
  const percent = fi.fiNumberCents > 0 ? Math.min(100, Math.round((input.portfolioCents / fi.fiNumberCents) * 100)) : 0
  return { fi, percent }
}
