import { describe, it, expect, vi } from 'vitest'
import { registrarSaldoDoBanco } from '@/lib/openfinance/conferir-saldo'

/**
 * Guardar o saldo que o banco informa, para conferir com o nosso.
 *
 * O floow deriva `accounts.balance_cents` somando lancamento e nunca o
 * conferiu com a fonte. Quando a Polp reemitiu um pagamento com outro
 * `external_id`, R$ 11.685,40 entraram duas vezes e o erro so apareceu tres
 * dias depois, quando o usuario abriu o extrato.
 *
 * O ponto desta peca e nao depender de saber qual foi o defeito: duplicata,
 * lancamento faltando ou erro nosso, qualquer um faz os dois numeros
 * divergirem.
 */

/** `update` encadeado ate `.where()`, guardando o que foi gravado. */
function dbFalso() {
  const gravado: Array<Record<string, unknown>> = []
  const db = {
    update: () => ({
      set: (valores: Record<string, unknown>) => ({
        where: async () => {
          gravado.push(valores)
        },
      }),
    }),
  }
  return { db, gravado }
}

const RECURSO = { id: 'res-1', polpResourceId: 'polp-1', resourceType: 'ACCOUNT' }

describe('registrarSaldoDoBanco', () => {
  it('grava o saldo e a apuração que o banco informou', async () => {
    const { db, gravado } = dbFalso()
    const client = {
      getResourceDetail: vi.fn().mockResolvedValue({
        balance: {
          update_date_time: '2026-09-22T07:14:13Z',
          available_amount: { amount: '6151.18', currency: 'BRL' },
        },
      }),
    }

    await registrarSaldoDoBanco(db as never, client as never, RECURSO)

    expect(client.getResourceDetail).toHaveBeenCalledWith('ACCOUNT', 'polp-1')
    expect(gravado).toHaveLength(1)
    expect(gravado[0].bankBalanceCents).toBe(615118)
    expect(gravado[0].bankBalanceAt).toEqual(new Date('2026-09-22T07:14:13Z'))
  })

  it('não grava nada para cartão de crédito, que não tem saldo', async () => {
    // Saldo de cartao e outra pergunta (fatura x limite usado). Gravar zero
    // fingiria uma conferencia que nunca houve.
    const { db, gravado } = dbFalso()
    const client = {
      getResourceDetail: vi.fn().mockResolvedValue({ limits: [{ used_amount: { amount: '12300.13' } }] }),
    }

    await registrarSaldoDoBanco(db as never, client as never, { ...RECURSO, resourceType: 'CREDIT_CARD_ACCOUNT' })

    expect(gravado).toHaveLength(0)
  })

  it('falha da API não derruba a sincronização', async () => {
    // O dado do extrato ja entrou quando esta funcao roda. Deixar a conferencia
    // estourar perderia a importacao inteira por causa do controle dela.
    const { db, gravado } = dbFalso()
    const client = { getResourceDetail: vi.fn().mockRejectedValue(new Error('Polp respondeu 503')) }

    await expect(registrarSaldoDoBanco(db as never, client as never, RECURSO)).resolves.toBeUndefined()
    expect(gravado).toHaveLength(0)
  })

  it('grava o saldo mesmo quando a data de apuração não veio', async () => {
    // O saldo vale a conferencia; a data so diz o quao fresco ele e.
    const { db, gravado } = dbFalso()
    const client = {
      getResourceDetail: vi.fn().mockResolvedValue({ balance: { available_amount: { amount: '100.00' } } }),
    }

    await registrarSaldoDoBanco(db as never, client as never, RECURSO)

    expect(gravado[0].bankBalanceCents).toBe(10000)
    expect(gravado[0].bankBalanceAt).toBeNull()
  })
})
