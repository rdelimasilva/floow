import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/consultor/memorias', () => ({ gravarMemoria: vi.fn(), apagarMemoria: vi.fn() }))

import { gravarMemoria, apagarMemoria } from '@/lib/consultor/memorias'
import { lembrar, esquecer, pareceSensivel } from '@/lib/consultor/ferramentas/memoria'
import { ParametroInvalido } from '@/lib/consultor/ferramentas/tipos'

const ctx = { orgId: 'org-1', userId: 'u1', canal: 'whatsapp' as const }
const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => vi.clearAllMocks())

describe('pareceSensivel', () => {
  it.each([
    ['meu cpf é 123.456.789-00', true],
    ['cartão 4111 1111 1111 1111', true],
    ['a SENHA do banco é x', true],
    ['quer juntar R$ 1.500.000,00 até 2030', false],
    ['prefere resposta curta', false],
  ])('%s → %s', (texto, esperado) => {
    expect(pareceSensivel(texto)).toBe(esperado)
  })
})

describe('lembrar', () => {
  it('grava com org, usuário e canal do contexto', async () => {
    expect(await lembrar.executar!(ctx, { fato: 'quer quitar o cartão até dezembro' })).toBe('Anotado.')
    expect(gravarMemoria).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'u1', canal: 'whatsapp', conteudo: 'quer quitar o cartão até dezembro' })
  })

  it('recusa dado sensível sem gravar', async () => {
    await expect(lembrar.executar!(ctx, { fato: 'cpf 12345678900' })).rejects.toThrow(ParametroInvalido)
    expect(gravarMemoria).not.toHaveBeenCalled()
  })

  it('fato vazio ou com mais de 300 caracteres é parâmetro inválido', async () => {
    await expect(lembrar.executar!(ctx, { fato: '   ' })).rejects.toThrow(ParametroInvalido)
    await expect(lembrar.executar!(ctx, { fato: 'a'.repeat(301) })).rejects.toThrow(ParametroInvalido)
    expect(gravarMemoria).not.toHaveBeenCalled()
  })

  it('é do tipo memoria (roda no servidor)', () => {
    expect(lembrar.tipo).toBe('memoria')
    expect(esquecer.tipo).toBe('memoria')
  })
})

describe('esquecer', () => {
  it('apaga a memória do usuário', async () => {
    vi.mocked(apagarMemoria).mockResolvedValue(true)
    expect(await esquecer.executar!(ctx, { id: ID })).toBe('Esquecido.')
    expect(apagarMemoria).toHaveBeenCalledWith('org-1', 'u1', ID)
  })

  it('id que não é deste usuário/org vira parâmetro inválido', async () => {
    vi.mocked(apagarMemoria).mockResolvedValue(false)
    await expect(esquecer.executar!(ctx, { id: ID })).rejects.toThrow(ParametroInvalido)
  })

  it('id que não é uuid nem chega ao banco', async () => {
    await expect(esquecer.executar!(ctx, { id: 'm1' })).rejects.toThrow(ParametroInvalido)
    expect(apagarMemoria).not.toHaveBeenCalled()
  })
})
