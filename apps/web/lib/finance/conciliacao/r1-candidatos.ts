import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { forecastMatchProposals, transactions, type getDb } from '@floow/db'
import {
  chaveDoPar,
  conciliarExtratoComAguardando,
  JANELA_DE_ABSORCAO_DIAS,
  ORIGENS_QUE_AGUARDAM_EXTRATO,
  type LinhaParaConciliar,
  type ParConciliado,
} from '@floow/core-finance'
import { condicaoDePrevisaoSemPropostaAberta, condicaoDeRealizadoSemVinculo } from '@/lib/finance/forecast-match-db'

type Db = ReturnType<typeof getDb>

const DIA_EM_MS = 24 * 60 * 60 * 1000
const dia = (d: Date | string) => new Date(d).toISOString().slice(0, 10)

/**
 * A outra linha do grupo de transferência. Alias próprio porque a consulta
 * relê `transactions` (mesmo motivo de `condicaoDeRealizadoSemVinculo`).
 */
const parceiro = alias(transactions, 'parceiro')

/**
 * O extrato que já é o realizado de uma proposta pendente (uma recorrência
 * proposta num sync anterior) não é absorvido: se fosse, aprovar a proposta
 * depois violaria `idx_transactions_matched_unique` e a action estouraria.
 * SQL cru com parênteses pelo mesmo motivo de
 * `condicaoDePrevisaoSemPropostaAberta`.
 */
export function condicaoSemPropostaPendenteComoRealizado() {
  return notExists(
    sql`(select 1 from ${forecastMatchProposals} where ${forecastMatchProposals.realizedTransactionId} = ${transactions.id} and ${forecastMatchProposals.status} = 'pending')`,
  )
}

type LinhaLida = { id: string; amountCents: number; date: Date | string; counterpartyTaxId: string | null; espelho: string | null }

/** Uma linha por id: grupo com mais de um parceiro não vira duas candidatas. */
function paraRegra(linhas: LinhaLida[]): LinhaParaConciliar[] {
  const porId = new Map<string, LinhaParaConciliar>()
  for (const l of linhas) {
    if (porId.has(l.id)) continue
    porId.set(l.id, { id: l.id, amountCents: l.amountCents, dateISO: dia(l.date), counterpartyTaxId: l.counterpartyTaxId, espelho: l.espelho })
  }
  return [...porId.values()]
}

/**
 * As provisórias da conta que R1 olha: as que já aguardam o extrato, ou —
 * com `legadoDesde` — as antigas que ainda contam no saldo (manual, arquivo,
 * perna, a partir do corte) e que `reclassificarConta` só tira do saldo com
 * prova. Sem vínculo, não ignoradas, sem proposta aberta (a decisão já está
 * com o usuário, inclusive a que `desconciliar` reabriu).
 *
 * `espelho`: na perna cujo grupo tem um extrato de outra conta, a conta desse
 * extrato — é o que deixa um extrato que já tem grupo absorvê-la (Ruling P12).
 */
export async function buscarProvisorias(
  db: Db,
  orgId: string,
  accountId: string,
  alvo: { legadoDesde?: string } = {},
): Promise<LinhaParaConciliar[]> {
  const origens = alvo.legadoDesde
    ? and(
        eq(transactions.aguardaExtrato, false),
        inArray(transactions.origem, [...ORIGENS_QUE_AGUARDAM_EXTRATO]),
        sql`${transactions.date} >= ${alvo.legadoDesde.slice(0, 10)}::date`,
      )
    : eq(transactions.aguardaExtrato, true)

  const linhas = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      counterpartyTaxId: transactions.counterpartyTaxId,
      espelho: parceiro.accountId,
    })
    .from(transactions)
    .leftJoin(
      parceiro,
      and(
        eq(transactions.origem, 'perna'),
        eq(parceiro.orgId, transactions.orgId),
        eq(parceiro.transferGroupId, transactions.transferGroupId),
        ne(parceiro.id, transactions.id),
        eq(parceiro.origem, 'extrato'),
        ne(parceiro.accountId, transactions.accountId),
      ),
    )
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        origens,
        isNull(transactions.matchedTransactionId),
        eq(transactions.isIgnored, false),
        condicaoDePrevisaoSemPropostaAberta(),
      ),
    )
  return paraRegra(linhas)
}

/**
 * O extrato da conta que pode absorver, na janela: sem vínculo, não
 * ignorado, sem proposta pendente como realizado.
 *
 * Extrato com grupo já é ponta de um par e fica de fora (Ruling P11), exceto
 * no espelho OF↔OF (Ruling P12): o parceiro dele no grupo é uma perna que
 * aguarda o extrato em OUTRA conta. Aí `espelho` = a conta dessa perna, e a
 * regra pura só o casa com a provisória que aponta para a mesma conta.
 */
async function buscarExtratoDoR1(db: Db, orgId: string, accountId: string, inicio: Date, fim: Date): Promise<LinhaParaConciliar[]> {
  const linhas = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      counterpartyTaxId: transactions.counterpartyTaxId,
      espelho: parceiro.accountId,
    })
    .from(transactions)
    .leftJoin(
      parceiro,
      and(
        eq(parceiro.orgId, transactions.orgId),
        eq(parceiro.transferGroupId, transactions.transferGroupId),
        ne(parceiro.id, transactions.id),
        eq(parceiro.origem, 'perna'),
        eq(parceiro.aguardaExtrato, true),
        ne(parceiro.accountId, transactions.accountId),
      ),
    )
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.origem, 'extrato'),
        eq(transactions.aguardaExtrato, false),
        or(isNull(transactions.transferGroupId), isNotNull(parceiro.id)),
        eq(transactions.isIgnored, false),
        gte(transactions.date, inicio),
        lte(transactions.date, fim),
        condicaoDeRealizadoSemVinculo(),
        condicaoSemPropostaPendenteComoRealizado(),
      ),
    )
  return paraRegra(linhas)
}

/**
 * A regra pura do R1 (`conciliarExtratoComAguardando`) sobre as provisórias
 * dadas e o extrato da conta na janela delas. O que o usuário já recusou não
 * volta — nem depois de um `desconciliar`.
 */
export async function paresDoR1(
  db: Db,
  orgId: string,
  accountId: string,
  provisorias: LinhaParaConciliar[],
): Promise<{ absorver: ParConciliado[]; propor: ParConciliado[] }> {
  if (provisorias.length === 0) return { absorver: [], propor: [] }

  const tempos = provisorias.map((a) => Date.parse(`${a.dateISO}T00:00:00Z`))
  const inicio = new Date(Math.min(...tempos) - JANELA_DE_ABSORCAO_DIAS * DIA_EM_MS)
  const fim = new Date(Math.max(...tempos) + JANELA_DE_ABSORCAO_DIAS * DIA_EM_MS)

  const extrato = await buscarExtratoDoR1(db, orgId, accountId, inicio, fim)
  if (extrato.length === 0) return { absorver: [], propor: [] }

  const recusadas = await db
    .select({
      forecastTransactionId: forecastMatchProposals.forecastTransactionId,
      realizedTransactionId: forecastMatchProposals.realizedTransactionId,
    })
    .from(forecastMatchProposals)
    .where(
      and(
        eq(forecastMatchProposals.orgId, orgId),
        eq(forecastMatchProposals.status, 'refused'),
        inArray(forecastMatchProposals.forecastTransactionId, provisorias.map((a) => a.id)),
      ),
    )

  return conciliarExtratoComAguardando(
    extrato,
    provisorias,
    new Set(recusadas.map((r) => chaveDoPar(r.forecastTransactionId, r.realizedTransactionId))),
  )
}
