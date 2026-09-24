import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { formatarDia } from '@/lib/formatar-dia'
import { formatDate } from '@/components/finance/transaction-list-types'

// O navegador de quem usa o app está em Brasília. Coluna `date` do Postgres
// chega como Date à meia-noite UTC — que em UTC-3 é 21h do dia ANTERIOR.
let tzOriginal: string | undefined
beforeAll(() => {
  tzOriginal = process.env.TZ
  process.env.TZ = 'America/Sao_Paulo'
})
afterAll(() => {
  process.env.TZ = tzOriginal
})

describe('formatarDia', () => {
  it('mostra o dia gravado no banco, não o anterior', () => {
    expect(formatarDia(new Date('2026-09-13'))).toBe('13/09/2026')
  })

  it('aceita a string ISO que atravessa a fronteira server→client', () => {
    expect(formatarDia('2026-09-13T00:00:00.000Z')).toBe('13/09/2026')
  })

  it('mês de um snapshot do dia 1º não cai no mês anterior', () => {
    expect(formatarDia(new Date('2026-09-01'), { month: 'short', year: '2-digit' })).toMatch(/set/)
  })
})

describe('formatDate da lista de transações', () => {
  it('bate com o dia da coluna date', () => {
    expect(formatDate(new Date('2026-09-13'))).toBe('13/09/2026')
  })
})
