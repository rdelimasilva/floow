import { and, eq } from 'drizzle-orm'
import { getDb, openfinanceResources, type NewTransaction } from '@floow/db'

type Db = ReturnType<typeof getDb>

/**
 * Verdadeiro quando a conta já é espelhada por um recurso Open Finance
 * (`openfinance_resources.account_id`) — nesse caso a outra ponta de uma
 * transferência chega sozinha pela sincronização daquela conta, e criar uma
 * segunda linha aqui duplicaria o lançamento.
 *
 * Ver docs/superpowers/specs/2026-09-07-counterparty-transfer-account-design.md, §4.
 */
export async function isOpenFinanceLinkedAccount(db: Db, orgId: string, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: openfinanceResources.id })
    .from(openfinanceResources)
    .where(and(eq(openfinanceResources.orgId, orgId), eq(openfinanceResources.accountId, accountId)))
    .limit(1)

  return Boolean(row)
}

export interface TransferSourceLeg {
  orgId: string
  amountCents: number
  date: Date
  /** Sempre presente: só lançamento de origem Open Finance passa por aqui. */
  externalId: string
  /**
   * Repassado direto da origem: um lançamento agendado/futuro que ainda não
   * entrou no saldo (`balanceApplied: false`) não pode fazer a perna de
   * destino creditar o saldo antes da hora — daria saldo errado em silêncio.
   */
  balanceApplied: boolean
}

/**
 * Monta a segunda perna de uma transferência: mesma data, valor invertido,
 * na conta de destino, já confirmada — nunca passa pela fila, é gerada pela
 * própria confirmação (`counterparty-actions.ts`) ou sincronização
 * (`sync.ts`). `externalId` sempre derivado do da origem: é o que torna a
 * inserção idempotente por `(external_id, account_id)`, o mesmo índice único
 * que já protege o resto da ingestão. `balanceApplied` também herda da
 * origem, para que uma origem ainda não aplicada (agendada/futura) não
 * credite o destino antes da hora.
 */
export function buildTransferLegRow(
  source: TransferSourceLeg,
  destinationAccountId: string,
  transferGroupId: string,
): NewTransaction {
  return {
    orgId: source.orgId,
    accountId: destinationAccountId,
    categoryId: null,
    type: 'transfer',
    amountCents: -source.amountCents,
    description: 'Transferência recebida',
    date: source.date,
    transferGroupId,
    externalId: `${source.externalId}:transfer-dest`,
    balanceApplied: source.balanceApplied,
    reviewState: 'confirmed',
  }
}
