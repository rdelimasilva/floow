import { describe, it, expect } from 'vitest'
import { comConta, contaDaUrl } from '@/lib/investments/conta-na-url'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('conta na URL de Investimentos', () => {
  it('mantém só ids válidos', () => {
    expect(contaDaUrl(`${A},lixo,${B}`)).toBe(`${A},${B}`)
    expect(contaDaUrl(undefined)).toBe('')
  })

  it('acrescenta accountId, respeitando query existente', () => {
    expect(comConta('/investments', A)).toBe(`/investments?accountId=${A}`)
    expect(comConta('/investments/x/edit?voltar=ativo', A)).toBe(`/investments/x/edit?voltar=ativo&accountId=${A}`)
    expect(comConta('/investments', 'lixo')).toBe('/investments')
  })
})
