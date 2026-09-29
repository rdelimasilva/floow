import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { SecaoDeConciliar } from '@/components/finance/secao-de-conciliar'

/**
 * O selo "confirmar?" da linha leva para `/transactions/conciliar#confirmar`.
 * A seção chega por streaming, depois do primeiro paint, quando o navegador
 * já desistiu de rolar até a âncora. A própria seção rola quando monta.
 */

const rolar = vi.fn()

beforeEach(() => {
  rolar.mockClear()
  Element.prototype.scrollIntoView = rolar
})
afterEach(() => { window.location.hash = '' })

describe('rolar até a seção da âncora', () => {
  it('rola até a seção quando o endereço aponta para ela', () => {
    window.location.hash = '#confirmar'

    render(React.createElement(SecaoDeConciliar, { id: 'confirmar', contagem: 1 }, 'fila'))

    expect(rolar).toHaveBeenCalledTimes(1)
    expect(rolar.mock.contexts[0]).toBe(document.getElementById('confirmar'))
  })

  it('não rola quando a âncora é de outra seção', () => {
    window.location.hash = '#repetidos'

    render(React.createElement(SecaoDeConciliar, { id: 'confirmar', contagem: 1 }, 'fila'))

    expect(rolar).not.toHaveBeenCalled()
  })
})
