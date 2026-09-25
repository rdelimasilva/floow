import { describe, it, expect } from 'vitest'
import { temRecorte } from '@/lib/finance/tem-recorte'

describe('temRecorte', () => {
  it('filtro que esconde lançamentos conta', () => {
    expect(temRecorte(new URLSearchParams('search=mercado'))).toBe(true)
    expect(temRecorte(new URLSearchParams('accountId=a1'))).toBe(true)
  })

  it('ordenação e paginação não escondem nada', () => {
    expect(temRecorte(new URLSearchParams('sortBy=date&sortDir=asc&page=2&pageSize=50'))).toBe(false)
  })
})
