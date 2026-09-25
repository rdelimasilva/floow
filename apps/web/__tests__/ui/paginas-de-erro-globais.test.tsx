import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import NotFound from '@/app/not-found'
import GlobalError from '@/app/global-error'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

/**
 * Sem `not-found.tsx` o link quebrado caía no 404 padrão do Next ("This page
 * could not be found"), em inglês e sem saída. O `global-error` usava o
 * `NextError` do framework, também em inglês e sem botão.
 */
describe('páginas de erro globais', () => {
  it('404 em pt-BR com caminho de volta', () => {
    render(<NotFound />)

    expect(screen.getByText('Página não encontrada')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ir para o início' }).getAttribute('href')).toBe('/dashboard')
  })

  it('erro global em pt-BR com botão de tentar de novo', () => {
    render(<GlobalError error={new Error('x')} reset={() => {}} />, { container: document.documentElement })

    expect(screen.getByText('Algo deu errado')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy()
  })
})
