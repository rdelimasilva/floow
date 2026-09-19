#!/usr/bin/env node
/**
 * Mede o estrago antes de consertar a regra do saldo previsto.
 *
 * A regra nova: previsao nunca soma em `accounts.balance_cents`. Hoje ela
 * soma em dois caminhos — `generateForTemplate` (grava sem `balance_applied`,
 * pega o default `true` e soma) e `reconcileRecurringBalances` (vira `true`
 * quando a data chega). As linhas que ja passaram por ai precisam ser
 * estornadas, e este script diz quantas sao e quanto muda em cada conta.
 *
 *   node scripts/forecast-balance-audit.mjs
 *
 * E READ-ONLY. Nao altera nada. Nao imprime descricao de lancamento nem
 * nome de conta completo — so contagens, valores agregados e iniciais.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

function carregarEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const texto = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  for (const linha of texto.split('\n')) {
    const corte = linha.indexOf('=')
    if (corte < 0 || linha.trim().startsWith('#')) continue
    if (linha.slice(0, corte).trim() === 'DATABASE_URL') return linha.slice(corte + 1).trim()
  }
  throw new Error('DATABASE_URL nao encontrada (nem no ambiente nem no .env)')
}

const sql = postgres(carregarEnv(), { prepare: false })

const brl = (centavos) =>
  (Number(centavos ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Anonimiza: "Itau Conta Corrente" -> "I.C.C." */
const sigla = (nome) =>
  nome.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').join('.') + '.'

console.log('\n=== Auditoria do saldo previsto (read-only) ===\n')

// -- 1. Quanto de estimativa esta dentro do saldo das contas ----------------
// Linha de template que ja somou: veio de `recurring_template_id`, nao tem
// `external_id` (nao e do banco) e `balance_applied = true`.
const porConta = await sql`
  SELECT
    a.id,
    a.name,
    a.balance_cents,
    count(t.id)::int                      AS linhas,
    coalesce(sum(t.amount_cents), 0)::bigint AS estimado_cents
  FROM accounts a
  JOIN transactions t ON t.account_id = a.id
  WHERE t.recurring_template_id IS NOT NULL
    AND t.external_id IS NULL
    AND t.balance_applied = true
    AND t.is_ignored = false
  GROUP BY a.id, a.name, a.balance_cents
  ORDER BY abs(sum(t.amount_cents)) DESC
`

if (porConta.length === 0) {
  console.log('Nenhuma linha de template dentro do saldo. Nada a estornar.\n')
} else {
  console.log('Contas afetadas — saldo hoje vs. saldo depois do estorno:\n')
  for (const c of porConta) {
    const depois = Number(c.balance_cents) - Number(c.estimado_cents)
    console.log(
      `  ${sigla(c.name).padEnd(10)} ${String(c.linhas).padStart(4)} linhas  ` +
        `${brl(c.balance_cents).padStart(18)} -> ${brl(depois).padStart(18)}  ` +
        `(estimativa: ${brl(c.estimado_cents)})`,
    )
  }
  const total = porConta.reduce((s, c) => s + Number(c.estimado_cents), 0)
  const linhas = porConta.reduce((s, c) => s + c.linhas, 0)
  console.log(`\n  TOTAL: ${linhas} linhas, ${brl(total)} de estimativa dentro do saldo.\n`)
}

// -- 2. Quantas dessas tem par realizado obvio (a duplicacao) --------------
// Mesmo criterio frouxo da investigacao original: mesma conta, mesmo sinal,
// +-7 dias, valor a 8%. Frouxo de proposito — aqui o objetivo e dimensionar,
// nao decidir. O casamento de verdade e o de `forecast-match.ts`.
const duplicados = await sql`
  SELECT count(*)::int AS n, coalesce(sum(abs(p.amount_cents)), 0)::bigint AS soma
  FROM transactions p
  WHERE p.recurring_template_id IS NOT NULL
    AND p.external_id IS NULL
    AND p.balance_applied = true
    AND p.is_ignored = false
    AND EXISTS (
      SELECT 1 FROM transactions r
      WHERE r.account_id = p.account_id
        AND r.external_id IS NOT NULL
        AND r.recurring_template_id IS NULL
        AND r.is_ignored = false
        AND sign(r.amount_cents) = sign(p.amount_cents)
        AND abs(r.date - p.date) <= 7
        AND abs(abs(r.amount_cents) - abs(p.amount_cents))
              <= 0.08 * abs(p.amount_cents)
    )
`
console.log(
  `Dessas, com par realizado plausivel (contando dobrado hoje): ` +
    `${duplicados[0].n} linhas, ${brl(duplicados[0].soma)}.\n`,
)

// -- 3. Como ficam os tres estados novos depois da mudanca ----------------
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const estados = await sql`
  SELECT
    CASE
      WHEN t.matched_transaction_id IS NOT NULL THEN 'conciliado'
      WHEN t.date > ${hoje}::date            THEN 'previsto'
      ELSE                                        'nao conciliado'
    END                                   AS estado,
    count(*)::int                         AS n,
    coalesce(sum(abs(t.amount_cents)), 0)::bigint AS soma
  FROM transactions t
  WHERE t.recurring_template_id IS NOT NULL
    AND t.external_id IS NULL
    AND t.is_ignored = false
  GROUP BY 1
  ORDER BY 2 DESC
`
console.log('Como as linhas de template ficam marcadas depois da mudanca:\n')
for (const e of estados) {
  console.log(`  ${e.estado.padEnd(16)} ${String(e.n).padStart(5)} linhas  ${brl(e.soma).padStart(18)}`)
}

console.log('\nNada foi alterado.\n')
await sql.end()
