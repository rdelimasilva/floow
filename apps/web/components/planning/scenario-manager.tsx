'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { saveSimulationScenario, deleteSimulationScenario } from '@/lib/planning/actions'
import type { SimulationScenario } from '@floow/db'
import type { SaveScenarioInput } from '@/lib/planning/actions'

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

  async function handleSave() {
    if (!scenarioName.trim()) return
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
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSimulationScenario(id)
      setScenarios((prev) => prev.filter((s) => s.id !== id))
      toast('Cenario excluido')
    } catch {
      toast('Erro ao excluir cenario', 'error')
    }
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
        {scenarios.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {scenarios.map((s) => (
              <div key={s.id} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm">
                <button type="button" onClick={() => { onLoad(s); toast(`Cenario "${s.name}" carregado`) }} className="hover:underline font-medium">
                  {s.name}
                </button>
                <span className="text-xs text-muted-foreground ml-1">
                  ({s.mode === 'contribution' ? 'aporte' : 'renda'})
                </span>
                <button type="button" onClick={() => handleDelete(s.id)} className="ml-1 text-xs text-red-500 hover:text-red-700">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {scenarios.length === 0 && !showSaveInput && (
          <p className="text-sm text-muted-foreground">Nenhum cenario salvo. Clique em "Salvar cenario atual" para guardar a configuracao atual.</p>
        )}

        {showSaveInput && (
          <div className="flex gap-2">
            <Input
              placeholder="Nome do cenario"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="max-w-xs"
            />
            <Button type="button" size="sm" onClick={handleSave} disabled={!scenarioName.trim()}>
              Salvar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowSaveInput(false)}>
              Cancelar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
