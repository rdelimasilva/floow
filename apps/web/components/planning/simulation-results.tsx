'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBRL } from '@floow/core-finance/src/balance'
import { calculateFI, SCENARIO_PRESETS } from '@floow/core-finance/src/simulation'
import type { RetirementYearPoint } from '@floow/core-finance/src/simulation'

interface SimulationResultsProps {
  mode: 'contribution' | 'income'
  computedResult: { conservative: number; base: number; aggressive: number }
  projections: {
    conservative: RetirementYearPoint[]
    base: RetirementYearPoint[]
    aggressive: RetirementYearPoint[]
  } | null
  portfolioCents: number
  monthlyContributionCents: number
  desiredMonthlyIncomeCents: number
  currentAge: number
  retirementAge: number
  baseReturnRate?: number
}

export function SimulationResults({
  mode,
  computedResult,
  projections,
  portfolioCents,
  monthlyContributionCents,
  desiredMonthlyIncomeCents,
  currentAge,
  retirementAge,
  baseReturnRate,
}: SimulationResultsProps) {
  const baseRate = baseReturnRate ?? SCENARIO_PRESETS.base.annualRealReturnRate

  // FI calculation
  const fi = useMemo(() => {
    const targetIncome = mode === 'income' ? desiredMonthlyIncomeCents : computedResult.base
    if (targetIncome <= 0) return null
    return calculateFI({
      currentPortfolioCents: portfolioCents,
      monthlyContributionCents,
      targetMonthlyPassiveIncomeCents: targetIncome,
      annualRealReturnRate: baseRate,
      currentAge,
    })
  }, [mode, portfolioCents, monthlyContributionCents, desiredMonthlyIncomeCents, computedResult.base, baseRate, currentAge])

  const fiProgress = fi && fi.fiNumberCents > 0
    ? Math.min(100, Math.round((portfolioCents / fi.fiNumberCents) * 100))
    : 0

  // Depletion detection (base scenario)
  const depletionAge = useMemo(() => {
    if (!projections) return null
    const basePoints = projections.base
    for (let i = 1; i < basePoints.length; i++) {
      if (basePoints[i].portfolioCents <= 0 && basePoints[i].age > retirementAge) {
        return basePoints[i].age
      }
    }
    return null
  }, [projections, retirementAge])

  return (
    <div className="space-y-4">
      {/* Main result: 3 scenarios */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-700 mb-2">
            {mode === 'contribution' ? 'Renda passiva estimada na aposentadoria' : 'Aporte mensal necessario'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-red-600 font-medium">Conservador</p>
              <p className="text-xl font-bold text-gray-900">{formatBRL(computedResult.conservative)}/mes</p>
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium">Base</p>
              <p className="text-xl font-bold text-blue-900">{formatBRL(computedResult.base)}/mes</p>
            </div>
            <div>
              <p className="text-xs text-green-600 font-medium">Arrojado</p>
              <p className="text-xl font-bold text-gray-900">{formatBRL(computedResult.aggressive)}/mes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FI Progress + Depletion */}
      {fi && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Independência Financeira</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Número FI (cenário base)</span>
              <span className="font-medium">{formatBRL(fi.fiNumberCents)}</span>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{formatBRL(portfolioCents)}</span>
                <span>{fiProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${fiProgress}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Previsão</span>
              <span className="font-medium">
                {fi.fiYear != null
                  ? `${fi.fiYear} (${fi.yearsToFI} anos)`
                  : 'Não atingível em 60 anos'}
              </span>
            </div>

            {/* Depletion warning */}
            {depletionAge && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mt-2">
                <p className="text-sm text-red-700 font-medium">
                  Patrimônio se esgota aos {depletionAge} anos (cenário base)
                </p>
                <p className="text-xs text-red-600 mt-1">
                  Considere reduzir a retirada mensal ou aumentar os aportes.
                </p>
              </div>
            )}

            {!depletionAge && projections && (
              <p className="text-xs text-green-700">
                Patrimônio não se esgota no período projetado (cenário base).
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
