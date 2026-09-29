import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { criarPropostasDeDuplicata } from '@/lib/finance/duplicata-db'

/**
 * R2 é extrato × extrato. A linha que aguarda o extrato (ou que ele já
 * absorveu) nunca é duplicata do extrato que a absorve — propor o par
 * poria na fila, como "duplicata", o lançamento que o motor acabou de
 * conciliar.
 */
const wheres: SQL[] = []
function chain(): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve([]).then(r) }
  c.from = () => c
  c.where = (w: SQL) => { wheres.push(w); return c }
  return c
}

describe('criarPropostasDeDuplicata fora do aguardando', () => {
  it('nem a candidata nem a irmã podem estar aguardando o extrato', async () => {
    await criarPropostasDeDuplicata({ select: () => chain() } as never, 'org-1', 'nubank')
    const q = new PgDialect().sqlToQuery(wheres[0]).sql.toLowerCase()
    expect(q).toContain('"aguarda_extrato" = ')
    expect(q).toContain('irma.aguarda_extrato = false')
  })
})
