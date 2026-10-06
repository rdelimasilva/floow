import { describe, it, expect } from 'vitest'
import { passosDoCadastro, resumoDoCadastro, hrefDeNovaConta } from '@/lib/onboarding/primeiros-passos'

const vazio = { tiposDeConta: [], bancosConectados: 0, temLancamento: false, pulados: [] }
const situacoes = (e: Parameters<typeof passosDoCadastro>[0]) =>
  Object.fromEntries(passosDoCadastro(e).map((p) => [p.id, p.situacao]))

describe('passos do cadastro de contas', () => {
  it('usuário novo: nada feito, conectar o banco é o primeiro passo', () => {
    const passos = passosDoCadastro(vazio)
    expect(passos.map((p) => p.id)).toEqual(['banco', 'outros-bancos', 'fora-do-banco', 'lancamentos'])
    expect(resumoDoCadastro(passos)).toEqual({ concluidos: 0, total: 4, atual: 'banco', terminou: false })
  })

  it('o caminho é o Open Finance: nenhum passo manda importar extrato', () => {
    const texto = JSON.stringify(passosDoCadastro(vazio))
    expect(texto).not.toMatch(/ofx|csv|extrato/i)
  })

  it('conectar o banco não pode ser pulado', () => {
    expect(passosDoCadastro(vazio)[0].pular).toBeUndefined()
    expect(situacoes({ ...vazio, pulados: ['banco'] }).banco).toBe('pendente')
  })

  it('uma conexão conclui o primeiro passo; duas, também o de outros bancos', () => {
    expect(situacoes({ ...vazio, bancosConectados: 1 })).toMatchObject({ banco: 'feito', 'outros-bancos': 'pendente' })
    expect(situacoes({ ...vazio, bancosConectados: 2 })).toMatchObject({ banco: 'feito', 'outros-bancos': 'feito' })
  })

  it('dinheiro cadastrado conclui o que fica fora do banco', () => {
    expect(situacoes({ ...vazio, tiposDeConta: ['cash'] })['fora-do-banco']).toBe('feito')
    expect(situacoes({ ...vazio, tiposDeConta: ['checking'] })['fora-do-banco']).toBe('pendente')
  })

  it('feito vence pulado', () => {
    expect(situacoes({ ...vazio, bancosConectados: 2, pulados: ['outros-bancos'] })['outros-bancos']).toBe('feito')
  })

  it('termina com o banco conectado, lançamentos chegando e os opcionais pulados', () => {
    const passos = passosDoCadastro({
      tiposDeConta: ['checking'],
      bancosConectados: 1,
      temLancamento: true,
      pulados: ['outros-bancos', 'fora-do-banco'],
    })
    expect(resumoDoCadastro(passos)).toEqual({ concluidos: 4, total: 4, atual: null, terminou: true })
  })

  it('o link de nova conta leva o tipo e a volta para o guia', () => {
    expect(hrefDeNovaConta('cash')).toBe('/accounts/new?tipo=cash&volta=guia')
  })
})
