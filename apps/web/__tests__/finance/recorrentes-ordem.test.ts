import { describe, it, expect } from 'vitest'
import { ordenarPorProximaParcela } from '@/lib/finance/ordenar-recorrencias'

/**
 * A seção "Próximas a vencer" repetia a coluna "Próxima parcela" da tabela,
 * só que cortada em 30 dias. Saiu; no lugar, a tabela já abre com o que vence
 * primeiro no topo (revisão de 20/10/2026).
 */
const base = { isActive: true }

describe('ordem das recorrências', () => {
  it('ativas pela próxima parcela; sem parcela em aberto depois; pausadas no fim', () => {
    const lista = ordenarPorProximaParcela([
      { ...base, id: 'pausada', isActive: false, proximaParcela: '2026-10-21' },
      { ...base, id: 'acabou', proximaParcela: null },
      { ...base, id: 'tim', proximaParcela: '2026-10-22' },
      { ...base, id: 'livelo', proximaParcela: '2026-10-20' },
      { ...base, id: 'longe', proximaParcela: '2027-03-01' },
    ])
    expect(lista.map((t) => t.id)).toEqual(['livelo', 'tim', 'longe', 'acabou', 'pausada'])
  })

  it('não altera a lista recebida', () => {
    const original = [
      { ...base, id: 'b', proximaParcela: '2026-11-01' },
      { ...base, id: 'a', proximaParcela: '2026-10-01' },
    ]
    ordenarPorProximaParcela(original)
    expect(original.map((t) => t.id)).toEqual(['b', 'a'])
  })
})
