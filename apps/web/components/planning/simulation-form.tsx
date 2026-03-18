'use client'

import { useState, useMemo, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { retirementPlanSchema, type RetirementPlanInput } from '@floow/shared'
import {
  simulateRetirementScenario,
  calculateFI,
  SCENARIO_PRESETS,
  type RetirementYearPoint,
} from '@floow/core-finance/src/simulation'
import { formatBRL } from '@floow/core-finance/src/balance'
import { saveRetirementPlan } from '@/lib/planning/actions'
import { RetirementSimulationChart } from '@/components/planning/retirement-simulation-chart'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RetirementPlan } from '@floow/db'

interface SimulationFormProps {
  defaultValues: RetirementPlan | null
  currentPortfolioCents: number
  currentPassiveIncomeCents: number
}

// Convert DB row (numeric fields stored as strings) to form number values
function planToFormDefaults(plan: RetirementPlan | null): Partial<RetirementPlanInput> {
  if (!plan) return {}
  return {
    currentAge: plan.currentAge,
    retirementAge: plan.retirementAge,
    lifeExpectancy: plan.lifeExpectancy,
    monthlyContributionCents: plan.monthlyContributionCents,
    desiredMonthlyIncomeCents: plan.desiredMonthlyIncomeCents,
    inflationRate: plan.inflationRate != null ? Number(plan.inflationRate) : 0.04,
    conservativeReturnRate: plan.conservativeReturnRate != null
      ? Number(plan.conservativeReturnRate)
      : undefined,
    baseReturnRate: plan.baseReturnRate != null ? Number(plan.baseReturnRate) : undefined,
    aggressiveReturnRate: plan.aggressiveReturnRate != null
      ? Number(plan.aggressiveReturnRate)
      : undefined,
    contributionGrowthRate: plan.contributionGrowthRate != null
      ? Number(plan.contributionGrowthRate)
      : undefined,
  }
}

/**
 * SimulationForm — interactive retirement simulation with real-time chart updates.
 *
 * Computes 3-scenario projections client-side using simulateRetirementScenario.
 * Saves plan to DB via saveRetirementPlan server action.
 * Supports nominal/real toggle and advanced rate overrides.
 */
