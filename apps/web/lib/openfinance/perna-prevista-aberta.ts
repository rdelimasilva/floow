import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import { condicaoDePernaPrevista } from './perna-prevista'

type Db = ReturnType<typeof getDb>

/** Folga de data entre as duas pontas: o outro banco pode lançar dias depois. */
const JANELA_DIAS = 7
const DIA_EM_MS = 24 * 60 * 60 * 1000

/**
 * A perna prevista que JÁ espera este lançamento, se houver.
 *
 * OF↔OF com as duas contrapartes confirmadas como transferência: o primeiro
 * lado a chegar cria a perna prevista na conta do outro. Quando o outro lado
 * chega, criar a SUA perna prevista geraria um segundo par para o mesmo
 * dinheiro — quatro linhas, duas previsões que nunca casam. Em vez disso, quem
 * chega depois procura a previsão na própria conta: aberta, vinda da outra
 * conta (`transfer_account_id` da perna prevista é a conta de origem dela) e
 * com o valor desta linha — a perna prevista já nasce com o sinal da ponta
 * que espera.
 *
 * Achou: quem chama não cria perna; a linha fica transferência confirmada sem
 * grupo, e `criarPropostasDeConciliacao` desta conta propõe o par com a
 * previsão achada.
 *
 * Usada nos três lugares que criam perna prevista a partir de lançamento do
 * banco: `persistPage`, `applyTransferSingle` e `criarPernasPrevistasFaltantes`.
 */
export async function acharPernaPrevistaAberta(
  db: Db,
  orgId: string,
  args: { contaDoLancamento: string; outraConta: string; amountCents: number; date: Date },
): Promise<string | null> {
  const inicio = new Date(args.date.getTime() - JANELA_DIAS * DIA_EM_MS)
  const fim = new Date(args.date.getTime() + JANELA_DIAS * DIA_EM_MS)

  const [perna] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, args.contaDoLancamento),
        condicaoDePernaPrevista(),
        eq(transactions.balanceApplied, false),
        isNull(transactions.matchedTransactionId),
        eq(transactions.isIgnored, false),
        eq(transactions.transferAccountId, args.outraConta),
        eq(transactions.amountCents, args.amountCents),
        gte(transactions.date, inicio),
        lte(transactions.date, fim),
      ),
    )
    .limit(1)

  return perna?.id ?? null
}
