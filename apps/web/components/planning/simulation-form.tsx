'use client'

import { useState, useMemo } from 'react'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import {
  simulateRetirementScenario,
  calculateProjectedIncome,
  calculateRequiredContribution,
  SCENARIO_PRESETS,
} from '@floow/core-finance/src/simulation'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { SimulationScenario } from '@floow/db'
import { ScenarioManager } from './scenario-manager'
import dynamic from 'next/dynamic'

const RetirementSimulationChart = dynamic(() => import('@/components/planning/retirement-simulation-chart').then(m => ({ default: m.RetirementSimulationChart })), {
  loading: () => <div className="min-h-[200px] animate-pulse rounded-xl bg-gray-100" />,
  ssr: false,
})
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type SimulationMode = 'contribution' | 'income'

interface SimulationPlanDefaults {
  currentAge: number
  retirementAge: number
  lifeExpectancy: number
  monthlyContributionCents: number
  desiredMonthlyIncomeCents: number
  inflationRate: string
  conservativeReturnRate: string | null
  baseReturnRate: string | null
  aggressiveReturnRate: string | null
  contributionGrowthRate: string | null
}

interface SimulationFormProps {
  defaultValues: SimulationPlanDefaults | null
  currentPortfolioCents: number
  currentPassiveIncomeCents: number
  savedScenarios?: SimulationScenario[]
}

