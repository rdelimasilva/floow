import { describe, it, expect } from 'vitest'
import { avisoDeDataFutura } from '@/lib/finance/aviso-de-data'

describe('avisoDeDataFutura', () => {
  it('avisa quando a data é depois de hoje', () => {
    expect(avisoDeDataFutura('2026-10-02', '2026-09-25')).toMatch(/futuro/)
  })
  it('hoje e passado não avisam', () => {
    expect(avisoDeDataFutura('2026-09-25', '2026-09-25')).toBeNull()
    expect(avisoDeDataFutura('2026-01-01', '2026-09-25')).toBeNull()
  })
  it('campo vazio não avisa', () => {
    expect(avisoDeDataFutura('', '2026-09-25')).toBeNull()
  })
})
