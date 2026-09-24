import { describe, it, expect } from 'vitest'
import { concluiAoAbrir, decidirAutoVinculo, diaSeguinte, elegivelAoAutoVinculo, semDestinos } from '@/lib/openfinance/auto-vinculo'

/**
 * A conexão guiada escolhe o destino ANTES da autorização, quando os recursos
 * ainda não existem. Depois, esta decisão aplica a escolha — e só quando não há
 * o que adivinhar: um recurso por tipo. Vincular a conta errada mistura dois
 * históricos, então ambiguidade volta para a tela manual.
 */

const NADA = {
  targetAccountId: null,
  targetCardAccountId: null,
  targetAccountNewName: null,
  targetCardNewName: null,
}

const conta = (id: string, accountId: string | null = null) => ({ id, resourceType: 'ACCOUNT', accountId })
const cartao = (id: string, accountId: string | null = null) => ({
  id,
  resourceType: 'CREDIT_CARD_ACCOUNT',
  accountId,
})

describe('decidirAutoVinculo', () => {
  it('sem destinos guardados (conexão antiga): não faz nada', () => {
    const d = decidirAutoVinculo(NADA, [conta('r1')], {})
    expect(d.legado).toBe(true)
    expect(d.vinculos).toEqual([])
    expect(d.ambiguos).toEqual([])
    expect(d.faltando).toEqual([])
  })

  it('um recurso por tipo: vincula cada um ao seu destino', () => {
    const d = decidirAutoVinculo(
      { ...NADA, targetAccountId: 'acc-1', targetCardNewName: 'Itaú · Cartão' },
      [conta('r1'), cartao('r2')],
      {},
    )
    expect(d.legado).toBe(false)
    expect(d.vinculos).toEqual([
      { resourceId: 'r1', resourceType: 'ACCOUNT', target: { kind: 'existing', accountId: 'acc-1' }, syncFromDate: null },
      { resourceId: 'r2', resourceType: 'CREDIT_CARD_ACCOUNT', target: { kind: 'new', name: 'Itaú · Cartão' }, syncFromDate: null },
    ])
  })

  it('conta existente: importa a partir do dia seguinte à última transação', () => {
    const d = decidirAutoVinculo({ ...NADA, targetAccountId: 'acc-1' }, [conta('r1')], {
      'acc-1': '2026-08-31',
    })
    expect(d.vinculos[0].syncFromDate).toBe('2026-09-01')
  })

  it('conta nova: histórico completo (sem corte)', () => {
    const d = decidirAutoVinculo({ ...NADA, targetAccountNewName: 'Itaú · Conta' }, [conta('r1')], {
      'acc-1': '2026-08-31',
    })
    expect(d.vinculos[0].syncFromDate).toBeNull()
  })

  it('dois recursos do mesmo tipo: ambíguo, não adivinha', () => {
    const d = decidirAutoVinculo(
      { ...NADA, targetAccountId: 'acc-1', targetCardAccountId: 'cc-1' },
      [conta('r1'), conta('r2'), cartao('r3')],
      {},
    )
    expect(d.ambiguos).toEqual(['ACCOUNT'])
    expect(d.vinculos.map((v) => v.resourceId)).toEqual(['r3'])
  })

  it('nenhum recurso do tipo escolhido: fica faltando', () => {
    const d = decidirAutoVinculo({ ...NADA, targetCardAccountId: 'cc-1' }, [conta('r1')], {})
    expect(d.faltando).toEqual(['CREDIT_CARD_ACCOUNT'])
    expect(d.vinculos).toEqual([])
  })

  it('recurso já vinculado: pula, nunca sobrescreve', () => {
    const d = decidirAutoVinculo({ ...NADA, targetAccountId: 'acc-1' }, [conta('r1', 'outra')], {})
    expect(d.vinculos).toEqual([])
    expect(d.ambiguos).toEqual([])
    expect(d.faltando).toEqual([])
  })

  it('um vinculado e um livre do mesmo tipo: vincula o livre', () => {
    const d = decidirAutoVinculo({ ...NADA, targetAccountId: 'acc-1' }, [conta('r1', 'outra'), conta('r2')], {})
    expect(d.vinculos.map((v) => v.resourceId)).toEqual(['r2'])
  })

  it('a conta de destino já espelha um recurso desta conexão: pula', () => {
    const d = decidirAutoVinculo({ ...NADA, targetAccountId: 'acc-1' }, [conta('r1', 'acc-1'), conta('r2')], {})
    expect(d.vinculos).toEqual([])
  })

  it('tipo sem destino é ignorado', () => {
    const d = decidirAutoVinculo({ ...NADA, targetAccountId: 'acc-1' }, [conta('r1'), cartao('r2'), cartao('r3')], {})
    expect(d.vinculos.map((v) => v.resourceId)).toEqual(['r1'])
    expect(d.ambiguos).toEqual([])
  })
})

describe('diaSeguinte', () => {
  it('vira o mês e o ano', () => {
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01')
    expect(diaSeguinte('2028-02-28')).toBe('2028-02-29')
  })
})

describe('semDestinos', () => {
  it('só é legado com as quatro colunas vazias', () => {
    expect(semDestinos(NADA)).toBe(true)
    expect(semDestinos({ ...NADA, targetCardNewName: 'x' })).toBe(false)
  })
})

describe('elegivelAoAutoVinculo', () => {
  it('com destino guardado: sim', () => {
    expect(elegivelAoAutoVinculo({ ...NADA, targetAccountId: 'a' }, ['ACCOUNT'])).toBe(true)
  })
  it('só investimentos, sem destino: sim (a primeira importação também é automática)', () => {
    expect(elegivelAoAutoVinculo(NADA, ['INVESTMENTS'])).toBe(true)
  })
  it('sem destino e sem investimentos (conexão antiga): não', () => {
    expect(elegivelAoAutoVinculo(NADA, ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'])).toBe(false)
  })
})

describe('concluiAoAbrir (volta por redirecionamento na mesma aba)', () => {
  const guiada = { ...NADA, targetAccountId: 'a', products: ['ACCOUNT'], autoLinkDoneAt: null, status: 'AUTHORISED' }
  it('autorizada e pendente: conclui ao abrir a tela', () => {
    expect(concluiAoAbrir(guiada)).toBe(true)
  })
  it('ainda aguardando no floow (o status só muda quando alguém relê): conclui', () => {
    expect(concluiAoAbrir({ ...guiada, status: 'AWAITING_AUTHORIZATION' })).toBe(true)
  })
  it('já concluída: não', () => {
    expect(concluiAoAbrir({ ...guiada, autoLinkDoneAt: new Date() })).toBe(false)
  })
  it('recusada ou expirada: não', () => {
    expect(concluiAoAbrir({ ...guiada, status: 'REJECTED' })).toBe(false)
    expect(concluiAoAbrir({ ...guiada, status: 'EXPIRED' })).toBe(false)
  })
  it('conexão antiga (sem destino, sem investimentos): não', () => {
    expect(concluiAoAbrir({ ...guiada, targetAccountId: null })).toBe(false)
  })
})
