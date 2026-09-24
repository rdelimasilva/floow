import { getTableName } from 'drizzle-orm'

export interface FakeOp { op: 'select' | 'update' | 'insert' | 'delete'; table: string; set?: Record<string, unknown>; values?: unknown }

/**
 * Tx falso no estilo de `counterparty-actions-par.test.ts`: cada `select`
 * consome a próxima resposta de `selects`, e toda escrita fica em `ops`.
 */
export function fakeTx(selects: unknown[][]) {
  const ops: FakeOp[] = []
  const chain = (result: unknown[], op?: FakeOp): any => {
    const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
    for (const m of ['from', 'where', 'limit', 'orderBy', 'innerJoin', 'leftJoin', 'returning', 'onConflictDoNothing']) c[m] = () => chain(result, op)
    c.set = (payload: Record<string, unknown>) => { if (op) op.set = payload; return chain(result, op) }
    return c
  }
  const tx: any = {
    select: () => { const op: FakeOp = { op: 'select', table: '' }; ops.push(op); return { from: (t: any) => { op.table = getTableName(t); return chain(selects.shift() ?? [], op) } } },
    update: (t: any) => { const op: FakeOp = { op: 'update', table: getTableName(t) }; ops.push(op); return chain([], op) },
    insert: (t: any) => ({ values: (v: unknown) => { ops.push({ op: 'insert', table: getTableName(t), values: v }); return chain([{ id: 'nova' }]) } }),
    delete: (t: any) => { const op: FakeOp = { op: 'delete', table: getTableName(t) }; ops.push(op); return chain([], op) },
  }
  return { tx, ops }
}
