import { describe, it, expect } from 'vitest'
import { filtrarRegras } from '@/lib/openfinance/filtrar-regras'

const regras = [
  { id: 'a', displayName: 'Resgate CDB DI', transferAccountName: 'XP Corretora' },
  { id: 'b', displayName: 'Pix recebido Fulano', transferAccountName: 'XP Corretora' },
  { id: 'c', displayName: 'Padaria São João', transferAccountName: null },
]

describe('filtrarRegras', () => {
  it('termo vazio devolve tudo', () => {
    expect(filtrarRegras(regras, '  ').map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('ignora maiúsculas e acentos', () => {
    expect(filtrarRegras(regras, 'resgate cdb').map((r) => r.id)).toEqual(['a'])
    expect(filtrarRegras(regras, 'sao joao').map((r) => r.id)).toEqual(['c'])
  })

  it('acha pela conta de destino', () => {
    expect(filtrarRegras(regras, 'xp').map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('sem resultado devolve lista vazia', () => {
    expect(filtrarRegras(regras, 'nubank')).toEqual([])
  })
})
