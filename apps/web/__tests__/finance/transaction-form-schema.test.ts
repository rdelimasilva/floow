import { describe, it, expect } from 'vitest'
import { transactionFormSchema } from '@/components/finance/transaction-form-schema'

/**
 * O formulário descartava em silêncio valor zero (`if (amountCents <= 0)
 * return`) e mandava "NaN" ao servidor quando o texto não era número — o
 * usuário clicava em Registrar e nada acontecia. A validação agora fica no
 * schema, que mostra a mensagem embaixo do campo.
 */
const CONTA_A = '11111111-1111-4111-8111-111111111111'
const CONTA_B = '22222222-2222-4222-8222-222222222222'

function validar(sobrescrever: Record<string, unknown>) {
  return transactionFormSchema.safeParse({
    type: 'expense',
    accountId: CONTA_A,
    amountRaw: '150,75',
    description: 'Mercado',
    date: '2026-09-25',
    ...sobrescrever,
  })
}

function mensagemDo(campo: string, resultado: ReturnType<typeof validar>) {
  if (resultado.success) return undefined
  return resultado.error.issues.find((i) => i.path[0] === campo)?.message
}

describe('transactionFormSchema — valor', () => {
  it('aceita valor em formato brasileiro', () => {
    expect(validar({ amountRaw: '1.234,56' }).success).toBe(true)
  })

  it('recusa zero com mensagem no campo', () => {
    expect(mensagemDo('amountRaw', validar({ amountRaw: '0,00' }))).toMatch(/maior que zero/)
  })

  it('recusa texto que não é número', () => {
    expect(mensagemDo('amountRaw', validar({ amountRaw: 'abc' }))).toMatch(/maior que zero/)
  })
})

describe('transactionFormSchema — transferência', () => {
  it('recusa destino igual à origem', () => {
    const r = validar({ type: 'transfer', transferToAccountId: CONTA_A })
    expect(mensagemDo('transferToAccountId', r)).toMatch(/diferente da conta de origem/)
  })

  it('aceita destino diferente da origem', () => {
    expect(validar({ type: 'transfer', transferToAccountId: CONTA_B }).success).toBe(true)
  })
})

/**
 * Um dígito a mais no ano ("20226") passava e gravava um lançamento no ano
 * 20226, fora de qualquer filtro de período.
 */
describe('transactionFormSchema — data', () => {
  it('recusa ano fora do razoável', () => {
    expect(mensagemDo('date', validar({ date: '20226-09-25' }))).toMatch(/Data inválida/)
    expect(mensagemDo('date', validar({ date: '1899-12-31' }))).toMatch(/Data inválida/)
  })

  it('aceita data comum, inclusive futura', () => {
    expect(validar({ date: '2027-01-10' }).success).toBe(true)
  })
})
