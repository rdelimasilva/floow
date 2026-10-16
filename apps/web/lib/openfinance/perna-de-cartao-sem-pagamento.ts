import { and, eq, inArray, sql } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import type { Db } from './persist-page'

/**
 * Pagamento de fatura que o extrato do cartão nunca vai confirmar.
 *
 * A regra da contraparte ("Débito automático ITAU VISA PAO DE AC" é
 * transferência para o Visa) cria no cartão a perna que aguarda o extrato do
 * cartão: em conta Open Finance, quem move o saldo é o extrato dela. Só que o
 * extrato do Visa nunca traz pagamento. Em 16/10/2026 os R$ 1.509,30 já
 * tinham saído do Itaú pelo extrato e o Visa continuava devendo.
 *
 * Em cartão cujo extrato nunca trouxe pagamento, a perna entra no saldo assim
 * que a saída da outra conta está no saldo pelo extrato dela: é o banco
 * dizendo que o dinheiro foi. Cartão cujo extrato traz pagamento (o Master
 * Black, "PAGAMENTO DEBITO AUTOMATICO") continua esperando o extrato, que
 * absorve a perna.
 *
 * Se um dia o extrato do Visa passar a trazer o pagamento, o primeiro conta
 * em dobro uma vez e aparece no aviso de divergência; dali em diante o cartão
 * é dos que trazem, e a perna volta a esperar.
 */

export function pernasParaEfetivar(args: {
  extratoTrazPagamento: boolean
  pernas: readonly { id: string; parDoExtratoAplicado: boolean }[]
}): string[] {
  if (args.extratoTrazPagamento) return []
  return args.pernas.filter((p) => p.parDoExtratoAplicado).map((p) => p.id)
}

/**
 * A saída da outra ponta está no saldo pelo extrato dela.
 *
 * Nomes escritos à mão, não `${coluna}`: numa consulta de tabela só, o Drizzle
 * tira o nome da tabela das colunas, e a correlação virava
 * `par.account_id <> "account_id"` — a linha do par contra ela mesma, sempre
 * falso. Em 16/10/2026 a regra foi ao ar assim e não efetivou nada.
 */
export const PAR_DO_EXTRATO_APLICADO = sql<boolean>`exists (
  select 1 from transactions par
   where par.transfer_group_id = "transactions"."transfer_group_id"
     and par.account_id <> "transactions"."account_id"
     and par.origem = 'extrato' and par.balance_applied and not par.is_ignored)`

/** Efetiva as pernas do cartão que o extrato dele não vai confirmar. */
export async function efetivarPernasDeCartaoSemPagamento(db: Db, orgId: string, cartaoId: string): Promise<number> {
  const pernas = await db
    .select({
      id: transactions.id,
      parDoExtratoAplicado: PAR_DO_EXTRATO_APLICADO,
    })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, cartaoId),
      eq(transactions.aguardaExtrato, true),
      eq(transactions.balanceApplied, false),
      eq(transactions.isIgnored, false),
      sql`${transactions.matchedTransactionId} is null`,
      sql`${transactions.transferGroupId} is not null`,
      sql`${transactions.amountCents} > 0`,
    ))
  if (pernas.length === 0) return 0

  const [traz] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, cartaoId),
      eq(transactions.origem, 'extrato'),
      eq(transactions.type, 'transfer'),
      eq(transactions.isIgnored, false),
      sql`${transactions.amountCents} > 0`,
    ))
    .limit(1)

  const ids = pernasParaEfetivar({ extratoTrazPagamento: Boolean(traz), pernas })
  if (ids.length === 0) return 0

  return db.transaction(async (tx) => {
    // Só a que ainda aguarda: outro sync pode ter efetivado.
    const efetivadas = await tx
      .update(transactions)
      .set({ aguardaExtrato: false, balanceApplied: true })
      .where(and(
        eq(transactions.orgId, orgId),
        inArray(transactions.id, ids),
        eq(transactions.aguardaExtrato, true),
        eq(transactions.balanceApplied, false),
      ))
      .returning({ amountCents: transactions.amountCents })
    const entrou = efetivadas.reduce((s, e) => s + e.amountCents, 0)
    if (entrou !== 0) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${entrou}` })
        .where(and(eq(accounts.id, cartaoId), eq(accounts.orgId, orgId)))
    }
    return efetivadas.length
  })
}
