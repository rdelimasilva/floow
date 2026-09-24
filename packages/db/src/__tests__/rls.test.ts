import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withRls, assertRlsEnforced, RlsBypassError } from '../rls'

/**
 * Banco falso que registra o SQL executado, para provar QUE o contexto de RLS é
 * definido e EM QUE ordem — antes do callback, nunca depois.
 */
function fakeDb(rows: unknown[] = []) {
  const executed: string[] = []
  const tx = {
    execute: vi.fn(async (q: unknown) => {
      executed.push(JSON.stringify(q))
      return rows
    }),
  }
  return {
    executed,
    tx,
    transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    execute: vi.fn(async () => rows),
  }
}

const USER = '22222222-2222-2222-2222-222222222222'

describe('withRls', () => {
  it('roda o callback dentro de uma transação', async () => {
    const db = fakeDb()

    await withRls(db as never, USER, async () => 'pronto')

    expect(db.transaction).toHaveBeenCalledOnce()
  })

  it('define o contexto de RLS ANTES de rodar o callback', async () => {
    const db = fakeDb()
    let sqlAntesDoCallback = 0

    await withRls(db as never, USER, async () => {
      sqlAntesDoCallback = db.executed.length
      return null
    })

    // role + claims numa instrução só: cada instrução é uma ida ao banco, e
    // esta roda em toda leitura sob RLS do app.
    expect(sqlAntesDoCallback).toBe(1)
    expect(db.executed[0]).toContain('request.jwt.claims')
    expect(db.executed[0]).toContain("'role'")
  })

  it('assume o papel authenticated e injeta o sub nas claims', async () => {
    const db = fakeDb()

    await withRls(db as never, USER, async () => null)

    const todo = db.executed.join(' ')
    expect(todo).toContain('authenticated')
    expect(todo).toContain(USER)
    // O contexto precisa ser local à transação, senão vaza para a próxima
    // requisição que pegar a mesma conexão do pooler.
    expect(todo).toContain('true')
  })

  it('devolve o valor do callback', async () => {
    const db = fakeDb()

    await expect(withRls(db as never, USER, async () => 42)).resolves.toBe(42)
  })

  it('recusa userId vazio em vez de rodar sem contexto', async () => {
    const db = fakeDb()

    await expect(withRls(db as never, '', async () => null)).rejects.toThrow(/userId/)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('recusa userId que não seja uuid — a claim vai crua para dentro do SQL', async () => {
    const db = fakeDb()

    await expect(
      withRls(db as never, "not-a-uuid'; drop table x; --", async () => null),
    ).rejects.toThrow(/uuid/i)
    expect(db.transaction).not.toHaveBeenCalled()
  })
})

describe('assertRlsEnforced', () => {
  it('passa quando a conexão não ignora RLS', async () => {
    const db = fakeDb([{ current_user: 'floow_app', bypassrls: false, owns_tables: false }])

    await expect(assertRlsEnforced(db as never)).resolves.toBeUndefined()
  })

  it('falha quando o papel tem BYPASSRLS', async () => {
    const db = fakeDb([{ current_user: 'postgres', bypassrls: true, owns_tables: false }])

    await expect(assertRlsEnforced(db as never)).rejects.toThrow(RlsBypassError)
  })

  it('falha quando o papel é dono das tabelas — dono ignora RLS sem FORCE', async () => {
    const db = fakeDb([{ current_user: 'postgres', bypassrls: false, owns_tables: true }])

    await expect(assertRlsEnforced(db as never)).rejects.toThrow(RlsBypassError)
  })

  it('a mensagem diz qual papel está conectado', async () => {
    const db = fakeDb([{ current_user: 'postgres', bypassrls: true, owns_tables: true }])

    await expect(assertRlsEnforced(db as never)).rejects.toThrow(/postgres/)
  })
})
