'use client'

import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { calculateFI, SCENARIO_PRESETS } from '@floow/core-finance/src/simulation'
import { formatBRL } from '@floow/core-finance/src/balance'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RetirementPlan } from '@floow/db'

// ── Local schema ───────────────────────────────────────────────────────────────

const fiFormSchema = z.object({
  targetMonthlyPassiveIncomeCents: z.number().int().min(0),
  currentPortfolioCents: z.number().int().min(0),
  monthlyContributionCents: z.number().int().min(0),
  annualRealReturnRate: z.number().min(0).max(0.5),
  currentAge: z.number().int().min(18).max(100),
})

type FIFormData = z.infer<typeof fiFormSchema>

interface FICalculatorFormProps {
  defaultValues: RetirementPlan | null
  currentPortfolioCents: number
  currentPassiveIncomeCents: number
}

/**
 * FICalculatorForm — calculates Financial Independence number and projected date.
 *
 * Results are computed client-side in real time via useMemo/watch.
 * No separate save action — shares retirement plan data for pre-filling.
 */
export function FICalculatorForm({
  defaultValues: savedPlan,
  currentPortfolioCents,
  currentPassiveIncomeCents,
}: FICalculatorFormProps) {
  const { register, watch, formState: { errors } } = useForm<FIFormData>({
    resolver: zodResolver(fiFormSchema),
    defaultValues: {
      targetMonthlyPassiveIncomeCents:
        savedPlan?.desiredMonthlyIncomeCents ?? currentPassiveIncomeCents,
      currentPortfolioCents,
      monthlyContributionCents: savedPlan?.monthlyContributionCents ?? 0,
      annualRealReturnRate: savedPlan?.baseReturnRate != null
        ? Number(savedPlan.baseReturnRate)
        : SCENARIO_PRESETS.base.annualRealReturnRate,
      currentAge: savedPlan?.currentAge ?? 35,
    },
    mode: 'onChange',
  })

  const watched = watch()

  const result = useMemo(() => {
    const {
      targetMonthlyPassiveIncomeCents,
      currentPortfolioCents: portfolio,
      monthlyContributionCents,
      annualRealReturnRate,
      currentAge,
    } = watched

    if (!targetMonthlyPassiveIncomeCents || !annualRealReturnRate) return null

    return calculateFI({
      currentPortfolioCents: Number(portfolio) || 0,
      monthlyContributionCents: Number(monthlyContributionCents) || 0,
      targetMonthlyPassiveIncomeCents: Number(targetMonthlyPassiveIncomeCents),
      annualRealReturnRate: Number(annualRealReturnRate),
      currentAge: Number(currentAge) || 35,
    })
  }, [watched])

  const progressPercent = result
    ? Math.min(100, Math.round((Number(watched.currentPortfolioCents) / result.fiNumberCents) * 100))
    : 0

  return (
    <div className="space-y-6">
      {/* Results card — prominent */}
      {result && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Seu Numero FI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-blue-700">Patrimonio necessario para independencia financeira</p>
              <p className="text-3xl font-bold text-blue-900">
                {formatBRL(result.fiNumberCents / 100)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-blue-700">Data Prevista</p>
                <p className="text-xl font-semibold text-blue-900">
                  {result.fiYear != null ? (
                    String(result.fiYear)
                  ) : (
                    <span className="text-orange-700 text-base">Nao atingivel em 60 anos</span>
                  )}
                </p>
              </div>
              {result.yearsToFI != null && (
                <div>
                  <p className="text-sm text-blue-700">Anos Restantes</p>
                  <p className="text-xl font-semibold text-blue-900">{result.yearsToFI} anos</p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-sm text-blue-700 mb-1">
                <span>Progresso</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-blue-600 mt-1">
                {formatBRL(Number(watched.currentPortfolioCents) / 100)} de {formatBRL(result.fiNumberCents / 100)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Input form */}
      <Card>
        <CardHeader>
          <CardTitle>Parametros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="targetMonthlyPassiveIncomeCents">
              Renda Passiva Mensal Desejada (centavos)
            </Label>
            <Input
              id="targetMonthlyPassiveIncomeCents"
              type="number"
              placeholder="ex: 1000000 = R$10.000/mes"
              {...register('targetMonthlyPassiveIncomeCents', { valueAsNumber: true })}
            />
            {currentPassiveIncomeCents > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Renda passiva atual estimada: {formatBRL(currentPassiveIncomeCents / 100)}/mes
              </p>
            )}
            {errors.targetMonthlyPassiveIncomeCents && (
              <p className="text-xs text-red-600 mt-1">
                {errors.targetMonthlyPassiveIncomeCents.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="currentPortfolioCents">Portfolio Atual (centavos)</Label>
            <Input
              id="currentPortfolioCents"
              type="number"
              {...register('currentPortfolioCents', { valueAsNumber: true })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Pre-preenchido com seu portfolio de investimentos atual
            </p>
            {errors.currentPortfolioCents && (
              <p className="text-xs text-red-600 mt-1">{errors.currentPortfolioCents.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="monthlyContributionCents">Aporte Mensal (centavos)</Label>
            <Input
              id="monthlyContributionCents"
              type="number"
              placeholder="ex: 200000 = R$2.000"
              {...register('monthlyContributionCents', { valueAsNumber: true })}
            />
            {errors.monthlyContributionCents && (
              <p className="text-xs text-red-600 mt-1">{errors.monthlyContributionCents.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="annualRealReturnRate">
              Taxa de Retorno Real Anual (ex: 0.06 = 6%)
            </Label>
            <Input
              id="annualRealReturnRate"
              type="number"
              step="0.01"
              {...register('annualRealReturnRate', { valueAsNumber: true })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Presets: conservador 4%, base 6%, arrojado 9% (termos reais, descontada inflacao)
            </p>
            {errors.annualRealReturnRate && (
              <p className="text-xs text-red-600 mt-1">{errors.annualRealReturnRate.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="currentAge">Idade Atual</Label>
            <Input
              id="currentAge"
              type="number"
              {...register('currentAge', { valueAsNumber: true })}
            />
            {errors.currentAge && (
              <p className="text-xs text-red-600 mt-1">{errors.currentAge.message}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
