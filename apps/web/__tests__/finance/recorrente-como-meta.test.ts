import { describe, it, expect } from 'vitest'
import {
  combinarMetasDoMes,
  somarRecorrentesPorCategoria,
  type OcorrenciaDeRecorrente,
} from '@/lib/finance/recurring-budget'

/**
 * Recorrente marcada como meta de gasto não vira linha em `budget_entries`:
 * a meta é derivada na leitura, a partir das ocorrências do mês. Cada
 * ocorrência é uma parcela (prevista ou realizada) que cai no mês, e vale o
 * valor do TEMPLATE — não o pago —, para conta variável seguir comparando
 * estimado com real.
 */

const ALIMENTACAO = 'cat-alimentacao'
const MORADIA = 'cat-moradia'

function ocorrencia(p: Partial<OcorrenciaDeRecorrente> = {}): OcorrenciaDeRecorrente {
  return {
    templateId: 'tpl-1',
    description: 'iFood',
    categoryId: ALIMENTACAO,
    amountCents: 20000,
    ...p,
  }
}

describe('somarRecorrentesPorCategoria', () => {
  it('mensal: uma ocorrência vale o valor do template', () => {
    const mapa = somarRecorrentesPorCategoria([ocorrencia()])
    expect(mapa.get(ALIMENTACAO)).toEqual({
      totalCents: 20000,
      recorrentes: [{ templateId: 'tpl-1', description: 'iFood', totalCents: 20000 }],
    })
  })

  it('semanal com cinco ocorrências no mês soma as cinco', () => {
    const cinco = Array.from({ length: 5 }, () => ocorrencia({ amountCents: 5000, description: 'Feira' }))
    expect(somarRecorrentesPorCategoria(cinco).get(ALIMENTACAO)?.totalCents).toBe(25000)
  })

  it('anual fora do mês de vencimento não tem ocorrência e não aparece', () => {
    expect(somarRecorrentesPorCategoria([]).size).toBe(0)
  })

  it('separa por categoria e por recorrente', () => {
    const mapa = somarRecorrentesPorCategoria([
      ocorrencia(),
      ocorrencia({ templateId: 'tpl-2', description: 'Mercado', amountCents: 30000 }),
      ocorrencia({ templateId: 'tpl-3', description: 'IPTU', categoryId: MORADIA, amountCents: 120000 }),
    ])
    expect(mapa.get(ALIMENTACAO)?.totalCents).toBe(50000)
    expect(mapa.get(ALIMENTACAO)?.recorrentes).toHaveLength(2)
    expect(mapa.get(MORADIA)?.totalCents).toBe(120000)
  })
})

describe('combinarMetasDoMes', () => {
  it('só meta manual: fica como está, sem recorrentes', () => {
    const linhas = combinarMetasDoMes([{ id: 'e1', categoryId: ALIMENTACAO, plannedCents: 150000 }], new Map())
    expect(linhas).toEqual([
      {
        entryId: 'e1',
        categoryId: ALIMENTACAO,
        plannedCents: 150000,
        manualCents: 150000,
        recorrentesCents: 0,
        recorrentes: [],
        abaixoDoPiso: false,
      },
    ])
  })

  it('só recorrente: vira linha derivada, sem entryId', () => {
    const linhas = combinarMetasDoMes([], somarRecorrentesPorCategoria([ocorrencia()]))
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      entryId: null,
      categoryId: ALIMENTACAO,
      plannedCents: 20000,
      manualCents: null,
      recorrentesCents: 20000,
      abaixoDoPiso: false,
    })
  })

  it('manual acima do piso: a recorrente conta dentro, não soma', () => {
    const linhas = combinarMetasDoMes(
      [{ id: 'e1', categoryId: ALIMENTACAO, plannedCents: 150000 }],
      somarRecorrentesPorCategoria([ocorrencia()]),
    )
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ plannedCents: 150000, recorrentesCents: 20000, abaixoDoPiso: false })
  })

  it('manual abaixo do piso: o orçado sobe para o comprometido e avisa', () => {
    const linhas = combinarMetasDoMes(
      [{ id: 'e1', categoryId: ALIMENTACAO, plannedCents: 10000 }],
      somarRecorrentesPorCategoria([ocorrencia()]),
    )
    expect(linhas[0]).toMatchObject({ plannedCents: 20000, manualCents: 10000, abaixoDoPiso: true })
  })

  it('meta sem categoria passa intacta e não recebe recorrente', () => {
    const linhas = combinarMetasDoMes(
      [{ id: 'e1', categoryId: null, plannedCents: 9000 }],
      somarRecorrentesPorCategoria([ocorrencia()]),
    )
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({ entryId: 'e1', categoryId: null, plannedCents: 9000 })
    expect(linhas[1]).toMatchObject({ entryId: null, categoryId: ALIMENTACAO })
  })

  it('duas metas manuais na mesma categoria: o piso entra só na primeira', () => {
    const linhas = combinarMetasDoMes(
      [
        { id: 'e1', categoryId: ALIMENTACAO, plannedCents: 10000 },
        { id: 'e2', categoryId: ALIMENTACAO, plannedCents: 5000 },
      ],
      somarRecorrentesPorCategoria([ocorrencia()]),
    )
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({ entryId: 'e1', plannedCents: 20000, recorrentesCents: 20000 })
    expect(linhas[1]).toMatchObject({ entryId: 'e2', plannedCents: 5000, recorrentesCents: 0 })
  })
})
