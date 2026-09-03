import { describe, expect, it } from 'vitest'
import { hashCpf, isValidCpf, maskCpf, stripCpf } from '@/lib/openfinance/cpf'

// CPF válido gerado para teste — não pertence a ninguém.
const VALIDO = '52998224725'

describe('isValidCpf', () => {
  it('aceita CPF com dígitos verificadores corretos, com ou sem pontuação', () => {
    expect(isValidCpf(VALIDO)).toBe(true)
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })

  it('recusa dígito verificador errado', () => {
    // Criar consentimento com CPF inválido não devolve só um erro: a tentativa
    // custa uma chamada dentro de um teto regulatório mensal.
    expect(isValidCpf('52998224726')).toBe(false)
  })

  it('recusa a sequência repetida que a fórmula deixa passar', () => {
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('00000000000')).toBe(false)
  })

  it('recusa tamanho errado', () => {
    expect(isValidCpf('529982247')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })
})

describe('maskCpf', () => {
  it('mostra o meio e esconde as pontas', () => {
    expect(maskCpf(VALIDO)).toBe('***.982.247-**')
  })

  it('não aceita mascarar o que não é CPF', () => {
    expect(() => maskCpf('123')).toThrow(/11 dígitos/)
  })
})

describe('hashCpf', () => {
  it('é estável para o mesmo CPF, com ou sem pontuação', () => {
    // O hash é a chave de deduplicação: se variasse com a formatação, o mesmo
    // CPF entraria duas vezes e queimaria cota de reconexão.
    expect(hashCpf('529.982.247-25', 'sal')).toBe(hashCpf(VALIDO, 'sal'))
  })

  it('muda com o salt', () => {
    expect(hashCpf(VALIDO, 'sal-a')).not.toBe(hashCpf(VALIDO, 'sal-b'))
  })

  it('não guarda o CPF em claro dentro do resultado', () => {
    const hash = hashCpf(VALIDO, 'sal')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('982')
  })

  it('recusa salt vazio em vez de gerar hash varrível', () => {
    // Sem salt, o espaço de CPFs é pequeno o bastante para ser enumerado
    // inteiro — o hash deixaria de proteger o que se propõe a proteger.
    expect(() => hashCpf(VALIDO, '')).toThrow(/salt/i)
  })
})

describe('stripCpf', () => {
  it('tira qualquer pontuação', () => {
    expect(stripCpf('529.982.247-25')).toBe(VALIDO)
  })
})
