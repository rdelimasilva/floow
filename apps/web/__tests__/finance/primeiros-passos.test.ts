import { describe, it, expect } from 'vitest'
import { passosDoCadastro, resumoDoCadastro, hrefDeNovaConta } from '@/lib/onboarding/primeiros-passos'

const vazio = { tiposDeConta: [], temConexao: false, temLancamento: false, pulados: [] }

describe('passos do cadastro de contas', () => {
  it('usuário novo: nada feito, o primeiro passo é o atual', () => {
    const passos = passosDoCadastro(vazio)
    expect(passos.map((p) => p.id)).toEqual(['banco', 'corrente', 'cartao', 'reservas', 'lancamentos'])
    expect(passos.every((p) => p.situacao === 'pendente')).toBe(true)
    expect(resumoDoCadastro(passos)).toEqual({ concluidos: 0, total: 5, atual: 'banco', terminou: false })
  })

  it('cada tipo de conta cadastrado conclui o passo dele', () => {
    const passos = passosDoCadastro({ ...vazio, tiposDeConta: ['credit_card', 'brokerage'] })
    const por = Object.fromEntries(passos.map((p) => [p.id, p.situacao]))
    expect(por).toMatchObject({ cartao: 'feito', reservas: 'feito', corrente: 'pendente' })
  })

  it('poupança e dinheiro também contam como reservas', () => {
    for (const tipo of ['savings', 'cash'] as const) {
      const passos = passosDoCadastro({ ...vazio, tiposDeConta: [tipo] })
      expect(passos.find((p) => p.id === 'reservas')?.situacao).toBe('feito')
    }
  })

  it('pular só vale para passo opcional', () => {
    const passos = passosDoCadastro({ ...vazio, pulados: ['banco', 'cartao', 'corrente', 'lancamentos'] })
    const por = Object.fromEntries(passos.map((p) => [p.id, p.situacao]))
    expect(por).toEqual({
      banco: 'pulado',
      corrente: 'pendente',
      cartao: 'pulado',
      reservas: 'pendente',
      lancamentos: 'pendente',
    })
    expect(resumoDoCadastro(passos).atual).toBe('corrente')
  })

  it('feito vence pulado: quem pulou o cartão e depois cadastrou vê feito', () => {
    const passos = passosDoCadastro({ ...vazio, tiposDeConta: ['credit_card'], pulados: ['cartao'] })
    expect(passos.find((p) => p.id === 'cartao')?.situacao).toBe('feito')
  })

  it('termina quando tudo está feito ou pulado', () => {
    const passos = passosDoCadastro({
      tiposDeConta: ['checking'],
      temConexao: true,
      temLancamento: true,
      pulados: ['cartao', 'reservas'],
    })
    expect(resumoDoCadastro(passos)).toEqual({ concluidos: 5, total: 5, atual: null, terminou: true })
  })

  it('o link de nova conta leva o tipo e a volta para o guia', () => {
    expect(hrefDeNovaConta('credit_card')).toBe('/accounts/new?tipo=credit_card&volta=guia')
  })
})