export function SimulationForm({
  defaultValues: savedPlan,
  currentPortfolioCents,
  currentPassiveIncomeCents,
  savedScenarios = [],
}: SimulationFormProps) {
  const [mode, setMode] = useState<SimulationMode>('contribution')
  const [showNominal, setShowNominal] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Form state (all in R$, not cents)
  const [portfolioBRL, setPortfolioBRL] = useState(currentPortfolioCents / 100)
  const [currentAge, setCurrentAge] = useState(savedPlan?.currentAge ?? 35)
  const [retirementAge, setRetirementAge] = useState(savedPlan?.retirementAge ?? 60)
  const [lifeExpectancy, setLifeExpectancy] = useState(savedPlan?.lifeExpectancy ?? 85)
  const [monthlyContributionBRL, setMonthlyContributionBRL] = useState(
    (savedPlan?.monthlyContributionCents ?? 0) / 100
  )
  const [desiredMonthlyIncomeBRL, setDesiredMonthlyIncomeBRL] = useState(
    (savedPlan?.desiredMonthlyIncomeCents ?? currentPassiveIncomeCents) / 100
  )
  // Rates stored as % (e.g. 6 = 6%), converted to decimal (0.06) for calculations and save
  const [inflationPct, setInflationPct] = useState(
    savedPlan?.inflationRate != null ? Number(savedPlan.inflationRate) * 100 : 4
  )
  const [baseReturnPct, setBaseReturnPct] = useState(
    savedPlan?.baseReturnRate != null ? Number(savedPlan.baseReturnRate) * 100 : undefined as number | undefined
  )
  const [conservativeReturnPct, setConservativeReturnPct] = useState(
    savedPlan?.conservativeReturnRate != null ? Number(savedPlan.conservativeReturnRate) * 100 : undefined as number | undefined
  )
  const [aggressiveReturnPct, setAggressiveReturnPct] = useState(
    savedPlan?.aggressiveReturnRate != null ? Number(savedPlan.aggressiveReturnRate) * 100 : undefined as number | undefined
  )
  const [contributionGrowthPct, setContributionGrowthPct] = useState(
    savedPlan?.contributionGrowthRate != null ? Number(savedPlan.contributionGrowthRate) * 100 : undefined as number | undefined
  )

  const yearsToRetirement = Math.max(1, retirementAge - currentAge)
  // Convert % to decimal for calculations
  const inflationRate = inflationPct / 100
  const baseReturnRate = baseReturnPct != null ? baseReturnPct / 100 : undefined
  const conservativeReturnRate = conservativeReturnPct != null ? conservativeReturnPct / 100 : undefined
  const aggressiveReturnRate = aggressiveReturnPct != null ? aggressiveReturnPct / 100 : undefined
  const contributionGrowthRate = contributionGrowthPct != null ? contributionGrowthPct / 100 : undefined
  const baseRate = baseReturnRate ?? SCENARIO_PRESETS.base.annualRealReturnRate
  const consRate = conservativeReturnRate ?? SCENARIO_PRESETS.conservative.annualRealReturnRate
  const aggrRate = aggressiveReturnRate ?? SCENARIO_PRESETS.aggressive.annualRealReturnRate

  // Mode-specific computed result
  const computedResult = useMemo(() => {
    const portfolioCents = Math.round(portfolioBRL * 100)

    if (mode === 'contribution') {
      // Given contribution → projected income per scenario
      const contributionCents = Math.round(monthlyContributionBRL * 100)
      return {
        conservative: calculateProjectedIncome({ currentPortfolioCents: portfolioCents, monthlyContributionCents: contributionCents, annualRealReturnRate: consRate, yearsToRetirement }),
        base: calculateProjectedIncome({ currentPortfolioCents: portfolioCents, monthlyContributionCents: contributionCents, annualRealReturnRate: baseRate, yearsToRetirement }),
        aggressive: calculateProjectedIncome({ currentPortfolioCents: portfolioCents, monthlyContributionCents: contributionCents, annualRealReturnRate: aggrRate, yearsToRetirement }),
      }
    } else {
      // Given income → required contribution per scenario
      const incomeCents = Math.round(desiredMonthlyIncomeBRL * 100)
      return {
        conservative: calculateRequiredContribution({ currentPortfolioCents: portfolioCents, targetMonthlyIncomeCents: incomeCents, annualRealReturnRate: consRate, yearsToRetirement }).requiredMonthlyContributionCents,
        base: calculateRequiredContribution({ currentPortfolioCents: portfolioCents, targetMonthlyIncomeCents: incomeCents, annualRealReturnRate: baseRate, yearsToRetirement }).requiredMonthlyContributionCents,
        aggressive: calculateRequiredContribution({ currentPortfolioCents: portfolioCents, targetMonthlyIncomeCents: incomeCents, annualRealReturnRate: aggrRate, yearsToRetirement }).requiredMonthlyContributionCents,
      }
    }
  }, [mode, portfolioBRL, monthlyContributionBRL, desiredMonthlyIncomeBRL, currentAge, retirementAge, consRate, baseRate, aggrRate, yearsToRetirement])

  // Chart projections (always use contribution for the chart)
  const projections = useMemo(() => {
    if (!currentAge || !retirementAge || !lifeExpectancy) return null

    const portfolioCents = Math.round(portfolioBRL * 100)
    const contributionCents = mode === 'contribution'
      ? Math.round(monthlyContributionBRL * 100)
      : computedResult.base // in income mode, use computed base contribution
    const incomeCents = mode === 'income'
      ? Math.round(desiredMonthlyIncomeBRL * 100)
      : computedResult.base // in contribution mode, use projected base income

    const baseParams = {
      currentPortfolioCents: portfolioCents,
      monthlyContributionCents: contributionCents,
      currentAge,
      retirementAge,
      lifeExpectancy,
      desiredMonthlyIncomeCents: incomeCents,
    }

    const consGrowth = contributionGrowthRate ?? SCENARIO_PRESETS.conservative.annualContributionGrowthRate
    const baseGrowth = contributionGrowthRate ?? SCENARIO_PRESETS.base.annualContributionGrowthRate
    const aggrGrowth = contributionGrowthRate ?? SCENARIO_PRESETS.aggressive.annualContributionGrowthRate

    return {
      conservative: simulateRetirementScenario({ ...baseParams, annualRealReturnRate: consRate, annualContributionGrowthRate: consGrowth }),
      base: simulateRetirementScenario({ ...baseParams, annualRealReturnRate: baseRate, annualContributionGrowthRate: baseGrowth }),
      aggressive: simulateRetirementScenario({ ...baseParams, annualRealReturnRate: aggrRate, annualContributionGrowthRate: aggrGrowth }),
    }
  }, [mode, portfolioBRL, monthlyContributionBRL, desiredMonthlyIncomeBRL, currentAge, retirementAge, lifeExpectancy, consRate, baseRate, aggrRate, contributionGrowthRate, computedResult.base])


  function loadScenario(s: SimulationScenario) {
    setMode(s.mode as SimulationMode)
    setPortfolioBRL(s.portfolioCents / 100)
    setCurrentAge(s.currentAge)
    setRetirementAge(s.retirementAge)
    setLifeExpectancy(s.lifeExpectancy)
    setMonthlyContributionBRL(s.monthlyContributionCents / 100)
    setDesiredMonthlyIncomeBRL(s.desiredMonthlyIncomeCents / 100)
    setInflationPct(s.inflationRate != null ? Number(s.inflationRate) * 100 : 4)
    setConservativeReturnPct(s.conservativeReturnRate != null ? Number(s.conservativeReturnRate) * 100 : undefined)
    setBaseReturnPct(s.baseReturnRate != null ? Number(s.baseReturnRate) * 100 : undefined)
    setAggressiveReturnPct(s.aggressiveReturnRate != null ? Number(s.aggressiveReturnRate) * 100 : undefined)
    setContributionGrowthPct(s.contributionGrowthRate != null ? Number(s.contributionGrowthRate) * 100 : undefined)
  }

  function getCurrentParams() {
    return {
      mode,
      portfolioCents: Math.round(portfolioBRL * 100),
      currentAge,
      retirementAge,
      lifeExpectancy,
      monthlyContributionCents: Math.round(monthlyContributionBRL * 100),
      desiredMonthlyIncomeCents: Math.round(desiredMonthlyIncomeBRL * 100),
      inflationRate,
      conservativeReturnRate,
      baseReturnRate,
      aggressiveReturnRate,
      contributionGrowthRate,
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setMode('contribution')}
              className={`flex-1 rounded-lg border-2 p-4 text-left transition-colors ${
                mode === 'contribution' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-medium text-sm">Tenho um aporte mensal</p>
              <p className="text-xs text-muted-foreground mt-1">
                Descubra a renda passiva que voce tera na aposentadoria
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode('income')}
              className={`flex-1 rounded-lg border-2 p-4 text-left transition-colors ${
                mode === 'income' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-medium text-sm">Quero uma renda mensal</p>
              <p className="text-xs text-muted-foreground mt-1">
                Descubra quanto precisa aportar por mes para atingir seu objetivo
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Saved scenarios */}
      <ScenarioManager
        initialScenarios={savedScenarios}
        getCurrentParams={getCurrentParams}
        onLoad={loadScenario}
      />

      {/* Result card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          {mode === 'contribution' ? (
            <div>
              <p className="text-sm text-blue-700 mb-1">Renda passiva estimada na aposentadoria</p>
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
            </div>
          ) : (
            <div>
              <p className="text-sm text-blue-700 mb-1">Aporte mensal necessario</p>
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle>Projecao de Patrimonio (3 Cenarios)</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{showNominal ? 'Nominal (futuro)' : 'Real (hoje)'}</span>
              <button
                type="button"
                onClick={() => setShowNominal((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showNominal ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${showNominal ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
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

      {/* Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>Parametros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Portfolio */}
          <div>
            <Label htmlFor="portfolioBRL">Portfolio Inicial (R$)</Label>
            <Input
              id="portfolioBRL"
              type="number"
              step="0.01"
              value={portfolioBRL}
              onChange={(e) => setPortfolioBRL(Number(e.target.value) || 0)}
            />
            {currentPortfolioCents > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Seu portfolio atual: {formatBRL(currentPortfolioCents)}.{' '}
                <button type="button" onClick={() => setPortfolioBRL(currentPortfolioCents / 100)} className="text-blue-600 hover:underline">
                  Usar valor atual
                </button>
              </p>
            )}
          </div>

          {/* Ages */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="currentAge">Idade Atual</Label>
              <Input id="currentAge" type="number" value={currentAge} onChange={(e) => setCurrentAge(Number(e.target.value) || 35)} />
            </div>
            <div>
              <Label htmlFor="retirementAge">Idade de Aposentadoria</Label>
              <Input id="retirementAge" type="number" value={retirementAge} onChange={(e) => setRetirementAge(Number(e.target.value) || 60)} />
            </div>
            <div>
              <Label htmlFor="lifeExpectancy">Expectativa de Vida</Label>
              <Input id="lifeExpectancy" type="number" value={lifeExpectancy} onChange={(e) => setLifeExpectancy(Number(e.target.value) || 85)} />
            </div>
          </div>

          {/* Mode-specific input */}
          {mode === 'contribution' ? (
            <div>
              <Label htmlFor="monthlyContribution">Aporte Mensal (R$)</Label>
              <Input
                id="monthlyContribution"
                type="number"
                step="0.01"
                placeholder="ex: 2000"
                value={monthlyContributionBRL}
                onChange={(e) => setMonthlyContributionBRL(Number(e.target.value) || 0)}
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="desiredIncome">Renda Mensal Desejada (R$)</Label>
              <Input
                id="desiredIncome"
                type="number"
                step="0.01"
                placeholder="ex: 10000"
                value={desiredMonthlyIncomeBRL}
                onChange={(e) => setDesiredMonthlyIncomeBRL(Number(e.target.value) || 0)}
              />
              {currentPassiveIncomeCents > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Renda passiva atual estimada: {formatBRL(currentPassiveIncomeCents)}/mes
                </p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="inflationPct" className="flex items-center gap-1">
              Inflacao Anual (% ao ano)
              <HelpTooltip text="Taxa anual de perda de poder de compra. O IPCA medio no Brasil e de 4-5% ao ano." />
            </Label>
            <Input id="inflationPct" type="number" step="0.1" value={inflationPct} onChange={(e) => setInflationPct(Number(e.target.value) || 4)} />
          </div>

          {/* Advanced */}
          <div>
            <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-sm text-blue-600 hover:underline">
              {showAdvanced ? 'Ocultar configuracoes avancadas' : 'Configuracoes avancadas'}
            </button>
            {showAdvanced && (
              <div className="mt-4 space-y-4 border-t pt-4">
                <p className="text-xs text-gray-500">
                  Deixe em branco para usar os presets (conservador: 4%, base: 6%, arrojado: 9% real ao ano).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="consRate" className="flex items-center gap-1">
                      Retorno Conservador (% a.a.)
                      <HelpTooltip text="Cenario pessimista: renda fixa pura." />
                    </Label>
                    <Input id="consRate" type="number" step="0.1" placeholder="4" value={conservativeReturnPct ?? ''} onChange={(e) => setConservativeReturnPct(e.target.value ? Number(e.target.value) : undefined)} />
                  </div>
                  <div>
                    <Label htmlFor="baseRate" className="flex items-center gap-1">
                      Retorno Base (% a.a.)
                      <HelpTooltip text="Cenario moderado: carteira diversificada." />
                    </Label>
                    <Input id="baseRate" type="number" step="0.1" placeholder="6" value={baseReturnPct ?? ''} onChange={(e) => setBaseReturnPct(e.target.value ? Number(e.target.value) : undefined)} />
                  </div>
                  <div>
                    <Label htmlFor="aggrRate" className="flex items-center gap-1">
                      Retorno Arrojado (% a.a.)
                      <HelpTooltip text="Cenario otimista: maior exposicao a renda variavel." />
                    </Label>
                    <Input id="aggrRate" type="number" step="0.1" placeholder="9" value={aggressiveReturnPct ?? ''} onChange={(e) => setAggressiveReturnPct(e.target.value ? Number(e.target.value) : undefined)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="contribGrowth" className="flex items-center gap-1">
                    Crescimento Anual dos Aportes (% a.a.)
                    <HelpTooltip text="Simula aumentos de salario ao longo do tempo." />
                  </Label>
                  <Input id="contribGrowth" type="number" step="0.1" placeholder="3" value={contributionGrowthPct ?? ''} onChange={(e) => setContributionGrowthPct(e.target.value ? Number(e.target.value) : undefined)} />
                </div>
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400">
        Valores em termos reais (descontada inflacao). Projecoes sao estimativas — consulte um profissional para decisoes financeiras.
      </p>
    </div>
  )
}
