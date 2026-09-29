import { sql } from 'drizzle-orm'
import type { getDb } from '@floow/db'
import { compararComOBanco } from '@/lib/finance/divergencia-com-o-banco'

type Db = ReturnType<typeof getDb>

/**
 * O que não deveria existir se o motor de conciliação estivesse certo. Só
 * lê: achado é bug no motor, e o conserto vai no motor, não em correção
 * silenciosa por aqui.
 *
 * "Conta OF viva" segue o mesmo critério de `isOpenFinanceLinkedAccount`:
 * recurso com conta vinculada e status AVAILABLE, sem filtrar resource_type.
 *
 * Ver docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md §3.5
 */
export interface AchadosDaAuditoria {
  paresQueMovemSaldo: { accountId: string; pares: number }[]
  divergencias: { accountId: string; diferencaCents: number }[]
  invarianteQuebrado: { accountId: string; linhas: number }[]
}

/** Um real: abaixo disto é arredondamento do banco, não lançamento errado. */
const TOLERANCIA_CENTS = 100

export function divergenciasRelevantes(
  contas: { accountId: string; saldoLocalCents: number; saldoBancoCents: number | null }[],
): { accountId: string; diferencaCents: number }[] {
  return contas
    .map((c) => ({ accountId: c.accountId, conferencia: compararComOBanco(c) }))
    .filter((c) => c.conferencia.comparavel && Math.abs(c.conferencia.diferencaCents) > TOLERANCIA_CENTS)
    .map((c) => ({ accountId: c.accountId, diferencaCents: c.conferencia.diferencaCents }))
}

export async function auditarConciliacao(db: Db): Promise<AchadosDaAuditoria> {
  // 1. Par que move saldo: duas linhas no saldo, mesmo valor, até 3 dias,
  //    uma delas não-extrato, a partir do corte do extrato. Ajuste de saldo
  //    fica de fora: é correção explícita do usuário e pode coincidir em valor.
  const pares = await db.execute<{ account_id: string; pares: number }>(sql`
    with contas as (
      select distinct r.account_id,
             coalesce(r.sync_from_date,
                      (select min(x.date) from transactions x where x.account_id = r.account_id and x.origem = 'extrato')) as desde
        from openfinance_resources r
       where r.status = 'AVAILABLE' and r.account_id is not null
    )
    select c.account_id, count(*)::int as pares
      from contas c
      join transactions t1 on t1.account_id = c.account_id
      join transactions t2 on t2.account_id = c.account_id and t2.id > t1.id
     where t1.balance_applied and t2.balance_applied
       and not t1.is_ignored and not t2.is_ignored
       and t1.amount_cents = t2.amount_cents
       and abs(t1.date - t2.date) <= 3
       and (t1.origem <> 'extrato' or t2.origem <> 'extrato')
       and t1.origem <> 'ajuste' and t2.origem <> 'ajuste'
       and t1.date >= c.desde and t2.date >= c.desde
     group by c.account_id
  `)

  // 2. Divergência de saldo com o banco, com saldo do banco de até 48h.
  const saldos = await db.execute<{ account_id: string; balance_cents: number; bank_balance_cents: number }>(sql`
    select distinct r.account_id, a.balance_cents, r.bank_balance_cents
      from openfinance_resources r
      join accounts a on a.id = r.account_id
     where r.status = 'AVAILABLE'
       and r.bank_balance_cents is not null
       and r.bank_balance_at > now() - interval '48 hours'
  `)

  // 3. Invariante: aguarda_extrato => balance_applied = false.
  const invariante = await db.execute<{ account_id: string; linhas: number }>(sql`
    select account_id, count(*)::int as linhas
      from transactions
     where aguarda_extrato and balance_applied
     group by account_id
  `)

  return {
    paresQueMovemSaldo: pares.map((p) => ({ accountId: p.account_id, pares: Number(p.pares) })),
    divergencias: divergenciasRelevantes(
      saldos.map((s) => ({
        accountId: s.account_id,
        saldoLocalCents: Number(s.balance_cents),
        saldoBancoCents: Number(s.bank_balance_cents),
      })),
    ),
    invarianteQuebrado: invariante.map((i) => ({ accountId: i.account_id, linhas: Number(i.linhas) })),
  }
}
