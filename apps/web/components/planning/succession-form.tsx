'use client'

import { useMemo, useState, useTransition } from 'react'
import { calcItcmd, calcLiquidityGap, ITCMD_RATES_BY_STATE, validateHeirPercentages } from '@floow/core-finance/src/succession'
import { formatBRL } from '@floow/core-finance/src/balance'
import { saveSuccessionPlan } from '@/lib/planning/actions'
import { HeirList, type HeirRow } from '@/components/planning/heir-list'
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
import type { SuccessionPlan, Heir } from '@floow/db'

// ---------------------------------------------------------------------------
// Brazilian states list (from ITCMD_RATES_BY_STATE keys)
// ---------------------------------------------------------------------------

const BRAZILIAN_STATES = Object.keys(ITCMD_RATES_BY_STATE).sort()

const STATE_LABELS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
}

// ---------------------------------------------------------------------------
// Helper to generate local IDs for heir rows
// ---------------------------------------------------------------------------

let _heirIdCounter = 0
function nextHeirId() {
  return `heir-${++_heirIdCounter}`
}

function dbHeirToRow(h: Heir): HeirRow {
  return {
    id: nextHeirId(),
    name: h.name,
    relationship: h.relationship,
    percentageShare: parseFloat(String(h.percentageShare)),
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SuccessionFormProps {
  defaultValues: SuccessionPlan | null
  defaultHeirs: Heir[]
  currentPortfolioCents: number
  liquidAssetsCents: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuccessionForm({
  defaultValues,
  defaultHeirs,
  currentPortfolioCents,
  liquidAssetsCents,
}: SuccessionFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Heir state
  const [heirRows, setHeirRows] = useState<HeirRow[]>(() =>
    defaultHeirs.length > 0 ? defaultHeirs.map(dbHeirToRow) : []
  )

  // Form state
  const [brazilianState, setBrazilianState] = useState(defaultValues?.brazilianState ?? 'SP')
  const [funeralCosts, setFuneralCosts] = useState(
    (defaultValues?.estimatedFuneralCostsCents ?? 1500000) / 100
  )
  const [legalFees, setLegalFees] = useState(
    (defaultValues?.estimatedLegalFeesCents ?? 500000) / 100
  )
  const [additionalLiabilities, setAdditionalLiabilities] = useState(
    (defaultValues?.additionalLiabilitiesCents ?? 0) / 100
  )
  const [showCosts, setShowCosts] = useState(false)

  // ---------------------------------------------------------------------------
  // Heir callbacks
  // ---------------------------------------------------------------------------

  function handleAddHeir() {
    setHeirRows((prev) => [
      ...prev,
      { id: nextHeirId(), name: '', relationship: 'filho', percentageShare: 0 },
    ])
  }

  function handleRemoveHeir(id: string) {
    setHeirRows((prev) => prev.filter((h) => h.id !== id))
  }

  function handleChangeHeir(id: string, field: keyof Omit<HeirRow, 'id'>, value: string | number) {
    setHeirRows((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: value } : h))
    )
  }

  // ---------------------------------------------------------------------------
  // Real-time ITCMD and liquidity gap computation
  // ---------------------------------------------------------------------------

  const computedValues = useMemo(() => {
    const state = brazilianState || 'SP'
    const funeralCentsCents = Math.round(funeralCosts * 100)
    const legalFeesCents = Math.round(legalFees * 100)
    const additionalCents = Math.round(additionalLiabilities * 100)

    const { requiredLiquidityCents, liquidityGapCents, itcmdTotalCents } = calcLiquidityGap({
      totalEstateCents: currentPortfolioCents,
      liquidAssetsCents,
      brazilianState: state,
      estimatedFuneralCostsCents: funeralCentsCents,
      estimatedLegalFeesCents: legalFeesCents,
      additionalLiabilitiesCents: additionalCents,
    })

    const itcmdRate = ITCMD_RATES_BY_STATE[state.toUpperCase()] ?? 0.05

    // Per-heir breakdown
    const perHeirData = heirRows.map((heir) => ({
      ...heir,
      estimatedValueCents: Math.round((heir.percentageShare / 100) * currentPortfolioCents),
      estimatedItcmdCents: Math.round((heir.percentageShare / 100) * itcmdTotalCents),
    }))

    return {
      itcmdTotalCents,
      itcmdRate,
      requiredLiquidityCents,
      liquidityGapCents,
      perHeirData,
    }
  }, [brazilianState, funeralCosts, legalFees, additionalLiabilities, currentPortfolioCents, liquidAssetsCents, heirRows])

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const percentagesValid =
    heirRows.length === 0 ||
    validateHeirPercentages(heirRows.map((h) => h.percentageShare))

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (heirRows.length > 0 && !percentagesValid) {
      setSaveError('As porcentagens dos herdeiros devem somar 100%.')
      return
    }

    setSaveError(null)
    setSaveSuccess(false)

    startTransition(async () => {
      try {
        await saveSuccessionPlan({
          plan: {
            brazilianState: brazilianState || undefined,
            estimatedFuneralCostsCents: Math.round(funeralCosts * 100),
            estimatedLegalFeesCents: Math.round(legalFees * 100),
            additionalLiabilitiesCents: Math.round(additionalLiabilities * 100),
          },
          heirs: heirRows.map((h) => ({
            name: h.name,
            relationship: h.relationship,
            percentageShare: h.percentageShare,
          })),
        })
        setSaveSuccess(true)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Erro ao salvar plano')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Estate info */}
      <Card>
        <CardHeader>
          <CardTitle>Estado para ITCMD</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="brazilianState">Estado (UF)</Label>
            <Select value={brazilianState} onValueChange={setBrazilianState}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o estado" />
              </SelectTrigger>
              <SelectContent>
                {BRAZILIAN_STATES.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf} — {STATE_LABELS[uf] ?? uf} (
                    {((ITCMD_RATES_BY_STATE[uf] ?? 0.05) * 100).toFixed(0)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Alíquota máxima marginal vigente em {brazilianState}:{' '}
              <span className="font-medium">
                {((ITCMD_RATES_BY_STATE[brazilianState] ?? 0.05) * 100).toFixed(0)}%
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Estimated costs (collapsible) */}
      <Card>
        <CardHeader>
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowCosts((v) => !v)}
          >
            <CardTitle>Custos Estimados</CardTitle>
            <span className="text-sm text-gray-500">{showCosts ? '▲ Recolher' : '▼ Expandir'}</span>
          </button>
        </CardHeader>
        {showCosts && (
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Custos com Funeral (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={funeralCosts}
                onChange={(e) => setFuneralCosts(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Honorários Jurídicos (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={legalFees}
                onChange={(e) => setLegalFees(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Outros Passivos (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={additionalLiabilities}
                onChange={(e) => setAdditionalLiabilities(parseFloat(e.target.value) || 0)}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Results card */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo Estimado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Patrimônio Total Estimado</span>
            <span className="font-medium">{formatBRL(currentPortfolioCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              ITCMD Total Estimado ({brazilianState}: {(computedValues.itcmdRate * 100).toFixed(0)}%)
            </span>
            <span className="font-medium text-amber-700">
              {formatBRL(computedValues.itcmdTotalCents)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Custos Totais de Liquidação</span>
            <span className="font-medium text-amber-700">
              {formatBRL(computedValues.requiredLiquidityCents)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Ativos Líquidos Disponíveis</span>
            <span className="font-medium text-green-700">{formatBRL(liquidAssetsCents)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
            <span className="font-medium text-gray-700">Gap de Liquidez</span>
            {computedValues.liquidityGapCents > 0 ? (
              <span className="font-bold text-red-600">
                {formatBRL(computedValues.liquidityGapCents)}
              </span>
            ) : (
              <span className="font-bold text-green-600">Liquidez suficiente</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Heir management */}
      <Card>
        <CardHeader>
          <CardTitle>Herdeiros</CardTitle>
        </CardHeader>
        <CardContent>
          <HeirList
            heirs={heirRows}
            onAdd={handleAddHeir}
            onRemove={handleRemoveHeir}
            onChange={handleChangeHeir}
          />
        </CardContent>
      </Card>

      {/* Per-heir breakdown table */}
      {heirRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento por Herdeiro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">Nome</th>
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">Parentesco</th>
                    <th className="text-right py-2 pr-4 font-medium text-gray-600">%</th>
                    <th className="text-right py-2 pr-4 font-medium text-gray-600">Valor Estimado</th>
                    <th className="text-right py-2 font-medium text-gray-600">ITCMD Estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {computedValues.perHeirData.map((heir) => (
                    <tr key={heir.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-900">{heir.name || '—'}</td>
                      <td className="py-2 pr-4 text-gray-600 capitalize">{heir.relationship || '—'}</td>
                      <td className="py-2 pr-4 text-right text-gray-900">
                        {heir.percentageShare.toFixed(2)}%
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-900">
                        {formatBRL(heir.estimatedValueCents)}
                      </td>
                      <td className="py-2 text-right text-amber-700">
                        {formatBRL(heir.estimatedItcmdCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save button */}
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={isPending || (heirRows.length > 0 && !percentagesValid)}
        >
          {isPending ? 'Salvando...' : 'Salvar Plano Sucessório'}
        </Button>
        {saveSuccess && (
          <p className="text-sm text-green-700">Plano salvo com sucesso!</p>
        )}
        {saveError && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}
      </div>

      {/* ITCMD disclaimer */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">Aviso Legal</p>
        <p>
          As estimativas de ITCMD são aproximadas e baseadas nas alíquotas máximas vigentes. As
          alíquotas variam por estado e faixa de valor, podendo ser alteradas a qualquer momento.
          Este cálculo <strong>NÃO</strong> constitui aconselhamento tributário ou jurídico.
          Consulte um advogado ou contador para planejamento sucessório definitivo.
        </p>
      </div>
    </div>
  )
}