export function SimulationForm({
  defaultValues: savedPlan,
  currentPortfolioCents,
  currentPassiveIncomeCents,
}: SimulationFormProps) {
  const [showNominal, setShowNominal] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const formDefaults = planToFormDefaults(savedPlan)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RetirementPlanInput>({
    resolver: zodResolver(retirementPlanSchema),
    defaultValues: {
      currentAge: formDefaults.currentAge ?? 35,
      retirementAge: formDefaults.retirementAge ?? 60,
      lifeExpectancy: formDefaults.lifeExpectancy ?? 85,
      monthlyContributionCents: formDefaults.monthlyContributionCents ?? 0,
      desiredMonthlyIncomeCents: formDefaults.desiredMonthlyIncomeCents ?? currentPassiveIncomeCents,
      inflationRate: formDefaults.inflationRate ?? 0.04,
      conservativeReturnRate: formDefaults.conservativeReturnRate,
      baseReturnRate: formDefaults.baseReturnRate,
      aggressiveReturnRate: formDefaults.aggressiveReturnRate,
      contributionGrowthRate: formDefaults.contributionGrowthRate,
    },
    mode: 'onChange',
  })

  const watched = watch()

  // Re-compute projections whenever form values change
  const projections = useMemo(() => {
    const {
      currentAge,
      retirementAge,
      lifeExpectancy,
      monthlyContributionCents,
      desiredMonthlyIncomeCents,
      conservativeReturnRate,
      baseReturnRate,
      aggressiveReturnRate,
      contributionGrowthRate,
    } = watched

    if (!currentAge || !retirementAge || !lifeExpectancy) return null

    const baseParams = {
      currentPortfolioCents,
      monthlyContributionCents: Number(monthlyContributionCents) || 0,
      currentAge: Number(currentAge),
      retirementAge: Number(retirementAge),
      lifeExpectancy: Number(lifeExpectancy),
      desiredMonthlyIncomeCents: Number(desiredMonthlyIncomeCents) || 0,
    }

    const conservativePreset = SCENARIO_PRESETS.conservative
    const basePreset = SCENARIO_PRESETS.base
    const aggressivePreset = SCENARIO_PRESETS.aggressive

    const conservativePoints = simulateRetirementScenario({
      ...baseParams,
      annualRealReturnRate: conservativeReturnRate != null
        ? Number(conservativeReturnRate)
        : conservativePreset.annualRealReturnRate,
      annualContributionGrowthRate: contributionGrowthRate != null
        ? Number(contributionGrowthRate)
        : conservativePreset.annualContributionGrowthRate,
    })

    const basePoints = simulateRetirementScenario({
      ...baseParams,
      annualRealReturnRate: baseReturnRate != null
        ? Number(baseReturnRate)
        : basePreset.annualRealReturnRate,
      annualContributionGrowthRate: contributionGrowthRate != null
        ? Number(contributionGrowthRate)
        : basePreset.annualContributionGrowthRate,
    })

    const aggressivePoints = simulateRetirementScenario({
      ...baseParams,
      annualRealReturnRate: aggressiveReturnRate != null
        ? Number(aggressiveReturnRate)
        : aggressivePreset.annualRealReturnRate,
      annualContributionGrowthRate: contributionGrowthRate != null
        ? Number(contributionGrowthRate)
        : aggressivePreset.annualContributionGrowthRate,
    })

    const fiResult = calculateFI({
      currentPortfolioCents,
      monthlyContributionCents: Number(monthlyContributionCents) || 0,
      targetMonthlyPassiveIncomeCents: Number(desiredMonthlyIncomeCents) || 0,
      annualRealReturnRate: baseReturnRate != null
        ? Number(baseReturnRate)
        : basePreset.annualRealReturnRate,
      currentAge: Number(currentAge),
    })

    return { conservative: conservativePoints, base: basePoints, aggressive: aggressivePoints, fi: fiResult }
  }, [watched, currentPortfolioCents])

  const onSubmit = useCallback(async (data: RetirementPlanInput) => {
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await saveRetirementPlan(data)
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar plano')
    } finally {
      setIsSaving(false)
    }
  }, [])

  const inflationRate = Number(watched.inflationRate) || 0.04
  const currentAge = Number(watched.currentAge) || 35
  const retirementAge = Number(watched.retirementAge) || 60

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Projecao de Patrimonio (3 Cenarios)</CardTitle>
            <button
              type="button"
              onClick={() => setShowNominal((v) => !v)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showNominal ? 'Valores Nominais' : 'Valores Reais (hoje)'}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-3 text-sm">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-red-600" /> Conservador
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-blue-600" /> Base
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-green-600" /> Arrojado
            </span>
          </div>
          {projections ? (
            <RetirementSimulationChart
              conservative={projections.conservative}
              base={projections.base}
              aggressive={projections.aggressive}
              retirementAge={retirementAge}
              currentAge={currentAge}
              showNominal={showNominal}
              inflationRate={inflationRate}
            />
          ) : (
            <div className="min-h-[350px] flex items-center justify-center text-sm text-gray-500">
              Preencha os dados abaixo para ver a projecao.
            </div>
          )}
        </CardContent>
      </Card>

      {/* FI Result */}
      {projections?.fi && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Numero FI (cenario base): </span>
              {formatBRL(projections.fi.fiNumberCents / 100)}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              {projections.fi.fiYear != null ? (
                <>
                  <span className="font-medium">Independencia financeira em: </span>
                  {projections.fi.fiYear} ({projections.fi.yearsToFI} anos)
                </>
              ) : (
                <span className="text-orange-600">
                  Independencia financeira nao atingivel em 60 anos com os parametros atuais.
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Parametros da Simulacao</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Portfolio auto-filled */}
            <div>
              <Label>Portfolio Atual</Label>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {formatBRL(currentPortfolioCents / 100)}
                <span className="text-xs text-gray-500 ml-2">
                  (preenchido automaticamente do seu portfolio de investimentos)
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div>
                <Label htmlFor="retirementAge">Idade de Aposentadoria</Label>
                <Input
                  id="retirementAge"
                  type="number"
                  {...register('retirementAge', { valueAsNumber: true })}
                />
                {errors.retirementAge && (
                  <p className="text-xs text-red-600 mt-1">{errors.retirementAge.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="lifeExpectancy">Expectativa de Vida</Label>
                <Input
                  id="lifeExpectancy"
                  type="number"
                  {...register('lifeExpectancy', { valueAsNumber: true })}
                />
                {errors.lifeExpectancy && (
                  <p className="text-xs text-red-600 mt-1">{errors.lifeExpectancy.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <Label htmlFor="desiredMonthlyIncomeCents">
                  Renda Mensal Desejada na Aposentadoria (centavos)
                </Label>
                <Input
                  id="desiredMonthlyIncomeCents"
                  type="number"
                  placeholder="ex: 1000000 = R$10.000"
                  {...register('desiredMonthlyIncomeCents', { valueAsNumber: true })}
                />
                {currentPassiveIncomeCents > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Renda passiva atual estimada: {formatBRL(currentPassiveIncomeCents / 100)}/mes
                  </p>
                )}
                {errors.desiredMonthlyIncomeCents && (
                  <p className="text-xs text-red-600 mt-1">{errors.desiredMonthlyIncomeCents.message}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="inflationRate">Taxa de Inflacao Anual (ex: 0.04 = 4%)</Label>
              <Input
                id="inflationRate"
                type="number"
                step="0.01"
                {...register('inflationRate', { valueAsNumber: true })}
              />
              {errors.inflationRate && (
                <p className="text-xs text-red-600 mt-1">{errors.inflationRate.message}</p>
              )}
            </div>

            {/* Advanced section */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-sm text-blue-600 hover:underline"
              >
                {showAdvanced ? 'Ocultar configuracoes avancadas' : 'Configuracoes avancadas'}
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4 border-t pt-4">
                  <p className="text-xs text-gray-500">
                    Deixe em branco para usar os presets do sistema (conservador: 4%, base: 6%, arrojado: 9% real ao ano).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="conservativeReturnRate">
                        Retorno Conservador (ex: 0.04)
                      </Label>
                      <Input
                        id="conservativeReturnRate"
                        type="number"
                        step="0.01"
                        placeholder="0.04"
                        {...register('conservativeReturnRate', { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="baseReturnRate">Retorno Base (ex: 0.06)</Label>
                      <Input
                        id="baseReturnRate"
                        type="number"
                        step="0.01"
                        placeholder="0.06"
                        {...register('baseReturnRate', { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="aggressiveReturnRate">Retorno Arrojado (ex: 0.09)</Label>
                      <Input
                        id="aggressiveReturnRate"
                        type="number"
                        step="0.01"
                        placeholder="0.09"
                        {...register('aggressiveReturnRate', { valueAsNumber: true })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="contributionGrowthRate">
                      Crescimento Anual dos Aportes (ex: 0.03 = 3%)
                    </Label>
                    <Input
                      id="contributionGrowthRate"
                      type="number"
                      step="0.01"
                      placeholder="0.03"
                      {...register('contributionGrowthRate', { valueAsNumber: true })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar Plano'}
              </Button>
              {saveSuccess && (
                <span className="text-sm text-green-600">Plano salvo com sucesso!</span>
              )}
              {saveError && (
                <span className="text-sm text-red-600">{saveError}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
