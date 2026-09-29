import { and, eq, sql } from 'drizzle-orm'
import { accounts, transactions, type getDb } from '@floow/db'
import { ORIGENS_QUE_AGUARDAM_EXTRATO } from '@floow/core-finance'
import { buscarProvisorias, paresDoR1 } from './r1-candidatos'

type Db = ReturnType<typeof getDb>

/**
 * A conta é conciliável: o que ainda conta no saldo sem ser extrato passa a
 * aguardar o extrato — mas só com prova (Ruling P12).
 *
 * A decisão "esta linha conta no saldo?" era tomada uma vez, quando a linha
 * nascia. Em 24/09 o Nubank virou Open Finance e as duas `:transfer-dest` que
 * o sync do Itaú tinha criado quando ele ainda era manual continuaram no
 * saldo — junto com as mesmas entradas trazidas pelo extrato. Aqui a decisão
 * é refeita.
 *
 * Prova = par ÚNICO no extrato pela mesma regra do R1 (`paresDoR1`: valor
 * exato, até 3 dias, contraparte compatível, unicidade dos dois lados,
 * espelho OF↔OF), junto com o que já aguarda. Sem par único a linha fica no
 * saldo: tirar sem contrapartida some com dinheiro (a perna de R$ 500 de
 * 06/04 no Nubank não tem linha no extrato). O R1 que roda em seguida
 * absorve o que foi reclassificado aqui.
 *
 * Só a partir de `desde`: antes dele o extrato não cobre o período, e essas
 * linhas continuam sendo a única representação do fato.
 *
 * Idempotente: só pega `aguarda_extrato = false`. Quem chama segura o lock da
 * conta (`conciliarConta`), e o `FOR UPDATE` trava as linhas entre ler o
 * estado antigo e gravar o novo — o estorno usa o `balance_applied` de ANTES,
 * na mesma instrução que marca.
 */
export async function reclassificarConta(
  db: Db,
  orgId: string,
  accountId: string,
  desde: string,
): Promise<{ reclassificadas: number; estornoCents: number }> {
  const nada = { reclassificadas: 0, estornoCents: 0 }
  const legado = await buscarProvisorias(db, orgId, accountId, { legadoDesde: desde })
  if (legado.length === 0) return nada

  const aguardando = await buscarProvisorias(db, orgId, accountId)
  const { absorver } = await paresDoR1(db, orgId, accountId, [...aguardando, ...legado])
  const doLegado = new Set(legado.map((l) => l.id))
  const comProva = absorver.map((p) => p.aguardandoId).filter((id) => doLegado.has(id))
  if (comProva.length === 0) return nada

  const origens = sql.join(ORIGENS_QUE_AGUARDAM_EXTRATO.map((o) => sql`${o}`), sql`, `)
  const ids = sql.join(comProva.map((id) => sql`${id}`), sql`, `)

  const linhas = await db.execute<{ id: string; amount_cents: number; no_saldo: boolean }>(sql`
    with alvo as (
      select id, amount_cents, (balance_applied and not is_ignored) as no_saldo
        from ${transactions}
       where ${transactions.orgId} = ${orgId}
         and ${transactions.accountId} = ${accountId}
         and ${transactions.id} in (${ids})
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
