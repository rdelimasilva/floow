import { describe, it, expect, vi, beforeEach } from 'vitest'

let rows: unknown[] = []
// Hashes do titular (openfinance_connections.cpf_hash) — vazio por padrão,
// já que nenhum teste aqui exercita `ehCpfProprio`.
let hashRows: unknown[] = []

// withUserDb roda a query sob o RLS do usuário e, para isso, lê cookies — que
// não existem fora de uma requisição. O mock devolve o mesmo fake de getDb, de
// modo que o que se testa aqui continua sendo a lógica da query.
vi.mock('@/lib/db/rls', async () => {
  const { getDb } = await import('@floow/db')
  return { withUserDb: (fn: (db: unknown) => unknown) => fn(getDb()) }
})

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: () => ({
          // Consulta principal (counterparties + leftJoin em accounts).
          leftJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(rows),
            }),
          }),
          // `carregarHashesDoTitular` não faz join nem orderBy.
          where: () => Promise.resolve(hashRows),
        }),
      }),
    }),
  }
})

import { getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'

beforeEach(() => {
  rows = []
  hashRows = []
})

describe('getConfirmedCounterparties', () => {
  it('transferência confirmada traz o nome da conta de destino, via join', async () => {
    rows = [{
      id: 'cp-1',
      displayName: 'Maraisa Ramos',
      nature: 'transfer',
      categoryId: null,
      transferAccountId: 'conta-destino',
      transferAccountName: 'Poupança',
      confirmedAt: new Date('2026-09-01T00:00:00Z'),
    }]

    const [result] = await getConfirmedCounterparties('org-1')

    expect(result.transferAccountId).toBe('conta-destino')
    expect(result.transferAccountName).toBe('Poupança')
  })

  it('receita/despesa confirmada não tem conta de destino', async () => {
    rows = [{
      id: 'cp-2',
      displayName: 'Aluguel',
      nature: 'expense',
      categoryId: 'cat-1',
      transferAccountId: null,
      transferAccountName: null,
      confirmedAt: new Date('2026-09-01T00:00:00Z'),
    }]

    const [result] = await getConfirmedCounterparties('org-1')

    expect(result.transferAccountId).toBeNull()
    expect(result.transferAccountName).toBeNull()
  })

  it('traz a conta onde a regra vale (regra por descrição), para a tela recusar destino igual', async () => {
    rows = [{
      id: 'cp-3',
      displayName: 'RESGATE CDB DI',
      nature: 'transfer',
      categoryId: null,
      transferAccountId: 'xp',
      transferAccountName: 'XP',
      accountId: 'itau',
      confirmedAt: new Date('2026-09-01T00:00:00Z'),
    }]

    const [result] = await getConfirmedCounterparties('org-1')

    expect(result.accountId).toBe('itau')
  })
})
