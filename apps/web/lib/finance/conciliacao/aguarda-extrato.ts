import type { getDb, OrigemDaTransacao } from '@floow/db'
import { deveAguardarExtrato } from '@floow/core-finance'
import { isOpenFinanceLinkedAccount } from '@/lib/openfinance/transfer-leg'

type Db = ReturnType<typeof getDb>

/**
 * A linha que está para nascer nesta conta aguarda o extrato? Só em conta
 * Open Finance viva, e só para as origens que o extrato cobre (manual,
 * arquivo, perna). Quem grava usa a resposta para `aguarda_extrato` e,
 * invertida, para `balance_applied`.
 */
export async function aguardaExtratoNaConta(
  db: Db,
  orgId: string,
  accountId: string,
  origem: OrigemDaTransacao,
): Promise<boolean> {
  if (!deveAguardarExtrato(origem, true)) return false
  return isOpenFinanceLinkedAccount(db, orgId, accountId)
}
