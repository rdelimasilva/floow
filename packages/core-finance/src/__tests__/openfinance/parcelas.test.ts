import { describe, expect, it } from 'vitest'
import {
  dataDaParcela,
  descricaoSemNumeroDaParcela,
  diaDeVencimentoMaisComum,
  planejarParcelasFaltantes,
  somarMeses,
  type ParcelaConhecida,
} from '../../openfinance/parcelas'

describe('dataDaParcela', () => {
  it('usa o vencimento da fatura quando existe', () => {
    expect(dataDaParcela({ billPostDate: '2026-12-16', billForecastMonth: '2026-12', purchaseDate: '2026-09-12' }, 16)).toBe('2026-12-16')
  })

  it('sem fatura fechada, usa o mês previsto com o dia de vencimento do cartão', () => {
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: '2027-03', purchaseDate: '2026-09-12' }, 16)).toBe('2027-03-16')
  })

  it('sem dia de vencimento conhecido, usa o dia 1 do mês previsto', () => {
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: '2027-03', purchaseDate: '2026-09-12' }, null)).toBe('2027-03-01')
  })

  it('dia 31 em mês de 30 dias cai no último dia do mês', () => {
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: '2027-04', purchaseDate: '2026-09-12' }, 31)).toBe('2027-04-30')
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: '2027-02', purchaseDate: '2026-09-12' }, 31)).toBe('2027-02-28')
  })

  it('sem fatura e sem mês previsto, fica na data da compra', () => {
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: null, purchaseDate: '2026-09-12' }, 16)).toBe('2026-09-12')
  })
})

describe('diaDeVencimentoMaisComum', () => {
  it('ignora o dia deslocado por fim de semana', () => {
    expect(diaDeVencimentoMaisComum(['2026-10-16', '2026-11-16', '2027-01-18', '2026-12-16'])).toBe(16)
  })

  it('sem datas, null', () => {
    expect(diaDeVencimentoMaisComum([])).toBeNull()
  })
})

describe('somarMeses', () => {
  it('mantém o dia', () => {
    expect(somarMeses('2026-09-16', 3)).toBe('2026-12-16')
  })
  it('vira o ano', () => {
    expect(somarMeses('2026-11-16', 3)).toBe('2027-02-16')
  })
  it('prende no último dia do mês', () => {
    expect(somarMeses('2027-01-31', 1)).toBe('2027-02-28')
  })
})

describe('descricaoSemNumeroDaParcela', () => {
  it('tira o sufixo NN/NN', () => {
    expect(descricaoSemNumeroDaParcela('AIRBNB * HMR5PP9B902/06')).toBe('AIRBNB * HMR5PP9B9')
    expect(descricaoSemNumeroDaParcela('ITAUSHOP 02/10')).toBe('ITAUSHOP')
  })
  it('sem sufixo, devolve igual', () => {
    expect(descricaoSemNumeroDaParcela('Diroma Clubes')).toBe('Diroma Clubes')
  })
})

function parcela(over: Partial<ParcelaConhecida>): ParcelaConhecida {
  return {
    purchaseDate: '2026-07-27',
    installmentNumber: 1,
    installmentTotal: 6,
    amountCents: -45920,
    date: '2026-08-16',
    description: 'AIRBNB * HMR5PP9B901/06',
    categoryId: 'cat-viagem',
    ...over,
  }
}

describe('planejarParcelasFaltantes', () => {
  it('cria as parcelas depois da última conhecida, mês a mês', () => {
    const planejadas = planejarParcelasFaltantes([
      parcela({}),
      parcela({ installmentNumber: 2, amountCents: -45916, date: '2026-09-16', description: 'AIRBNB * HMR5PP9B902/06' }),
    ])
    expect(planejadas.map((p) => [p.installmentNumber, p.date, p.amountCents])).toEqual([
      [3, '2026-10-16', -45916],
      [4, '2026-11-16', -45916],
      [5, '2026-12-16', -45916],
      [6, '2027-01-16', -45916],
    ])
    expect(planejadas[0].description).toBe('AIRBNB * HMR5PP9B9')
    expect(planejadas[0].categoryId).toBe('cat-viagem')
    expect(planejadas[0].purchaseDate).toBe('2026-07-27')
  })

  it('grupo completo não gera nada', () => {
    const todas = Array.from({ length: 6 }, (_, i) => parcela({ installmentNumber: i + 1 }))
    expect(planejarParcelasFaltantes(todas)).toEqual([])
  })

  it('não recria número que já existe, mesmo fora de ordem', () => {
    const planejadas = planejarParcelasFaltantes([
      parcela({ installmentNumber: 1 }),
      parcela({ installmentNumber: 4, date: '2026-11-16' }),
    ])
    expect(planejadas.map((p) => p.installmentNumber)).toEqual([5, 6])
  })

  it('compras no mesmo dia com valores diferentes são grupos distintos', () => {
    const planejadas = planejarParcelasFaltantes([
      parcela({ amountCents: -5000, installmentTotal: 2, description: 'LOJA A 01/02' }),
      parcela({ amountCents: -28000, installmentTotal: 2, description: 'LOJA B 01/02' }),
    ])
    expect(planejadas.map((p) => p.amountCents).sort()).toEqual([-28000, -5000])
  })

  it('parcela 1 com centavos a mais fica no mesmo grupo (tolerância de 1%)', () => {
    const planejadas = planejarParcelasFaltantes([
      parcela({ installmentTotal: 3, amountCents: -28025 }),
      parcela({ installmentTotal: 3, installmentNumber: 2, amountCents: -28023, date: '2026-09-16' }),
    ])
    expect(planejadas).toHaveLength(1)
    expect(planejadas[0].installmentNumber).toBe(3)
  })
})
