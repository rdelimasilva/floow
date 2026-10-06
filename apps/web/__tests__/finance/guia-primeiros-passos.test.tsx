import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { GuiaPrimeirosPassos } from '@/components/onboarding/guia-primeiros-passos'
import { CHAVE_PULADOS } from '@/lib/onboarding/primeiros-passos'

const novo = { tiposDeConta: [], temConexao: false, temLancamento: false }

describe('guia de primeiros passos', () => {
  // O localStorage do Node atropela o do jsdom e não funciona sem arquivo.
  beforeEach(() => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    })
  })

  it('abre o passo atual com as dicas e o botão de ação', () => {
    render(<GuiaPrimeirosPassos estado={novo} />)

    screen.getByText(/0 de 5 concluídos/i)
    expect(screen.getByRole('link', { name: 'Conectar banco' }).getAttribute('href')).toBe('/accounts/connect')
    screen.getByText(/acesso é só de leitura/i)
  })

  it('pular avança para o próximo passo e fica guardado', () => {
    render(<GuiaPrimeirosPassos estado={novo} />)

    fireEvent.click(screen.getByRole('button', { name: 'Prefiro cadastrar à mão' }))

    screen.getByText(/1 de 5 concluídos/i)
    expect(screen.getByRole('link', { name: 'Cadastrar conta corrente' }).getAttribute('href')).toBe(
      '/accounts/new?tipo=checking&volta=guia',
    )
    expect(JSON.parse(localStorage.getItem(CHAVE_PULADOS)!)).toEqual(['banco'])
  })

  it('passo obrigatório não tem botão de pular', () => {
    localStorage.setItem(CHAVE_PULADOS, JSON.stringify(['banco']))
    render(<GuiaPrimeirosPassos estado={novo} />)

    screen.getByRole('link', { name: 'Cadastrar conta corrente' })
    expect(screen.queryByRole('button', { name: /pular|prefiro|não/i })).toBeNull()
  })

  it('com tudo concluído, mostra o fechamento e o caminho para o dashboard', () => {
    render(
      <GuiaPrimeirosPassos
        estado={{ tiposDeConta: ['checking', 'credit_card', 'savings'], temConexao: true, temLancamento: true }}
      />,
    )

    screen.getByText(/tudo pronto/i)
    expect(screen.getByRole('link', { name: /ir para o dashboard/i }).getAttribute('href')).toBe('/dashboard')
  })
})
