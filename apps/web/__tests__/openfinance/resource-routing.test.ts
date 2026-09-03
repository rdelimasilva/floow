import { describe, expect, it } from 'vitest'
import { decideResourceRouting } from '@/lib/openfinance/resource-routing'

/**
 * Esta é a regra que separa clientes. O webhook resolve `resource_id -> org_id`
 * por esta tabela e não tem sessão nenhuma para conferir; o caminho do app roda
 * com o role dono do banco, onde o RLS não se aplica. Se a decisão aqui estiver
 * errada, o dado financeiro de um cliente entra no tenant de outro.
 */

describe('decideResourceRouting', () => {
  it('registra o recurso quando ninguém o tem', () => {
    expect(decideResourceRouting(null, 'org-1')).toEqual({ action: 'insert' })
    expect(decideResourceRouting(undefined, 'org-1')).toEqual({ action: 'insert' })
  })

  it('atualiza quando o recurso já é da própria org', () => {
    expect(decideResourceRouting({ id: 'res-1', orgId: 'org-1' }, 'org-1')).toEqual({
      action: 'update',
      resourceId: 'res-1',
    })
  })

  it('recusa quando o recurso é de outra org', () => {
    // O caso que motivou a função. Antes, a segunda org dava UPDATE na linha da
    // primeira: não vazava dado, mas ficava sem recurso nenhum e sem erro.
    expect(decideResourceRouting({ id: 'res-1', orgId: 'org-1' }, 'org-2')).toEqual({
      action: 'conflict',
      ownerOrgId: 'org-1',
    })
  })

  it('nunca devolve update apontando para linha de outra org', () => {
    // Invariante formulada de outro jeito: se a decisão é escrever, a linha é
    // desta org. Vale para qualquer combinação.
    const casos = [
      { existing: null, orgId: 'org-1' },
      { existing: { id: 'a', orgId: 'org-1' }, orgId: 'org-1' },
      { existing: { id: 'b', orgId: 'org-2' }, orgId: 'org-1' },
      { existing: { id: 'c', orgId: '' }, orgId: 'org-1' },
    ]

    for (const caso of casos) {
      const decision = decideResourceRouting(caso.existing, caso.orgId)
      if (decision.action === 'update') {
        expect(caso.existing?.orgId).toBe(caso.orgId)
      }
    }
  })
})
