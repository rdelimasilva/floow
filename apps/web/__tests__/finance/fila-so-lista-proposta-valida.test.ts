import { describe, it, expect, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

/**
 * A janela entre propor e aprovar é aberta por desenho: a fila não bloqueia o
 * app, e nela o usuário pode mexer nas duas pontas do par.
 *
 * O caso que perde dinheiro: proposta (F, R) pendente, o usuário marca R como
 * ignorado na listagem — `toggleIgnoreTransaction` reverte
 * `accounts.balance_cents` em `-amountCents` —, depois vai à fila e clica "É o
 * mesmo". F ganha vínculo e sai do saldo projetado, R já saiu do saldo da
 * conta: o lançamento desaparece dos DOIS saldos, e F exibe o selo
 * "conciliado", cujo título afirma que quem soma é o realizado — e ninguém
 * soma.
 *
 * Defesa em profundidade nas duas pontas: a fila deixa de listar a proposta
 * cuja ponta ficou inelegível (este teste), e `aprovarProposta` reconfere
 * antes de gravar (`aprovar-e-recusar-conciliacao.test.ts`).
 *
 * O mock não tem banco, então o que se prova aqui é a condição montada,
 * renderizada com `PgDialect` — o mesmo recurso de
 * `previsao-sem-proposta-aberta-sql.test.ts`.
 */

const wheres: SQL[] = []

function chain(): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve([]).then(r) }
  for (const m of ['from', 'innerJoin', 'leftJoin', 'orderBy', 'limit']) c[m] = () => chain()
  c.where = (condicao: SQL) => {
    wheres.push(condicao)
    return chain()
  }
  return c
}

const mockDb = { select: () => chain() }

vi.mock('@/lib/db/rls', () => ({
  withUserDb: (fn: (db: unknown) => unknown) => fn(mockDb),
  withUserDbFor: (_userId: string, fn: (db: unknown) => unknown) => fn(mockDb),
}))

const { getPropostasPendentes } = await import('@/lib/finance/forecast-match-queries')

const dialect = new PgDialect()

async function condicaoDaFila() {
  wheres.length = 0
  await getPropostasPendentes('org-1')
  return dialect.sqlToQuery(wheres[0]).sql.toLowerCase()
}

describe('a fila só lista proposta que ainda pode ser aprovada', () => {
  it('filtra pela org e pelas pendentes', async () => {
    const sql = await condicaoDaFila()

    expect(sql).toContain('"forecast_match_proposals"."org_id"')
    expect(sql).toContain('"forecast_match_proposals"."status"')
  })

  it('não lista proposta cujo realizado foi marcado como ignorado', async () => {
    const sql = await condicaoDaFila()

    expect(sql).toContain('"realizado"."is_ignored"')
  })

  it('não lista proposta cuja previsão já ganhou vínculo', async () => {
    const sql = await condicaoDaFila()

    expect(sql).toContain('"previsao"."matched_transaction_id" is null')
  })

  it('não lista proposta cuja previsão virou realizada', async () => {
    const sql = await condicaoDaFila()

    expect(sql).toContain('"previsao"."balance_applied"')
  })
})
