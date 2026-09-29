#!/usr/bin/env -S npx tsx
// scripts/conciliacao-repro-28-09.mts
/**
 * Reproduz o caso de 28/09 contra o banco real e SEMPRE desfaz (ROLLBACK).
 *
 * Duas transferências Itaú → Nubank (R$ 200 em 18/09, R$ 123 em 01/09)
 * pesaram duas vezes: as `:transfer-dest` nasceram quando o Nubank era conta
 * manual, e o extrato do Nubank trouxe as mesmas entradas depois. Esperado:
 * as duas pernas passam a aguardar, estornam R$ 323,00 e são absorvidas pelas
 * linhas do extrato — um lançamento por fato.
 *
 * As linhas do extrato do Nubank já são transferência, cada uma em grupo com
 * uma `:transfer-par` no Itaú: é o espelho OF↔OF (Ruling P12). Absorver só
 * grava o vínculo; o extrato não muda. Do lado do Itaú, a `:transfer-par` de
 * 01/09 é absorvida pelo extrato do Itaú depois que a perna do Nubank passa
 * a aguardar. A de 18/09 já estava vinculada (aprovada antes contra outra
 * linha do Itaú) e fica como está. Legado sem par (a perna de R$ 500 de
 * 06/04) não sai do saldo, e conta de cartão não passa pelo motor.
 *
 * Também roda o auditor (antes e depois do motor) e um caso ambíguo montado
 * dentro da transação, contra os índices únicos de verdade.
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/conciliacao-repro-28-09.mts
 *
 * Sai com código 1 se alguma checagem falhar. Não imprime descrição de
 * lançamento nem nome de conta.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
// Import direto de client/schema: o barrel (`export *`) carregado pelo tsx
// como CommonJS não expõe os nomes para um módulo ESM (.mts).
import { createDb } from '../packages/db/src/client'
import { accounts, transactions } from '../packages/db/src/schema/finance'
import { forecastMatchProposals } from '../packages/db/src/schema/forecast-match'
import { conciliarConta } from '../apps/web/lib/finance/conciliacao/conciliar-conta'
import { aguardaExtratoNaConta } from '../apps/web/lib/finance/conciliacao/aguarda-extrato'
import { auditarConciliacao } from '../apps/web/lib/finance/conciliacao/auditoria'
import { brl, databaseUrl, Rollback } from './conciliacao-comum.mts'

const ORG = 'e37a3049-9710-4a32-ab58-4b0d1d0417b9'
const NUBANK = 'cda45433-1970-40ab-b081-2bc85ea70eb4'
const PERNAS = {
  '01a0b603-4d83-732c-a6d9-19833739b795:transfer-dest': { valor: 20000, dia: '2026-09-18' },
  '01a067d3-1110-70f2-af23-d36cba102883:transfer-dest': { valor: 12300, dia: '2026-09-01' },
} as const
const EXTRATO = new Set(['cf0b94b4-30a7-432b-b0e9-6badbee3b6df', '711b4a08-90ce-4a99-980d-9f95a0e33ec4'])
const ITAU = '3ac85523-08e1-4623-bbff-5baadb44fd37'
/** Espelho no Itaú: `:transfer-par` de 01/09 → extrato do Itaú de 01/09 (grupo com a perna do Nubank). */
const ESPELHO_ITAU = { perna: '403e50f1-5f9c-452c-8aa0-edadf86abed9', extrato: '1d34876a-dae6-4a2b-a685-257a015a09b1' }
/** `:transfer-par` de 18/09 no Itaú, já vinculada antes deste motor. */
const PAR_JA_VINCULADO = { perna: '120dbaf5-419c-472a-adcf-2231f1fc5e9c', extrato: 'badefa94-3538-4588-a538-b94e6da36441' }
/** Perna de R$ 500 de 06/04 no Nubank: sem linha no extrato, não pode sair do saldo. */
const PERNA_SEM_PAR = '58c23c7e-4447-4a58-97d5-dc5f36c9ff34'
const CARTOES = ['4caecce6-74cb-4ffb-8cbf-e50386e9692a', 'ad6ba717-0cde-4056-aeae-3ec74eea4ccc']

