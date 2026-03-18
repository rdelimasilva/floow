'use client'

import { useMemo, useState, useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { simulateWithdrawal } from '@floow/core-finance/src/withdrawal'
import { SCENARIO_PRESETS } from '@floow/core-finance/src/simulation'
import { formatBRL } from '@floow/core-finance/src/balance'
import { saveWithdrawalStrategy } from '@/lib/planning/actions'
import { DepletionChart } from '@/components/planning/depletion-chart'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { WithdrawalStrategy } from '@floow/db'

// ---------------------------------------------------------------------------
// Local form schema (converts BRL inputs to cents)
// ---------------------------------------------------------------------------

const formSchema = z.object({
  mode: z.enum(['fixed', 'percentage']),
  fixedMonthlyAmountBRL: z.number().min(0).optional(),
  percentageRate: z.number().min(0.01).max(20).optional(), // stored as % (e.g. 4), converted to 0.04
  liquidationPreset: z.string().default('income_preserving'),
  annualRealReturnRate: z.number().min(0).max(30).default(6), // stored as % (e.g. 6 = 6%)
})

type FormData = z.infer<typeof formSchema>

// ---------------------------------------------------------------------------
// Liquidation preset options
// ---------------------------------------------------------------------------

const LIQUIDATION_PRESETS = [
  { value: 'income_preserving', label: 'Preservar Renda' },
  { value: 'tax_efficient', label: 'Eficiência Tributária' },
  { value: 'conservative', label: 'Conservador' },
  { value: 'custom', label: 'Personalizado' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WithdrawalFormProps {
  defaultValues: WithdrawalStrategy | null
  currentPortfolioCents: number
  retirementAge: number
  lifeExpectancy: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WithdrawalForm({
  defaultValues,
  currentPortfolioCents,
  retirementAge,
  lifeExpectancy,
}: WithdrawalFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: (defaultValues?.mode as 'fixed' | 'percentage') ?? 'fixed',
      fixedMonthlyAmountBRL: defaultValues?.fixedMonthlyAmountCents
        ? defaultValues.fixedMonthlyAmountCents / 100
        : undefined,
      percentageRate: defaultValues?.percentageRate
        ? parseFloat(String(defaultValues.percentageRate)) * 100
        : 4,
      liquidationPreset: defaultValues?.liquidationPreset ?? 'income_preserving',
      annualRealReturnRate: SCENARIO_PRESETS.base.annualRealReturnRate * 100,
    },
  })

  const mode = watch('mode')
  const fixedMonthlyAmountBRL = watch('fixedMonthlyAmountBRL') ?? 0
  const percentageRate = watch('percentageRate') ?? 4
  const annualRealReturnRate = watch('annualRealReturnRate') ?? 6
  const liquidationPreset = watch('liquidationPreset')

  // ---------------------------------------------------------------------------
  // Client-side simulation (useMemo)
  // ---------------------------------------------------------------------------

  const simulationData = useMemo(() => {
    if (currentPortfolioCents <= 0) return []

    return simulateWithdrawal({
      initialPortfolioCents: currentPortfolioCents,
      mode,
      fixedMonthlyWithdrawalCents: Math.round(fixedMonthlyAmountBRL * 100),
      percentageRate: percentageRate / 100,
      annualRealReturnRate: annualRealReturnRate / 100,
      startAge: retirementAge,
      endAge: lifeExpectancy,
    })
  }, [
    currentPortfolioCents,
    mode,
    fixedMonthlyAmountBRL,
    percentageRate,
    annualRealReturnRate,
    retirementAge,
    lifeExpectancy,
  ])

  // ---------------------------------------------------------------------------
  // Derived metrics
  // ---------------------------------------------------------------------------

  const depletionPoint = simulationData.find((p) => p.depleted)
  const currentYear = new Date().getFullYear()

  // Percentage mode: monthly income from last non-depleted point
  const lastPoint = simulationData[simulationData.length - 1]
  const estimatedMonthlyIncome =
    mode === 'percentage' && lastPoint
      ? Math.round((lastPoint.portfolioCents * (percentageRate / 100)) / 12)
      : null

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  async function onSubmit(data: FormData) {
    setSaveError(null)
    setSaveSuccess(false)

    startTransition(async () => {
      try {
        await saveWithdrawalStrategy({
          mode: data.mode,
          fixedMonthlyAmountCents:
            data.mode === 'fixed' && data.fixedMonthlyAmountBRL
              ? Math.round(data.fixedMonthlyAmountBRL * 100)
              : undefined,
          percentageRate:
            data.mode === 'percentage' && data.percentageRate
              ? data.percentageRate / 100
              : undefined,
          liquidationPreset: data.liquidationPreset,
        })
        setSaveSuccess(true)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Erro ao salvar estratégia')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Mode toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Modo de Retirada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="fixed"
                    checked={field.value === 'fixed'}
                    onChange={() => field.onChange('fixed')}
                    className="accent-blue-600"
                  />
                  <span className="text-sm font-medium">Valor Fixo Mensal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="percentage"
                    checked={field.value === 'percentage'}
                    onChange={() => field.onChange('percentage')}
                    className="accent-blue-600"
                  />
                  <span className="text-sm font-medium">Percentual do Patrimônio (Regra dos 4%)</span>
                </label>
              </div>
            )}
          />

          {/* Fixed mode fields */}
          {mode === 'fixed' && (
            <div className="space-y-1.5">
              <Label htmlFor="fixedMonthlyAmountBRL">Valor Fixo Mensal (R$)</Label>
              <Input
                id="fixedMonthlyAmountBRL"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 10000"
                {...register('fixedMonthlyAmountBRL', { valueAsNumber: true })}
              />
              {errors.fixedMonthlyAmountBRL && (
                <p className="text-xs text-red-600">{errors.fixedMonthlyAmountBRL.message}</p>
              )}
            </div>
          )}

          {/* Percentage mode fields */}
          {mode === 'percentage' && (
            <div className="space-y-1.5">
              <Label htmlFor="percentageRate">Taxa de Retirada Anual (%)</Label>
              <Input
                id="percentageRate"
                type="number"
                step="0.1"
                min="0.1"
                max="20"
                placeholder="Ex: 4"
                {...register('percentageRate', { valueAsNumber: true })}
              />
              <p className="text-xs text-gray-500">
                A regra dos 4% (safe withdrawal rate) é amplamente utilizada como referência.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Growth rate */}
      <Card>
        <CardHeader>
          <CardTitle>Taxa de Crescimento Real</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="annualRealReturnRate">Retorno Real Anual (%)</Label>
          <Input
            id="annualRealReturnRate"
            type="number"
            step="0.1"
            min="0"
            max="30"
            {...register('annualRealReturnRate', { valueAsNumber: true })}
          />
          <p className="text-xs text-gray-500">
            Cenário base: {SCENARIO_PRESETS.base.annualRealReturnRate * 100}% ao ano (real, acima da inflação)
          </p>
        </CardContent>
      </Card>

      {/* Liquidation order */}
      <Card>
        <CardHeader>
          <CardTitle>Ordem de Liquidação</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="liquidationPreset"
            render={({ field }) => (
              <div className="space-y-1.5">
                <Label>Estratégia de Liquidação</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma estratégia" />
                  </SelectTrigger>
                  <SelectContent>
                    {LIQUIDATION_PRESETS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          {liquidationPreset === 'custom' && (
            <p className="mt-2 text-xs text-gray-500">
              Personalização de ordem de liquidação disponível em breve.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Depletion chart */}
      <Card>
        <CardHeader>
          <CardTitle>Simulação de Retirada</CardTitle>
        </CardHeader>
        <CardContent>
          {currentPortfolioCents <= 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Nenhum portfólio encontrado. Adicione investimentos para simular a retirada.
            </p>
          ) : (
            <>
              <DepletionChart data={simulationData} mode={mode} />

              {/* Key metrics */}
              <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
                {mode === 'fixed' ? (
                  depletionPoint ? (
                    <p className="text-sm font-medium text-red-700">
                      Seu patrimônio se esgota aos{' '}
                      <span className="font-bold">{depletionPoint.age} anos</span>
                      {' '}({currentYear + (depletionPoint.age - retirementAge)} )
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-green-700">
                      Patrimônio não se esgota no período projetado.
                    </p>
                  )
                ) : (
                  estimatedMonthlyIncome !== null && (
                    <p className="text-sm font-medium text-blue-700">
                      Renda mensal estimada no início da retirada:{' '}
                      <span className="font-bold">{formatBRL(Math.round(currentPortfolioCents * (percentageRate / 100) / 12))}</span>
                    </p>
                  )
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar Estratégia'}
        </Button>
        {saveSuccess && (
          <p className="text-sm text-green-700">Estratégia salva com sucesso!</p>
        )}
        {saveError && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}
      </div>
    </form>
  )
}
