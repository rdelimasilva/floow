#!/usr/bin/env -S npx tsx
// scripts/conciliacao-legado.mts
/**
 * Aplica a conciliação única ao que já existe (spec de 28/09 §3.6):
 *  0. imprime a contagem por origem (conferência do backfill da 00070);
 *  1. apaga, por conta viva, as propostas PENDENTES de perna prevista (`:transfer-par`) — R1
 *     decide de novo, absorvendo ou recriando a proposta se ambíguo. Sem
 *     isto a perna com proposta aberta nunca seria absorvida;
 *  2. roda `conciliarConta` em toda conta Open Finance viva (reclassifica e
 *     aplica R1 → R2 → R3), imprimindo o que mudou e a variação de saldo.
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/conciliacao-legado.mts            # dry-run: ROLLBACK
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/conciliacao-legado.mts --aplicar  # grava
 *
 * Não imprime descrição de lançamento nem nome de conta completo.
 */
import { inArray, sql } from 'drizzle-orm'
import { createDb, transactions } from '../packages/db/src/index'
import { conciliarConta } from '../apps/web/lib/finance/conciliacao/conciliar-conta'
import { brl, databaseUrl, Rollback, sigla } from './conciliacao-comum.mts'

const aplicar = process.argv.includes('--aplicar')
const db = createDb(databaseUrl())
type Db = typeof db

console.log(`\n=== Conciliação do legado (${aplicar ? 'APLICANDO' : 'dry-run, nada será gravado'}) ===\n`)

try {
  await db.transaction(async (transacao) => {
    const tx = transacao as unknown as Db

    const porOrigem = await tx.execute<{ origem: string; n: number }>(
      sql`select origem, count(*)::int as n from transactions group by origem order by 2 desc`,
    )
    console.log('Linhas por origem:')
    for (const o of porOrigem) console.log(`  ${String(o.origem).padEnd(18)} ${String(o.n).padStart(7)}`)

    // Mesmo critério de `isOpenFinanceLinkedAccount`: recurso AVAILABLE ligado
    // à conta, sem filtrar tipo. Uma linha por conta, mesmo com vários recursos.
    const contas = await tx.execute<{ org_id: string; account_id: string; nome: string }>(sql`
      select distinct r.org_id, r.account_id, a.name as nome
        from openfinance_resources r
        join accounts a on a.id = r.account_id
       where r.status = 'AVAILABLE' and r.account_id is not null
       order by a.name, r.account_id
    `)

    const saldoDa = async (id: string) => {
      const [l] = await tx.execute<{ saldo: number }>(sql`select balance_cents::bigint::float8 as saldo from accounts where id = ${id}`)
      return Number(l?.saldo ?? 0)
    }

    let totalAbsorvidas = 0
    let totalApagadas = 0
    for (const c of contas) {
      // Só as propostas da conta que o motor vai conciliar: em conta manual ou
      // OF sem recurso vivo o motor não faz nada, e a proposta apagada se perderia.
      const apagadas = await tx.execute<{ id: string }>(sql`
        delete from forecast_match_proposals fmp
         using transactions prev
         where prev.id = fmp.forecast_transaction_id
           and prev.org_id = ${c.org_id}
           and prev.account_id = ${c.account_id}
           and fmp.status = 'pending'
           and prev.external_id like '%:transfer-par'
        returning fmp.id
      `)
      totalApagadas += apagadas.length
      const antes = await saldoDa(c.account_id)
      const r = await conciliarConta(tx, c.org_id, c.account_id)
      const depois = await saldoDa(c.account_id)
      totalAbsorvidas += r.absorvidas.length
      console.log(
        `${sigla(c.nome).padEnd(8)} ${c.account_id}  reclassificadas=${r.reclassificadas}  estorno=${brl(r.estornoCents)}  ` +
          `apagadas=${apagadas.length}  absorvidas=${r.absorvidas.length}  propostas=${r.propostasDeConciliacao}  duplicatas=${r.propostasDeDuplicata}  ` +
          `saldo ${brl(antes)} -> ${brl(depois)} (${brl(depois - antes)})`,
      )
      if (r.absorvidas.length === 0) continue

      const ids = r.absorvidas.flatMap((p) => [p.aguardandoId, p.extratoId])
      const linhas = await tx
        .select({ id: transactions.id, date: transactions.date, amountCents: transactions.amountCents, externalId: transactions.externalId })
        .from(transactions)
        .where(inArray(transactions.id, ids))
      const porId = new Map(linhas.map((l) => [l.id, l]))
      for (const p of r.absorvidas) {
        const a = porId.get(p.aguardandoId)
        const e = porId.get(p.extratoId)
        if (!a || !e) continue
        console.log(
          `    ${a.externalId ?? a.id} (${new Date(a.date).toISOString().slice(0, 10)}, ${brl(a.amountCents)})` +
            `  ->  extrato ${e.id} (${new Date(e.date).toISOString().slice(0, 10)})`,
        )
      }
    }

    console.log(`\nContas conciliadas: ${contas.length}. Propostas de perna prevista apagadas (R1 decide de novo): ${totalApagadas}. Total de pares absorvidos: ${totalAbsorvidas}`)
    if (!aplicar) throw new Rollback()
  })
  console.log('\nGravado.')
} catch (e) {
  if (!(e instanceof Rollback)) throw e
  console.log('\nDry-run: ROLLBACK, nada foi gravado. Revise os pares acima e rode com --aplicar.')
} finally {
  await db.$client.end()
}
