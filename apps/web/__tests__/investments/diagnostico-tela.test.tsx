import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { Achado, Diagnostico } from '@floow/core-finance'

let caminho = '/investments/diagnostico'
vi.mock('next/navigation', () => ({ usePathname: () => caminho, useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/lib/investments/diagnostico/perfil-action', () => ({ salvarPerfilInvestidor: vi.fn(async () => ({})) }))

import { TelaDeDiagnostico } from '@/components/investments/diagnostico/tela-de-diagnostico'
import { AbasDeInvestimentos } from '@/components/investments/abas-de-investimentos'

const norm = (s: string | null) => (s ?? '').replace(/\s/g, ' ')

function achado(titulo: string, parcial: Partial<Achado> = {}): Achado {
  return {
    ruleId: 'R11',
    severidade: 'info',
    titulo,
    posicoes: [],
    metricas: {},
    impactoAnualCents: null,
    exposicaoCents: null,
    dica: '',
    ...parcial,
  }
}

function diag(achados: Achado[], impactoAnualCents = 0): Diagnostico {
  return { achados, impactoAnualCents, patrimonioCents: 61_240_000 }
}

const base = { perfil: 'moderado' as const, perguntarPerfil: false, dadosAte: '2026-11-07', temInvestimentos: true }

describe('TelaDeDiagnostico', () => {
  it('mostra os achados na ordem recebida', () => {
    render(<TelaDeDiagnostico {...base} diagnostico={diag([achado('Primeiro'), achado('Segundo'), achado('Terceiro')])} />)
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titulos).toEqual(['Primeiro', 'Segundo', 'Terceiro'])
  })

  it('o cartão mostra o impacto anual arredondado', () => {
    render(<TelaDeDiagnostico {...base} diagnostico={diag([achado('x', { impactoAnualCents: 160_000 })], 160_000)} />)
    expect(norm(document.body.textContent)).toContain('~R$ 1.600/ano')
  })

  it('a pergunta de perfil aparece quando pedida e some quando não', () => {
    const { rerender } = render(<TelaDeDiagnostico {...base} perfil={null} perguntarPerfil diagnostico={diag([])} />)
    expect(screen.getByText('Como você se descreve ao investir?')).toBeTruthy()
    rerender(<TelaDeDiagnostico {...base} diagnostico={diag([])} />)
    expect(screen.queryByText('Como você se descreve ao investir?')).toBeNull()
  })

  it('sem achados mostra o estado vazio', () => {
    render(<TelaDeDiagnostico {...base} diagnostico={diag([])} />)
    expect(screen.getByText('Nenhum ponto de atenção na carteira hoje.')).toBeTruthy()
  })

  it('o aviso da CVM está sempre presente', () => {
    render(<TelaDeDiagnostico {...base} diagnostico={diag([achado('x')])} />)
    expect(document.body.textContent).toContain('Não constitui recomendação de investimento')
  })

  it('o rodapé mostra a data dos dados e o perfil', () => {
    render(<TelaDeDiagnostico {...base} diagnostico={diag([])} />)
    expect(document.body.textContent).toContain('Dados de mercado até 07/11')
    expect(screen.getByRole('link', { name: 'alterar' }).getAttribute('href')).toBe('/investments/diagnostico?perfil=alterar')
  })
})

describe('aba Diagnóstico', () => {
  it('fica ativa em /investments/diagnostico', () => {
    caminho = '/investments/diagnostico'
    render(<AbasDeInvestimentos />)
    const ativas = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(ativas.map((l) => l.textContent)).toEqual(['Diagnóstico'])
  })
})
