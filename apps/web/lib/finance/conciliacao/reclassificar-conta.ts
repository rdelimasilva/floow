import { and, eq, sql } from 'drizzle-orm'
import { accounts, transactions, type getDb } from '@floow/db'
import { ORIGENS_QUE_AGUARDAM_EXTRATO } from '@floow/core-finance'

type Db = ReturnType<typeof getDb>

/**
 * A conta é Open Finance: o que ainda conta no saldo sem ser extrato passa a
 * aguardar o extrato.
 *
 * A decisão "esta linha conta no saldo?" era tomada uma vez, quando a linha
 * nascia. Em 24/09 o Nubank virou Open Finance e as duas `:transfer-dest` que
 * o sync do Itaú tinha criado quando ele ainda era manual continuaram no
 * saldo — junto com as mesmas entradas trazidas pelo extrato. Aqui a decisão
 * é refeita.
 *
 * Só a partir de `desde`: antes dele o extrato não cobre o período, e essas
 * linhas continuam sendo a única representação do fato.
 *
 * Idempotente: só pega `aguarda_extrato = false`. Quem chama segura o lock da
 * conta (`conciliarConta`), e o `FOR UPDATE` trava as linhas entre ler o
 * estado antigo e gravar o novo — o estorno usa o `balance_applied` de ANTES.
 *
 * Ignorada sai do saldo mantendo `balance_applied = true` (ver
 * `toggleIgnoreTransaction`): muda de marca, mas não estorna de novo.
 */
export async function reclassificarConta(
  db: Db,
  orgId: string,
  accountId: string,
  desde: string,
): Promise<{ reclassificadas: number; estornoCents: number }> {
  const origens = sql.join(ORIGENS_QUE_AGUARDAM_EXTRATO.map((o) => sql`${o}`), sql`, `)

  const linhas = await db.execute<{ id: string; amount_cents: number; no_saldo: boolean }>(sql`
    with alvo as (
      select id, amount_cents, (balance_applied and not is_ignored) as no_saldo
        from ${transactions}
       where ${transactions.orgId} = ${orgId}
         and ${transactions.accountId} = ${accountId}
         and ${transactions.aguardaExtrato} = false
         and ${transactions.origem} in (${origens})
         and ${transactions.date} >= ${desde}::date
       for update
    )
    update ${transactions} as t
       set aguarda_extrato = true, balance_applied = false
      from alvo
     where t.id = alvo.id
    returning t.id, alvo.amount_cents, alvo.no_saldo
  `)

  const estornoCents = linhas.reduce((soma, l) => soma + (l.no_saldo ? Number(l.amount_cents) : 0), 0)

  if (estornoCents !== 0) {
    await db
      .update(accounts)
      .set({ balanceCents: sql`balance_cents - ${estornoCents}` })
      .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
  }

  return { reclassificadas: linhas.length, estornoCents }
}

/**
 * Desde quando o extrato cobre a conta. `sync_from_date` é o corte que o
 * usuário escolheu; sem ele, a primeira sincronização puxou "tudo", e o que
 * o banco mandou começa na primeira linha do extrato. Sem nenhuma linha do
 * extrato ainda, não há o que reclassificar.
 */
export async function inicioDoExtrato(
  db: Db,
  orgId: string,
  accountId: string,
  syncFromDate: string | null,
): Promise<string | null> {
  if (syncFromDate) return syncFromDate

  const [linha] = await db
    .select({ inicio: sql<string | null>`min(${transactions.date})::text` })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.origem, 'extrato'),
      ),
    )

  return linha?.inicio ?? null
}
