import { and, asc, eq, sql } from 'drizzle-orm'
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { accounts, duplicateProposals, transactions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'

export interface LadoDaDuplicata {
  id: string
  date: string
  description: string
  amountCents: number
}

export interface DuplicataPendente {
  id: string
  /** O que fica: a versão que conhece a contraparte, ou a emitida primeiro. */
  manter: LadoDaDuplicata
  /** O reemitido, candidato a sair das somas. */
  duplicata: LadoDaDuplicata
  contaNome: string | null
  /** Horas entre as emissões — o porquê do par, na tela. */
  horasEntreEmissoes: number
}

/**
 * A proposta que ainda dá para decidir.
 *
 * `pending` não basta. A janela entre propor e aprovar é aberta por desenho —
 * a fila não bloqueia o app — e nela o usuário mexe nos lançamentos. Se a
 * duplicata já foi marcada como ignorada por outro caminho,
 * `toggleIgnoreTransaction` já estornou `accounts.balance_cents`, e aprovar em
 * seguida estornaria de novo: o mesmo lançamento sairia do saldo duas vezes.
 *
 * `aprovarDuplicata` reconfere a mesma coisa antes de gravar — a fila é uma
 * página renderizada, e o clique chega depois dela.
 *
 * Recebe a coluna do lado duplicado, e não a tabela, porque a consulta lê
 * `transactions` por dois aliases.
 */
export function condicaoDeDuplicataAberta(orgId: string, duplicata: { isIgnored: AnyPgColumn }) {
  return and(
    eq(duplicateProposals.orgId, orgId),
    eq(duplicateProposals.status, 'pending'),
    eq(duplicata.isIgnored, false),
  )
}

/** Um minuto tem 60 segundos e a tela fala em horas; o detector, em minutos. */
const MINUTOS_POR_HORA = 60

/**
 * As propostas de duplicata abertas, maior valor primeiro.
 *
 * A ordem por valor é deliberada: o par de R$ 11.685,40 é o que mexe no saldo
 * de verdade, e é ele que precisa da decisão antes.
 */
export async function getDuplicatasPendentes(orgId: string): Promise<DuplicataPendente[]> {
  return withUserDb(async (db) => {
    const manter = alias(transactions, 'manter')
    const duplicata = alias(transactions, 'duplicata')

    const rows = await db
      .select({
        id: duplicateProposals.id,
        minutosEntreEmissoes: duplicateProposals.minutosEntreEmissoes,
        manterId: manter.id,
        manterDate: manter.date,
        manterDescription: manter.description,
        manterAmount: manter.amountCents,
        duplicataId: duplicata.id,
        duplicataDate: duplicata.date,
        duplicataDescription: duplicata.description,
        duplicataAmount: duplicata.amountCents,
        contaNome: accounts.name,
      })
      .from(duplicateProposals)
      .innerJoin(manter, eq(manter.id, duplicateProposals.manterTransactionId))
      .innerJoin(duplicata, eq(duplicata.id, duplicateProposals.duplicataTransactionId))
      .leftJoin(accounts, eq(accounts.id, duplicata.accountId))
      .where(condicaoDeDuplicataAberta(orgId, duplicata))
      .orderBy(sql`abs(${duplicata.amountCents}) desc`, asc(duplicateProposals.proposedAt))

    const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d))

    return rows.map((row) => ({
      id: row.id,
      manter: {
        id: row.manterId,
        date: iso(row.manterDate),
        description: row.manterDescription,
        amountCents: row.manterAmount,
      },
      duplicata: {
        id: row.duplicataId,
        date: iso(row.duplicataDate),
        description: row.duplicataDescription,
        amountCents: row.duplicataAmount,
      },
      contaNome: row.contaNome,
      horasEntreEmissoes: row.minutosEntreEmissoes / MINUTOS_POR_HORA,
    }))
  })
}
