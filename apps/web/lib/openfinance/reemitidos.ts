import { and, eq, gte, inArray, isNotNull, notLike } from 'drizzle-orm'
import { transactions } from '@floow/db'
import type { Db } from './persist-page'

/**
 * Lançamento que o banco reemitiu com outro id.
 *
 * O banco troca o id quando consolida a transação, e a Polp passou a
 * reconhecer isso (14/10): o id antigo some da lista e o novo aparece. No
 * app a linha antiga continua, e o novo entraria de novo. Foi o que
 * aconteceu com o pagamento de setembro do Master Black no Itaú: "SAIDA
 * FATURA" (id antigo) e "Débito automático Fatura Person Mc Black" (novo).
 *
 * Na leitura completa do recurso dá para ver o que sumiu. O lançamento novo
 * que o app não tem ocupa a linha antiga — mesmo valor, até 3 dias — em vez
 * de entrar: a linha mantém categoria, par e decisões do usuário, e só passa
 * a ter o id que a Polp lista.
 */

const JANELA_DIAS = 3
const DIA_MS = 86_400_000
const dia = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`)

export interface Lancamento {
  /** id da Polp (recebido) ou da linha (órfã). */
  id: string
  amountCents: number
  date: string
}

/** Recebido sem linha → órfã que ele ocupa. Cada órfã serve a um só. */
export function casarReemitidos(semLinha: readonly Lancamento[], orfas: readonly Lancamento[]): Map<string, string> {
  const usadas = new Set<string>()
  const pares = new Map<string, string>()
  for (const r of [...semLinha].sort((a, b) => a.date.localeCompare(b.date))) {
    const orfa = orfas
      .filter((o) => !usadas.has(o.id) && o.amountCents === r.amountCents && Math.abs(dia(o.date) - dia(r.date)) <= JANELA_DIAS * DIA_MS)
      .sort((a, b) => Math.abs(dia(a.date) - dia(r.date)) - Math.abs(dia(b.date) - dia(r.date)))[0]
    if (!orfa) continue
    usadas.add(orfa.id)
    pares.set(r.id, orfa.id)
  }
  return pares
}

/**
 * Dá à linha órfã o id do lançamento reemitido. `idsDaPolp` é a lista
 * completa que a Polp devolveu a partir de `desde`; só linha do extrato
 * desse período pode ser órfã.
 */
export async function ocuparReemitidos(
  db: Db,
  orgId: string,
  accountId: string,
  semLinha: readonly Lancamento[],
  idsDaPolp: ReadonlySet<string>,
  desde: string,
): Promise<number> {
  if (semLinha.length === 0) return 0
  const linhas = await db
    .select({ id: transactions.id, externalId: transactions.externalId, amountCents: transactions.amountCents, date: transactions.date })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, accountId),
      eq(transactions.origem, 'extrato'),
      isNotNull(transactions.externalId),
      // Perna e derivados carregam o id da origem com sufixo.
      notLike(transactions.externalId, '%:%'),
      gte(transactions.date, new Date(`${desde}T00:00:00Z`)),
      inArray(transactions.amountCents, [...new Set(semLinha.map((s) => s.amountCents))]),
    ))
  const orfas = linhas
    .filter((l) => !idsDaPolp.has(l.externalId!))
    .map((l) => ({ id: l.id, amountCents: l.amountCents, date: l.date.toISOString().slice(0, 10) }))
  const pares = casarReemitidos(semLinha, orfas)
  for (const [externalId, linhaId] of pares) {
    await db
      .update(transactions)
      .set({ externalId })
      .where(and(eq(transactions.id, linhaId), eq(transactions.orgId, orgId), eq(transactions.accountId, accountId)))
  }
  return pares.size
}
