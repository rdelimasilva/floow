import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { RealizadoDaMeta } from '@/app/(app)/budgets/spending/realizado-da-meta'

describe('RealizadoDaMeta', () => {
  it('acima da meta, diz em texto quanto passou', () => {
    const { container } = render(<RealizadoDaMeta realizado={2133_60} meta={90_00} />)
    expect(container.textContent).toMatch(/\+R\$\s2\.043,60 acima/)
  })

  it('dentro da meta, só o valor', () => {
    const { container } = render(<RealizadoDaMeta realizado={50_00} meta={90_00} />)
    expect(container.textContent).not.toContain('acima')
  })

  it('sem meta, não calcula excesso', () => {
    const { container } = render(<RealizadoDaMeta realizado={50_00} meta={0} />)
    expect(container.textContent).not.toContain('acima')
  })
})
