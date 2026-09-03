import { describe, expect, it } from 'vitest'
import { PolpApiError } from '@floow/core-finance'
import { describePolpError } from '@/lib/openfinance/errors'

/**
 * Cada status da Polp aponta para um lugar diferente, e três deles não são
 * problema do usuário. "respondeu 402" na tela não diz a ninguém se o caso é o
 * CPF, a credencial, o banco fora do ar ou a nossa assinatura.
 */

function erro(status: number, body = '', retryAfter: number | null = null) {
  return new PolpApiError(`Polp respondeu ${status}`, status, body, retryAfter)
}

describe('describePolpError', () => {
  it('aponta a assinatura no 402, que é a operação cobrada', () => {
    expect(describePolpError(erro(402))).toMatch(/plano ativo/i)
  })

  it('manda falar com o suporte quando a credencial é recusada', () => {
    // Nada que o usuário final possa resolver sozinho.
    expect(describePolpError(erro(401))).toMatch(/credenciais/i)
    expect(describePolpError(erro(403))).toMatch(/credenciais/i)
  })

  it('pede para conferir o CPF no 422', () => {
    expect(describePolpError(erro(422))).toMatch(/CPF/)
  })

  it('diz quanto esperar no 429, quando a API informa', () => {
    // O limite é por credencial, compartilhado por todos os clientes do floow:
    // esperar é a única saída correta.
    expect(describePolpError(erro(429, '', 42))).toContain('42 segundos')
    expect(describePolpError(erro(429))).toMatch(/alguns instantes/i)
  })

  it('trata 5xx como indisponibilidade, não como erro do usuário', () => {
    expect(describePolpError(erro(503))).toMatch(/indispon/i)
  })

  it('aproveita a mensagem que a Polp mandar', () => {
    const texto = describePolpError(erro(402, JSON.stringify({ message: 'Plano expirado' })))
    expect(texto).toContain('Plano expirado')
  })

  it('ignora corpo grande que poluiria o aviso', () => {
    const texto = describePolpError(erro(500, 'x'.repeat(5000)))
    expect(texto.length).toBeLessThan(200)
  })

  it('não engasga com erro que não é da Polp', () => {
    expect(describePolpError(new Error('rede caiu'))).toBe('rede caiu')
    expect(describePolpError('coisa estranha')).toMatch(/banco agora/i)
  })
})
