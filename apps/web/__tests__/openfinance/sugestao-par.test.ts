import { describe, it, expect } from 'vitest'
import { sugerirContaDoPar } from '@/lib/openfinance/sugestao-par'

const pix = { accountId: 'itau', amountCents: 9552, date: '2025-10-03' }

describe('sugerirContaDoPar', () => {
  it('acha o lançamento espelhado em outra conta a até 3 dias', () => {
    expect(sugerirContaDoPar(pix, [{ accountId: 'nu', amountCents: -9552, date: '2025-10-05' }])).toBe('nu')
  })
  it('ignora a própria conta, valor diferente e mais de 3 dias', () => {
    expect(sugerirContaDoPar(pix, [
      { accountId: 'itau', amountCents: -9552, date: '2025-10-03' },
      { accountId: 'nu', amountCents: -9553, date: '2025-10-03' },
      { accountId: 'nu', amountCents: -9552, date: '2025-10-07' },
    ])).toBeNull()
  })
  it('duas contas candidatas: não sugere', () => {
    expect(sugerirContaDoPar(pix, [
      { accountId: 'nu', amountCents: -9552, date: '2025-10-03' },
      { accountId: 'xp', amountCents: -9552, date: '2025-10-04' },
    ])).toBeNull()
  })
})
