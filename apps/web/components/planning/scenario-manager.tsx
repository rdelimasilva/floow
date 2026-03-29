'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { formatBRL } from '@floow/core-finance/src/balance'
import { saveSimulationScenario, deleteSimulationScenario } from '@/lib/planning/actions'
import type { SimulationScenario } from '@floow/db'
import type { SaveScenarioInput } from '@/lib/planning/actions'
import { Trash2 } from 'lucide-react'

interface ScenarioManagerProps {
  initialScenarios: SimulationScenario[]
  getCurrentParams: () => Omit<SaveScenarioInput, 'name'>
  onLoad: (scenario: SimulationScenario) => void
}

export function ScenarioManager({ initialScenarios, getCurrentParams, onLoad }: ScenarioManagerProps) {
  const { toast } = useToast()
  const [scenarios, setScenarios] = useState(initialScenarios)
  const [scenarioName, setScenarioName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!scenarioName.trim()) return
    setSaving(true)
    try {
      const row = await saveSimulationScenario({
        ...getCurrentParams(),
        name: scenarioName.trim(),
      })
      setScenarios((prev) => [row, ...prev])
      setScenarioName('')
      setShowSaveInput(false)
      toast('Cenario salvo com sucesso')
    } catch {
      toast('Erro ao salvar cenario', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    try {
      await deleteSimulationScenario(id)
      setScenarios((prev) => prev.filter((s) => s.id !== id))
      toast('Cenario excluido')
    } catch {
      toast('Erro ao excluir cenario', 'error')
    }
  }

  function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Cenarios Salvos</CardTitle>
          {!showSaveInput && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowSaveInput(true)}>
              Salvar cenario atual
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showSaveInput && (
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Nome do cenario (ex: Conservador 2026)"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="flex-1"
              autoFocus
            />
            <Button type="button" size="sm" onClick={handleSave} disabled={!scenarioName.trim() || saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowSaveInput(false)}>
              Cancelar
            </Button>
          </div>
        )}

        {scenarios.length > 0 ? (
          <div className="space-y-2">
            {scenarios.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => { onLoad(s); toast(`Cenario "${s.name}" carregado`) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { onLoad(s); toast(`Cenario "${s.name}" carregado`) } }}
                className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.mode === 'contribution' ? 'Aporte' : 'Renda'}
                    {' · '}
                    {s.mode === 'contribution'
                      ? `${formatBRL(s.monthlyContributionCents)}/mes`
                      : `${formatBRL(s.desiredMonthlyIncomeCents)}/mes`
                    }
                    {' · '}
                    {s.currentAge}→{s.retirementAge} anos
                    {' · '}
                    {formatDate(s.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, s.id)}
                  className="ml-3 shrink-0 rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Excluir cenario"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : !showSaveInput ? (
          <p className="text-sm text-muted-foreground">
            Nenhum cenario salvo. Configure os parametros e clique em "Salvar cenario atual".
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
