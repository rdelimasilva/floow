import { describe, it, expect } from 'vitest'
import { matchForecast, type ForecastCandidate, type RealizedTransaction } from '../forecast-match'

/**
 * Casamento de lançamento previsto com o realizado que o banco trouxe.
 *
 * O problema que isto resolve: `reconcileRecurringBalances` aplica o valor
 * PREVISTO no saldo quando a data chega, e o sync depois importa o real com
 * `externalId` novo. Os dois contam. No banco de produção o salário de
 * 15/07/2026 existe duas vezes — R$ 32.500,00 do template e R$ 32.638,85 do
 * Itaú.
 *
 * O risco oposto é pior que o problema: casar errado esconde um lançamento de
 * verdade. Durante a investigação um heurístico de 10% e 5 dias casou "TIM
 * internet" (R$ 159,00) com "Enel Distribuicao" (R$ 163,67) — contas de
 * fornecedores diferentes, no mesmo cartão, na mesma semana. Esse caso está
 * aqui como teste.
 */

const DIA = 24 * 60 * 60 * 1000

function data(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

/** Salário: o caso real do banco de produção. */
const SALARIO_PREVISTO: ForecastCandidate = {
  id: 'prev-salario',
  amountCents: 3_250_000,
  date: data('2026-07-15'),
  description: 'Salário - Soma Cooperativa (7/61)',
}

const SALARIO_REAL: RealizedTransaction = {
  amountCents: 3_263_885,
  date: data('2026-07-15'),
  description: 'Entrada SOMA COOPERATIVA DE TRABALHO EM TECNOLOGIA DA INFORMACAO',
}

describe('matchForecast', () => {
  it('casa o salário previsto com o realizado, apesar da diferença de valor', () => {
    // R$ 32.500 previsto contra R$ 32.638,85 real: 0,43% de diferença.
    expect(matchForecast(SALARIO_REAL, [SALARIO_PREVISTO])?.id).toBe('prev-salario')
  })

  it('recusa o falso positivo TIM contra Enel', () => {
    const tim: ForecastCandidate = {
      id: 'prev-tim',
      amountCents: -15_900,
      date: data('2026-08-15'),
      description: 'TIM internet (5/61)',
    }
    const enel: RealizedTransaction = {
      amountCents: -16_367,
      date: data('2026-08-14'),
      description: 'Enel Distribuicao Sao Paulo',
    }

    // 2,94% de diferença. Fornecedor diferente, e nada na descrição sustenta
    // o casamento.
    expect(matchForecast(enel, [tim])).toBeNull()
  })

  it('casa a conta da TIM com a previsão da TIM', () => {
    const previsto: ForecastCandidate = {
      id: 'prev-tim',
      amountCents: -15_900,
      date: data('2026-07-15'),
      description: 'TIM internet (4/61)',
    }
    const real: RealizedTransaction = {
      amountCents: -15_999,
      date: data('2026-07-20'),
      description: 'Débito automático DA TIM CELU 32416990000',
    }

    expect(matchForecast(real, [previsto])?.id).toBe('prev-tim')
  })

  it('recusa sinal oposto — entrada nunca casa com previsão de saída', () => {
    const saida: ForecastCandidate = { ...SALARIO_PREVISTO, amountCents: -3_250_000 }

    expect(matchForecast(SALARIO_REAL, [saida])).toBeNull()
  })

  it('recusa fora da janela de data', () => {
    const longe: RealizedTransaction = {
      ...SALARIO_REAL,
      date: new Date(SALARIO_PREVISTO.date.getTime() + 9 * DIA),
    }

    expect(matchForecast(longe, [SALARIO_PREVISTO])).toBeNull()
  })

  it('escolhe o candidato de valor mais próximo quando há vários', () => {
    // Duas previsões plausíveis na janela: vence a de menor diferença, não a
    // primeira da lista.
    const distante: ForecastCandidate = { ...SALARIO_PREVISTO, id: 'prev-longe', amountCents: 3_300_000 }
    const perto: ForecastCandidate = { ...SALARIO_PREVISTO, id: 'prev-perto', amountCents: 3_260_000 }

    expect(matchForecast(SALARIO_REAL, [distante, perto])?.id).toBe('prev-perto')
  })

  it('devolve null sem candidato nenhum', () => {
    expect(matchForecast(SALARIO_REAL, [])).toBeNull()
  })

  it('valor exatamente igual casa mesmo com descrição sem nada em comum', () => {
    // Valor idêntico no mesmo dia é evidência forte por si só — é o caso do
    // débito automático cujo texto do banco não lembra o do template.
    const previsto: ForecastCandidate = {
      id: 'prev-x',
      amountCents: -88_000_0,
      date: data('2026-07-29'),
      description: 'Aluguel, condomínio e iptu (8/61)',
    }
    const real: RealizedTransaction = {
      amountCents: -88_000_0,
      date: data('2026-07-29'),
      description: 'Pagamento de boleto HANNI DAVID IMOVEIS LTDA',
    }

    expect(matchForecast(real, [previsto])?.id).toBe('prev-x')
  })
})
