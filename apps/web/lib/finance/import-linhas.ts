import { eq, sql } from 'drizzle-orm'
import { getDb, accounts, transactions, type NewTransaction } from '@floow/db'
import { aguardaExtratoNaConta } from './conciliacao/aguarda-extrato'
import { conciliarContas } from './conciliacao/conciliar-conta'

type Db = ReturnType<typeof getDb>

/**
 * Gravação das linhas de um arquivo OFX/CSV. Saiu de `import-actions.ts`,
 * que estava em 491 linhas, quando a importação passou a respeitar a regra
 * da conta Open Finance: lá, só o extrato move o saldo, e a linha do arquivo
 * aguarda o extrato absorvê-la.
 */
export type LinhaDoArquivo = Omit<NewTransaction, 'origem' | 'aguardaExtrato' | 'balanceApplied'>

export function contaImportadaAguardaExtrato(db: Db, orgId: string, accountId: string): Promise<boolean> {
  return aguardaExtratoNaConta(db, orgId, accountId, 'arquivo')
}

/**
 * `ON CONFLICT DO NOTHING` pelo índice (external_id, account_id): só o que
 * entrou de fato conta, e só move o saldo se a conta não é Open Finance.
 */
export async function inserirLinhasDoArquivo(
  tx: Db,
  args: { accountId: string; linhas: LinhaDoArquivo[]; aguardaExtrato: boolean },
): Promise<number> {
  if (args.linhas.length === 0) return 0

  const inseridas = await tx
    .insert(transactions)
    .values(
      args.linhas.map((l) => ({
        ...l,
        origem: 'arquivo' as const,
        aguardaExtrato: args.aguardaExtrato,
        balanceApplied: !args.aguardaExtrato,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: transactions.id, amountCents: transactions.amountCents })

  if (!args.aguardaExtrato) {
    const delta = inseridas.reduce((soma, l) => soma + l.amountCents, 0)
    if (delta !== 0) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${delta}` })
        .where(eq(accounts.id, args.accountId))
    }
  }

  return inseridas.length
}

/** O motor nas contas que a importação tocou. Nunca lança. */
export async function conciliarDepoisDaImportacao(orgId: string, contas: Iterable<string>): Promise<void> {
  await conciliarContas(getDb(), orgId, contas, '[import]')
}
