import { describe, it, expect } from 'vitest'
import { FERRAMENTAS_WHATSAPP } from '@/lib/consultor/whatsapp/deps'

describe('FERRAMENTAS_WHATSAPP', () => {
  it('não tem nenhuma ferramenta do tipo sugestão (sem botão no WhatsApp)', () => {
    expect(FERRAMENTAS_WHATSAPP.some((f) => f.tipo === 'sugestao')).toBe(false)
  })

  it('mantém as ferramentas que rodam direto no servidor', () => {
    const nomes = FERRAMENTAS_WHATSAPP.map((f) => f.definicao.name)
    expect(nomes).toContain('lembrar')
    expect(nomes).toContain('buscar_transacoes')
  })
})
