import { describe, it, expect } from 'vitest'
import { escolherOrgDoWhatsApp, dividirMensagem, MAX_PARTE } from '@/lib/consultor/whatsapp/puras'

describe('escolherOrgDoWhatsApp', () => {
  it('org escolhida da qual ainda é membro', () => {
    expect(escolherOrgDoWhatsApp(['a', 'b'], 'b')).toEqual({ tipo: 'ok', orgId: 'b' })
  })
  it('uma org só, sem escolha', () => {
    expect(escolherOrgDoWhatsApp(['a'], null)).toEqual({ tipo: 'ok', orgId: 'a' })
  })
  it('várias orgs sem escolha', () => {
    expect(escolherOrgDoWhatsApp(['a', 'b'], null)).toEqual({ tipo: 'escolher' })
  })
  it('escolhida da qual saiu cai na regra de org vazia', () => {
    expect(escolherOrgDoWhatsApp(['a'], 'x')).toEqual({ tipo: 'ok', orgId: 'a' })
    expect(escolherOrgDoWhatsApp(['a', 'b'], 'x')).toEqual({ tipo: 'escolher' })
  })
  it('nenhuma org', () => {
    expect(escolherOrgDoWhatsApp([], null)).toEqual({ tipo: 'sem-org' })
  })
})

describe('dividirMensagem', () => {
  it('texto curto vira uma parte', () => {
    expect(dividirMensagem('oi')).toEqual(['oi'])
  })
  it('junta parágrafos até o limite e quebra entre parágrafos', () => {
    const p = 'a'.repeat(30)
    expect(dividirMensagem([p, p, p].join('\n\n'), 70)).toEqual([`${p}\n\n${p}`, p])
  })
  it('parágrafo maior que o limite é cortado em pedaços', () => {
    const partes = dividirMensagem('b'.repeat(9000))
    expect(partes.every((x) => x.length <= MAX_PARTE)).toBe(true)
    expect(partes.join('')).toBe('b'.repeat(9000))
  })
  it('texto vazio não gera parte', () => {
    expect(dividirMensagem('   ')).toEqual([])
  })
})
