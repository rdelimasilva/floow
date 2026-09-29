import { openfinanceResources, type getDb, type OrigemDaTransacao } from '@floow/db'
import { deveAguardarExtrato } from '@floow/core-finance'
import { condicaoDeRecursoConciliavel, contaConciliavel } from './conta-conciliavel'
import { inicioDoExtrato } from './reclassificar-conta'

type Db = ReturnType<typeof getDb>

/**
 * O corte de sincronização (`sync_from_date`) do recurso conciliável da
 * conta. Quem decide se a conta é conciliável é `contaConciliavel` — esta
 * consulta só busca a data, com o mesmo filtro.
 */
export async function corteDeSincronizacao(db: Db, orgId: string, accountId: string): Promise<string | null> {
  const [recurso] = await db
    .select({ syncFromDate: openfinanceResources.syncFromDate })
    .from(openfinanceResources)
    .where(condicaoDeRecursoConciliavel(orgId, accountId))
    .limit(1)
  return recurso?.syncFromDate ?? null
}

/**
 * O que a conta diz sobre "aguardar o extrato": se é conciliável (conta
 * corrente/poupança com Open Finance vivo, `contaConciliavel`) e desde quando
 * o extrato a cobre (AAAA-MM-DD). `desde: null` numa conta conciliável =
 * ainda sem extrato nenhum; o primeiro que chegar cobre o que nascer agora.
 * Cartão Open Finance não é conciliável: a linha nasce no saldo, como antes.
 */
export type ExtratoDaConta = { conciliavel: false } | { conciliavel: true; desde: string | null }

export async function extratoDaConta(db: Db, orgId: string, accountId: string): Promise<ExtratoDaConta> {
  if (!(await contaConciliavel(db, orgId, accountId))) return { conciliavel: false }
  const syncFromDate = await corteDeSincronizacao(db, orgId, accountId)
  // Mesmo corte que `reclassificarConta` usa: o que ela nunca toca, aqui
  // também não aguarda.
  const desde = await inicioDoExtrato(db, orgId, accountId, syncFromDate)
  return { conciliavel: true, desde: desde ? desde.slice(0, 10) : null }
}

/**
 * Decisão pura, para quem grava várias linhas na mesma conta (importação):
 * busca `extratoDaConta` uma vez e decide linha a linha.
 *
 * Antes do início do extrato nada muda (spec §3.2): o extrato não vai cobrir
 * esse período, então a linha é a única representação do fato e fica no
 * saldo, como numa conta manual.
 */
export function aguardaNaData(extrato: ExtratoDaConta, origem: OrigemDaTransacao, dataISO: string): boolean {
  if (!extrato.conciliavel || !deveAguardarExtrato(origem, true)) return false
  return extrato.desde === null || dataISO >= extrato.desde
}

/** AAAA-MM-DD de uma data de lançamento (coluna `date`, meia-noite UTC). */
export function diaDaLinha(data: Date): string {
  return data.toISOString().slice(0, 10)
}

/**
 * A linha que está para nascer nesta conta, nesta data, aguarda o extrato? Só
 * em conta conciliável, só para as origens que o extrato cobre (manual,
 * arquivo, perna) e só a partir do início do extrato. Quem grava usa a
 * resposta para `aguarda_extrato` e, invertida, para `balance_applied`.
 */
export async function aguardaExtratoNaConta(
  db: Db,
  orgId: string,
  accountId: string,
  origem: OrigemDaTransacao,
  dataISO: string,
): Promise<boolean> {
  if (!deveAguardarExtrato(origem, true)) return false
  return aguardaNaData(await extratoDaConta(db, orgId, accountId), origem, dataISO)
}
