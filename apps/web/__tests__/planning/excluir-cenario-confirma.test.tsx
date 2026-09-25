import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

vi.mock('@/lib/planning/actions', () => ({
  saveSimulationScenario: vi.fn(),
  deleteSimulationScenario: vi.fn(async () => undefined),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

import { ScenarioManager } from '@/components/planning/scenario-manager'
import { deleteSimulationScenario } from '@/lib/planning/actions'

/** A lixeira do cenário excluía na hora, sem confirmação e sem desfazer. */
const CENARIO = {
  id: 'c1',
  name: 'Aposentar aos 55',
  monthlyContributionCents: 200000,
  desiredMonthlyIncomeCents: 0,
  currentAge: 35,
  retirementAge: 55,
  createdAt: '2026-09-01',
}

describe('ScenarioManager — excluir', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pede confirmação antes de excluir', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<ScenarioManager initialScenarios={[CENARIO] as any} getCurrentParams={() => ({}) as any} onLoad={() => {}} />)

    fireEvent.click(screen.getByTitle('Excluir cenário'))
    expect(deleteSimulationScenario).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(deleteSimulationScenario).toHaveBeenCalledWith('c1'))
  })
})
