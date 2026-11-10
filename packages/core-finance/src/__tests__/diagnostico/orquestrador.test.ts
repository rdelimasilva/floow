import { describe, expect, it } from 'vitest'
import {
  brlCurto,
  conglomerado,
  ordenarAchados,
  patrimonioCents,
  type Achado,
  type ContextoDiagnostico,
} from '../../diagnostico'

const norm = (s: string) => s.replace(/\s/g, ' ')

function achado(parcial: Partial<Achado>): Achado {
  return {
    ruleId: 'R11',
    severidade: 'info',
    titulo: '',
    posicoes: [],
    metricas: {},
    impactoAnualCents: null,
    exposicaoCents: null,
    dica: '',
    ...parcial,
  }
}

describe('ordenarAchados', () => {
  it('ordena por severidade e depois pelo valor, do maior para o menor', () => {
    const ordem = ordenarAchados([
      achado({ titulo: 'info', severidade: 'info', exposicaoCents: 9_000_000 }),
      achado({ titulo: 'media', severidade: 'media', exposicaoCents: 100 }),
      achado({ titulo: 'alta pequena', severidade: 'alta', impactoAnualCents: 1_000 }),
      achado({ titulo: 'alta sem valor', severidade: 'alta' }),
      achado({ titulo: 'alta grande', severidade: 'alta', impactoAnualCents: 50_000 }),
    ]).map((a) => a.titulo)
    expect(ordem).toEqual(['alta grande', 'alta pequena', 'alta sem valor', 'media', 'info'])
  })
})

describe('patrimonioCents', () => {
  it('soma posições e caixa', () => {
    const ctx = {
      hoje: '2026-11-10',
      posicoes: [{ valorCents: 1_000 }, { valorCents: 2_500 }],
      caixa: [{ tipo: 'checking', saldoCents: 500 }],
      gastoMensalCents: null,
      cdi12m: null,
      perfil: null,
    } as unknown as ContextoDiagnostico
    expect(patrimonioCents(ctx)).toBe(4_000)
  })
})

describe('conglomerado', () => {
  it('usa o nome do banco quando o CNPJ é conhecido', () => {
    expect(conglomerado('60.701.190/0001-04', 'x')).toBe('Itaú')
  })
  it('usa a raiz de 8 dígitos quando o CNPJ é desconhecido', () => {
    expect(conglomerado('12.345.678/0001-99', 'x')).toBe('12345678')
  })
  it('sem CNPJ, cada ativo é o próprio grupo', () => {
    expect(conglomerado(null, 'x')).toBe('ativo:x')
  })
})

describe('brlCurto', () => {
  it('arredonda para mil a partir de R$ 10 mil', () => {
    expect(norm(brlCurto(4_812_300))).toBe('R$ 48 mil')
  })
  it('abaixo de R$ 10 mil usa o valor inteiro', () => {
    expect(norm(brlCurto(160_000))).toBe('R$ 1.600')
  })
})
