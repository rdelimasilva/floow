import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { GuiaPrimeirosPassos } from '@/components/onboarding/guia-primeiros-passos'
import { CHAVE_PULADOS } from '@/lib/onboarding/primeiros-passos'

const novo = { tiposDeConta: [], bancosConectados: 0, temLancamento: false }

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

    screen.getByText(/0 de 4 concluídos/i)
    expect(screen.getByRole('link', { name: 'Conectar banco' }).getAttribute('href')).toBe('/accounts/connect')
    screen.getByText(/acesso é só de leitura/i)
  })

  it('conectar o banco não tem botão de pular', () => {
    render(<GuiaPrimeirosPassos estado={novo} />)

    expect(screen.queryByRole('button', { name: /só uso|não tenho|prefiro/i })).toBeNull()
  })

  it('pular avança para o próximo passo e fica guardado', () => {
    render(<GuiaPrimeirosPassos estado={{ ...novo, bancosConectados: 1 }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Só uso um banco' }))

    screen.getByText(/2 de 4 concluídos/i)
    expect(screen.getByRole('link', { name: 'Cadastrar dinheiro' }).getAttribute('href')).toBe(
      '/accounts/new?tipo=cash&volta=guia',
    )
    expect(JSON.parse(localStorage.getItem(CHAVE_PULADOS)!)).toEqual(['outros-bancos'])
  })

  it('com tudo concluído, mostra o fechamento e o caminho para o dashboard', () => {
    render(
      <GuiaPrimeirosPassos
        estado={{ tiposDeConta: ['checking', 'cash'], bancosConectados: 2, temLancamento: true }}
      />,
    )

    screen.getByText(/tudo pronto/i)
    expect(screen.getByRole('link', { name: /ir para o dashboard/i }).getAttribute('href')).toBe('/dashboard')
  })
})
