import { describe, it, expect } from 'vitest'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

/**
 * Em produção o Next troca a mensagem de todo erro lançado por uma server
 * action por um texto genérico em inglês. O padrão
 * `e instanceof Error ? e.message : 'fallback'` mostrava esse texto ao usuário,
 * porque o erro continua sendo um Error — o fallback em pt-BR nunca entrava.
 */
const GENERICO_DO_NEXT =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

describe('mensagemDeErro', () => {
  it('usa o fallback quando o Next ocultou a mensagem em produção', () => {
    expect(mensagemDeErro(new Error(GENERICO_DO_NEXT), 'Erro ao remover')).toBe('Erro ao remover')
  })

  it('mantém a mensagem quando ela chegou ao cliente', () => {
    expect(mensagemDeErro(new Error('Selecione uma conta'), 'Erro')).toBe('Selecione uma conta')
  })

  it('usa o fallback quando o valor lançado não é um Error', () => {
    expect(mensagemDeErro('falhou', 'Erro ao salvar')).toBe('Erro ao salvar')
  })

  it('usa o fallback quando a mensagem é vazia', () => {
    expect(mensagemDeErro(new Error(''), 'Erro ao salvar')).toBe('Erro ao salvar')
  })

  it('usa o fallback em falha de rede do fetch', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'), 'Erro ao salvar')).toBe('Erro ao salvar')
  })
})
