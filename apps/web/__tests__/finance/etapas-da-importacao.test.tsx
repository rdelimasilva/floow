import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { EtapasDaImportacao } from '@/components/finance/etapas-da-importacao'

/** A importação tem cinco telas seguidas e nenhuma dizia em qual o usuário estava. */
describe('EtapasDaImportacao', () => {
  it('marca a etapa atual e diz a posição', () => {
    render(<EtapasDaImportacao step="reconciliation" />)
    const atual = screen.getByText(/Duplicatas/).closest('li')
    expect(atual?.getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('Etapa 3 de 5')).toBeTruthy()
  })

  it('importando conta como a etapa de revisão', () => {
    render(<EtapasDaImportacao step="importing" />)
    expect(screen.getByText(/Revisão/).closest('li')?.getAttribute('aria-current')).toBe('step')
  })
})
