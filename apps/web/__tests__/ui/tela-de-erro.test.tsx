import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TelaDeErro } from '@/components/ui/tela-de-erro'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

/**
 * As telas de erro mostravam `error.message` cru. Em produção o Next troca essa
 * mensagem por um parágrafo em inglês sobre "Server Components render" — o
 * usuário lia isso sob o título "Algo deu errado", sem saber o que fazer.
 */
const GENERICO_DO_NEXT =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.'

describe('TelaDeErro', () => {
  it('não mostra o texto técnico do Next e explica o que fazer em pt-BR', () => {
    const erro = Object.assign(new Error(GENERICO_DO_NEXT), { digest: '123' })
    render(<TelaDeErro titulo="Erro ao carregar contas" error={erro} reset={() => {}} />)

    expect(screen.queryByText(/Server Components/)).toBeNull()
    expect(screen.getByText(/Tente de novo/)).toBeTruthy()
  })

  it('oferece tentar de novo e voltar ao início', () => {
    const reset = vi.fn()
    render(<TelaDeErro titulo="Algo deu errado" error={new Error('x')} reset={reset} />)

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(reset).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Ir para o início' }).getAttribute('href')).toBe('/dashboard')
  })

  it('mostra o código do erro para o usuário citar ao pedir ajuda', () => {
    const erro = Object.assign(new Error('x'), { digest: 'abc123' })
    render(<TelaDeErro titulo="Algo deu errado" error={erro} reset={() => {}} />)

    expect(screen.getByText(/abc123/)).toBeTruthy()
  })
})