const url = databaseUrl()
const db = createDb(url)
type Db = typeof db
let falhas = 0

function checar(nome: string, ok: boolean, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${nome}${detalhe ? `  (${detalhe})` : ''}`)
}

async function saldo(tx: Db): Promise<{ local: number; banco: number | null }> {
  const [l] = await tx.execute<{ local: number; banco: number | null }>(sql`
    select a.balance_cents as local, r.bank_balance_cents as banco
      from accounts a left join openfinance_resources r on r.account_id = a.id and r.status = 'AVAILABLE'
     where a.id = ${NUBANK}`)
  return { local: Number(l.local), banco: l.banco === null ? null : Number(l.banco) }
}

/** Só contagens: o auditor devolve ids de conta, que não vão para a saída. */
async function auditoria(tx: Db, rotulo: string) {
  const a = await auditarConciliacao(tx)
  const soma = (xs: { n: number }[]) => xs.reduce((s, x) => s + x.n, 0)
  const pares = a.paresQueMovemSaldo.map((p) => ({ n: p.pares }))
  const nubank = a.paresQueMovemSaldo.find((p) => p.accountId === NUBANK)?.pares ?? 0
  const invariante = a.invarianteQuebrado.map((i) => ({ n: i.linhas }))
  console.log(
    `  auditor ${rotulo}: pares que movem saldo = ${soma(pares)} em ${pares.length} conta(s) (Nubank: ${nubank}); ` +
      `divergências > R$ 1 = ${a.divergencias.length} conta(s); invariante quebrado = ${soma(invariante)} linha(s) em ${invariante.length} conta(s)`,
  )
  return { nubank, invariante: soma(invariante) }
}

let seq = 0
async function inserirAguardando(tx: Db, valor: number, dia: string) {
  const [l] = await tx.insert(transactions).values({
    orgId: ORG, accountId: NUBANK, type: 'expense', amountCents: valor, description: 'repro ambíguo manual',
    date: new Date(`${dia}T12:00:00Z`), categoryId: null, origem: 'manual', aguardaExtrato: true, balanceApplied: false,
  }).returning({ id: transactions.id })
  return l.id
}
async function inserirExtrato(tx: Db, valor: number, dia: string) {
  const [l] = await tx.insert(transactions).values({
    orgId: ORG, accountId: NUBANK, type: 'expense', amountCents: valor, description: 'repro ambíguo extrato',
    date: new Date(`${dia}T12:00:00Z`), categoryId: null, origem: 'extrato',
    externalId: `01a0ffff-0000-7000-8000-${String(100 + ++seq).padStart(12, '0')}`,
    balanceApplied: true, reviewState: 'pending', importedAt: new Date(),
  }).returning({ id: transactions.id })
  return l.id
}

/** Uma proposta pendente por ponta, nenhum vínculo gravado. */
async function checarAmbiguo(tx: Db, nome: string, aguardando: string[], extrato: string[]) {
  const todos = [...aguardando, ...extrato]
  const propostas = await tx
    .select({ previsao: forecastMatchProposals.forecastTransactionId, realizado: forecastMatchProposals.realizedTransactionId })
    .from(forecastMatchProposals)
    .where(and(eq(forecastMatchProposals.status, 'pending'), inArray(forecastMatchProposals.forecastTransactionId, aguardando)))
  const vinculos = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(inArray(transactions.id, todos), sql`${transactions.matchedTransactionId} is not null`))
  const porPrevisao = new Set(propostas.map((p) => p.previsao))
  const porRealizado = new Set(propostas.map((p) => p.realizado))
  checar(`${nome}: nada absorvido`, vinculos.length === 0, `${vinculos.length}`)
  checar(`${nome}: exatamente uma proposta pendente`, propostas.length === 1, `${propostas.length}`)
  checar(`${nome}: uma por ponta`, porPrevisao.size === propostas.length && porRealizado.size === propostas.length)
  checar(`${nome}: a proposta liga as linhas do caso`, propostas.every((p) => extrato.includes(p.realizado)))
}

try {
  await db.transaction(async (transacao) => {
    const tx = transacao as unknown as Db

    console.log('\n1. Caso de 28/09')
    const auditAntes = await auditoria(tx, 'antes do motor')
    const antes = await saldo(tx)
    const colunasDoExtrato = { id: transactions.id, type: transactions.type, categoryId: transactions.categoryId, transferAccountId: transactions.transferAccountId, grupo: transactions.transferGroupId, reviewState: transactions.reviewState }
    const extratoIds = sql`${transactions.id} in (${sql.join([...EXTRATO].map((i) => sql`${i}`), sql`, `)})`
    const extAntes = await tx.select(colunasDoExtrato).from(transactions).where(extratoIds)
    const r = await conciliarConta(tx, ORG, NUBANK)
    const depois = await saldo(tx)
    const auditDepois = await auditoria(tx, 'depois do motor')
    console.log(`  resumo do motor: reclassificadas=${r.reclassificadas} estorno=${brl(r.estornoCents)} absorvidas=${r.absorvidas.length} propostas=${r.propostasDeConciliacao} duplicatas=${r.propostasDeDuplicata}`)
    checar('auditor: invariante intacto depois do motor', auditDepois.invariante === 0, `${auditAntes.invariante} -> ${auditDepois.invariante}`)
    checar('auditor: nenhum par que move saldo no Nubank', auditDepois.nubank === 0, `${auditAntes.nubank} -> ${auditDepois.nubank}`)

    const pernas = await tx
      .select({ id: transactions.id, externalId: transactions.externalId, aguarda: transactions.aguardaExtrato, aplicada: transactions.balanceApplied, vinculo: transactions.matchedTransactionId, valor: transactions.amountCents, grupo: transactions.transferGroupId })
      .from(transactions)
      .where(and(eq(transactions.accountId, NUBANK), sql`${transactions.externalId} in (${sql.join(Object.keys(PERNAS).map((k) => sql`${k}`), sql`, `)})`))

    checar('as duas pernas existem', pernas.length === 2, `${pernas.length}`)
    for (const p of pernas) {
      checar(`${p.externalId} aguarda e está fora do saldo`, p.aguarda && !p.aplicada)
      checar(`${p.externalId} absorvida por uma das linhas do extrato`, p.vinculo !== null && EXTRATO.has(p.vinculo), p.vinculo ?? 'sem vínculo')
    }
    checar('estorno de R$ 323,00', antes.local - depois.local === 32300, `${brl(antes.local)} -> ${brl(depois.local)}`)
    checar('resumo do motor: 2 absorções', r.absorvidas.filter((a) => EXTRATO.has(a.extratoId)).length === 2, JSON.stringify(r.absorvidas))

    const ext = await tx.select(colunasDoExtrato).from(transactions).where(extratoIds)
    for (const e of ext) {
      const antesDele = extAntes.find((x) => x.id === e.id)
      // Espelho: o extrato já era a ponta confirmada do grupo dele com o Itaú.
      checar(`extrato ${e.id} (espelho) não mudou: tipo, categoria, conta e grupo`, JSON.stringify(e) === JSON.stringify(antesDele))
      // `deleteTransaction`/`desfazerParDaRegra` tratam o grupo inteiro: o
      // extrato no grupo da perna teria o saldo estornado junto com ela.
      checar(`extrato ${e.id} não entrou no grupo da perna`, !pernas.some((p) => p.grupo !== null && p.grupo === e.grupo))
    }

    for (const [chave, { valor, dia }] of Object.entries(PERNAS)) {
      const [{ n }] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from transactions
         where account_id = ${NUBANK} and amount_cents = ${valor}
           and balance_applied and not is_ignored
           and abs(date - ${dia}::date) <= 3`)
      checar(`um lançamento no saldo para ${chave.slice(0, 8)} (${brl(valor)} em ${dia})`, Number(n) === 1, `${n}`)
    }

    const [semPar] = await tx.select({ aguarda: transactions.aguardaExtrato, aplicada: transactions.balanceApplied }).from(transactions).where(eq(transactions.id, PERNA_SEM_PAR))
    checar('perna de R$ 500 (06/04) sem par no extrato: continua no saldo', semPar !== undefined && !semPar.aguarda && semPar.aplicada)

    // Informativo: a diferença com o banco tem outra origem (Task 14); o motor
    // só a move pelo estorno.
    console.log(`  saldo × banco: antes ${brl(antes.local)} × ${antes.banco === null ? '—' : brl(antes.banco)}; depois ${brl(depois.local)} × ${depois.banco === null ? '—' : brl(depois.banco)}`)

    console.log('\n1b. Espelho do lado do Itaú')
    const saldoDe = async (conta: string) => {
      const [l] = await tx.execute<{ s: number }>(sql`select balance_cents::bigint::float8 as s from accounts where id = ${conta}`)
      return Number(l.s)
    }
    const vinculoDe = async (id: string) => (await tx.select({ v: transactions.matchedTransactionId }).from(transactions).where(eq(transactions.id, id)))[0]?.v ?? null
    const itauAntes = await saldoDe(ITAU)
    const [extItauAntes] = await tx.select(colunasDoExtrato).from(transactions).where(eq(transactions.id, ESPELHO_ITAU.extrato))
    const rItau = await conciliarConta(tx, ORG, ITAU)
    console.log(`  resumo do motor (Itaú): reclassificadas=${rItau.reclassificadas} estorno=${brl(rItau.estornoCents)} absorvidas=${rItau.absorvidas.length} propostas=${rItau.propostasDeConciliacao} duplicatas=${rItau.propostasDeDuplicata}`)
    checar(':transfer-par de 01/09 absorvida pelo extrato do Itaú (espelho)', (await vinculoDe(ESPELHO_ITAU.perna)) === ESPELHO_ITAU.extrato)
    const [extItau] = await tx.select(colunasDoExtrato).from(transactions).where(eq(transactions.id, ESPELHO_ITAU.extrato))
    checar('extrato do Itaú (espelho) não mudou', JSON.stringify(extItau) === JSON.stringify(extItauAntes))
    checar(':transfer-par de 18/09 segue com o vínculo que já tinha', (await vinculoDe(PAR_JA_VINCULADO.perna)) === PAR_JA_VINCULADO.extrato)
    checar('saldo do Itaú não mudou (a perna nunca esteve nele)', (await saldoDe(ITAU)) === itauAntes)

    console.log('\n1c. Cartão Open Finance não passa pela reclassificação nem por R1')
    for (const cartao of CARTOES) {
      const [{ org }] = await tx.execute<{ org: string }>(sql`select org_id as org from accounts where id = ${cartao}`)
      const s0 = await saldoDe(cartao)
      const rc = await conciliarConta(tx, org, cartao)
      const s1 = await saldoDe(cartao)
      checar(`cartão ${cartao.slice(0, 8)}: nada reclassificado nem absorvido, saldo igual`, rc.reclassificadas === 0 && rc.absorvidas.length === 0 && s0 === s1, `propostas=${rc.propostasDeConciliacao} duplicatas=${rc.propostasDeDuplicata}`)
      checar(`cartão ${cartao.slice(0, 8)}: manual nasce no saldo`, !(await aguardaExtratoNaConta(tx, org, cartao, 'manual', '2026-09-20')))
    }

    console.log('\n2. Idempotência: rodar de novo não muda nada')
    const r2 = await conciliarConta(tx, ORG, NUBANK)
    const depois2 = await saldo(tx)
    checar('nada reclassificado nem absorvido', r2.reclassificadas === 0 && r2.absorvidas.length === 0, JSON.stringify(r2))
    checar('saldo igual', depois2.local === depois.local)

    console.log('\n3. Manual em conta conciliável: extrato chega, uma linha, com a categoria do usuário')
    const [cat] = await tx.execute<{ id: string }>(sql`select id from categories where org_id = ${ORG} or org_id is null limit 1`)
    const aguarda = await aguardaExtratoNaConta(tx, ORG, NUBANK, 'manual', '2026-09-20')
    checar('conta Nubank é conciliável: manual aguarda', aguarda)
    const [manual] = await tx.insert(transactions).values({
      orgId: ORG, accountId: NUBANK, type: 'expense', amountCents: -4321, description: 'repro manual',
      date: new Date('2026-09-20T12:00:00Z'), categoryId: cat.id, origem: 'manual', aguardaExtrato: aguarda, balanceApplied: !aguarda,
    }).returning({ id: transactions.id })
    const s0 = await saldo(tx)
    checar('manual não mexeu no saldo', s0.local === depois2.local)
    // Emula a linha que o extrato traria (mesma forma que persistPage grava).
    const [falso] = await tx.insert(transactions).values({
      orgId: ORG, accountId: NUBANK, type: 'expense', amountCents: -4321, description: 'repro extrato',
      date: new Date('2026-09-21T12:00:00Z'), categoryId: null, origem: 'extrato', externalId: '01a0ffff-0000-7000-8000-000000000001',
      balanceApplied: true, reviewState: 'pending', importedAt: new Date(),
    }).returning({ id: transactions.id })
    await tx.update(accounts).set({ balanceCents: sql`balance_cents - 4321` }).where(eq(accounts.id, NUBANK))
    await conciliarConta(tx, ORG, NUBANK)
    const [m] = await tx.select({ vinculo: transactions.matchedTransactionId }).from(transactions).where(eq(transactions.id, manual.id))
    const [f] = await tx.select({ categoryId: transactions.categoryId, reviewState: transactions.reviewState }).from(transactions).where(eq(transactions.id, falso.id))
    const s1 = await saldo(tx)
    checar('manual absorvido pelo extrato', m.vinculo === falso.id)
    checar('extrato herdou a categoria do usuário e saiu da fila', f.categoryId === cat.id && f.reviewState === 'confirmed')
    checar('saldo mudou só pelo extrato', s1.local === s0.local - 4321)

    console.log('\n4. Dois syncs simultâneos: o segundo espera o lock da conta')
    const db2 = createDb(url)
    let esperou = false
    try {
      await db2.transaction(async (t2) => {
        await t2.execute(sql`set local lock_timeout = '2s'`)
        await conciliarConta(t2 as unknown as Db, ORG, NUBANK)
      })
    } catch (e) {
      esperou = (e as { code?: string }).code === '55P03' || String((e as Error).message).includes('lock timeout')
    } finally {
      await db2.$client.end()
    }
    checar('segundo motor bloqueado enquanto o primeiro segura a conta', esperou)

    // Ruling P8: com mais de uma candidata o motor não escolhe — propõe uma
    // por ponta, sem violar uq_fmp_previsao_pendente, uq_fmp_realizado_pendente
    // nem idx_transactions_matched_unique (um erro de índice derruba o script).
    console.log('\n5. Ambíguo: uma proposta por ponta, nenhum vínculo')
    const a1 = await inserirAguardando(tx, -7777, '2026-09-22')
    const a2 = await inserirAguardando(tx, -7777, '2026-09-23')
    const e1 = await inserirExtrato(tx, -7777, '2026-09-22')
    const b1 = await inserirAguardando(tx, -8888, '2026-09-24')
    const f1 = await inserirExtrato(tx, -8888, '2026-09-24')
    const f2 = await inserirExtrato(tx, -8888, '2026-09-25')
    const r5 = await conciliarConta(tx, ORG, NUBANK)
    console.log(`  resumo do motor: absorvidas=${r5.absorvidas.length} propostas=${r5.propostasDeConciliacao} duplicatas=${r5.propostasDeDuplicata}`)
    await checarAmbiguo(tx, 'dois aguardando × um extrato', [a1, a2], [e1])
    await checarAmbiguo(tx, 'um aguardando × dois extratos', [b1], [f1, f2])
    await conciliarConta(tx, ORG, NUBANK)
    await checarAmbiguo(tx, 'segunda passada, dois aguardando × um extrato', [a1, a2], [e1])
    await checarAmbiguo(tx, 'segunda passada, um aguardando × dois extratos', [b1], [f1, f2])

    throw new Rollback()
  })
} catch (e) {
  if (!(e instanceof Rollback)) throw e
  console.log('\nROLLBACK: nada foi gravado.')
} finally {
  await db.$client.end()
}

console.log(falhas === 0 ? '\nTodas as checagens passaram.\n' : `\n${falhas} checagem(ns) falharam.\n`)
process.exit(falhas === 0 ? 0 : 1)
