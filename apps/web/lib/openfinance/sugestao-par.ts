import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'

type Db = ReturnType<typeof getDb>
type Linha = { accountId: string; amountCents: number; date: string }

const JANELA_DIAS = 3
const DIA_MS = 86_400_000

const dia = (d: string) => Date.parse(d.slice(0, 10))

/**
 * A conta do outro lado de um Pix para o próprio CPF, quando dá para saber:
 * lançamento de sinal oposto, mesmo valor, até 3 dias, em outra conta. Se
 * duas contas servem, não sugere: errar aqui cria par cruzado (spec §6.2).
 */
export function sugerirContaDoPar(item: Linha, candidatos: Linha[]): string | null {
  const contas = new Set<string>()
  for (const c of candidatos) {
    if (c.accountId === item.accountId) continue
    if (c.amountCents !== -item.amountCents) continue
    if (Math.abs(dia(c.date) - dia(item.date)) > JANELA_DIAS * DIA_MS) continue
    contas.add(c.accountId)
  }
  return contas.size === 1 ? [...contas][0] : null
}

/** Os lançamentos que podem ser o outro lado, numa consulta só. */
export async function carregarCandidatosDePar(
  db: Pick<Db, 'select'>,
  orgId: string,
  itens: { amountCents: number; date: string }[],
): Promise<Linha[]> {
  if (itens.length === 0) return []
  const datas = itens.map((i) => dia(i.date))
  // Coluna `date` é `mode: 'date'` (Date no driver, não string) — mesma
  // convenção de forecast-match-db.ts para a mesma janela de dias.
  const de = new Date(Math.min(...datas) - JANELA_DIAS * DIA_MS)
  const ate = new Date(Math.max(...datas) + JANELA_DIAS * DIA_MS)
  const rows = await db
    .select({ accountId: transactions.accountId, amountCents: transactions.amountCents, date: transactions.date })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      inArray(transactions.amountCents, [...new Set(itens.map((i) => -i.amountCents))]),
      isNull(transactions.transferGroupId),
      eq(transactions.isIgnored, false),
      gte(transactions.date, de),
      lte(transactions.date, ate),
    ))
  return rows.map((r) => ({ ...r, date: r.date instanceof Date ? r.date.toISOString() : String(r.date) }))
}
