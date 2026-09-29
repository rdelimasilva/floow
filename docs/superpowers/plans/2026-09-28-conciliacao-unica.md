# Conciliação única — o extrato é a verdade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Numa conta Open Finance, só o extrato daquela conta move o saldo; todo o resto que entra nela nasce (ou passa a ficar) "aguardando o banco" e é absorvido pelo extrato quando ele chega — acabando com o caso de 28/09 (duas transferências Itaú → Nubank contadas duas vezes).

**Architecture:** Toda linha de `transactions` passa a declarar `origem` (NOT NULL, sem default — o compilador obriga) e ganha `aguarda_extrato`. Um motor único, `conciliarConta(db, orgId, accountId)`, roda sob `pg_advisory_xact_lock` por conta: reclassifica (idempotente) o que ainda conta no saldo de uma conta OF viva, aplica R1 (extrato × aguardando, automático quando o par é único; proposta quando ambíguo), R2 (duplicata extrato × extrato, proposta) e R3 (previsão de recorrência × extrato, proposta). A regra pura mora em `packages/core-finance/src/conciliacao/`; a escrita em `apps/web/lib/finance/conciliacao/`. Todo caminho que grava em conta OF chama o motor; ninguém mais chama `criarPropostasDeConciliacao`/`criarPropostasDeDuplicata` direto. Um cron diário (read-only) audita e manda achados ao Sentry.

**Tech Stack:** Next.js App Router (server actions, route handlers), TypeScript, Drizzle (`drizzle-orm/postgres-js`), Supabase Postgres, vitest, `@sentry/nextjs`, `tsx` para scripts.

**Spec:** `docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md). `import-actions.ts` (491), `recurring-actions.ts` (498) e `investments/actions.ts` (555) só são tocados extraindo para módulo novo — as tarefas dizem qual.
- Migration `supabase/migrations/00067_origem_e_aguarda_extrato.sql`, idempotente. O SQL é aplicado **pelo usuário, manualmente, no SQL editor do Supabase**: abra o arquivo no editor (`code supabase/migrations/00067_origem_e_aguarda_extrato.sql`) para ele copiar. Nunca cole SQL no terminal (trunca linhas).
- A migration tem de estar aplicada em produção **antes** do push para `master`: o código novo grava `origem`, e sem a coluna todo insert em `transactions` falha.
- Valores de `origem`, exatamente: `'extrato', 'manual', 'arquivo', 'perna', 'recorrencia', 'ajuste', 'investimento', 'parcela_prevista'`.
- Invariante: `aguarda_extrato = true` ⇒ `balance_applied = false`.
- Recebem `aguarda_extrato`, **só em conta Open Finance viva** (`isOpenFinanceLinkedAccount`): origens `manual`, `arquivo`, `perna`. Nunca: `extrato`, `ajuste`, `recorrencia`, `parcela_prevista`, `investimento`.
- R1: valor (`amount_cents`) exato; datas a no máximo **3 dias**; contraparte só derruba se os dois lados declaram e discordam (`contrapartesCompativeis`).
- Reclassificação só toca linha com `date >= sync_from_date` (ou, sem `sync_from_date`, a data da primeira linha de `origem = 'extrato'` da conta).
- Lock do motor: `pg_advisory_xact_lock(hashtext('conciliar-conta:' || accountId))`; vínculo por UPDATE condicional (`matched_transaction_id IS NULL`).
- Auditor: divergência de saldo acima de **R$ 1,00** (100 centavos) com `bank_balance_at` de até **48h**. Evento no Sentry por tipo de achado, só com contagens e ids de conta — nunca descrição de lançamento nem nome.
- Os módulos em `apps/web/lib/finance/conciliacao/` não importam nada de `next/*`, `getOrgId` nem `'use server'`: rodam em server action, cron e script (`tsx`).
- Server action que precisa de mensagem específica devolve `{ error }` (o Next esconde a mensagem do throw em produção). Falha do motor depois de gravar **não** derruba a action: é logada e o próximo sync concilia.
- Testes de unidade mockam o banco; CHECK e índice único só estouram de verdade no script contra o banco real com ROLLBACK (Task 14).
- Scripts leem `DATABASE_URL` do ambiente ou de `apps/web/.env.local`, e rodam com `npx tsx --tsconfig apps/web/tsconfig.json scripts/<arquivo>.mts`.
- Cron novo: `apps/web/app/api/cron/auditar-conciliacao/route.ts`, registrado em `apps/web/vercel.json` (o da raiz é ignorado), exporta `GET`, autentica com `isAuthorizedService(..., [SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET])` e entra em `PUBLIC_ROUTE_PREFIXES` do `apps/web/middleware.ts`.
- Git: tudo na branch `feat/conciliacao-unica`. Antes de cada commit, `git branch --show-current` tem de imprimir `feat/conciliacao-unica` (outras sessões trocam a branch no mesmo diretório). `git add` só com caminhos explícitos — nunca `git add -A` nem `git add .`. Mensagens de commit terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Texto para o usuário e comentários em pt-BR ("tela", "você"); densidade de comentário igual à do código em volta (o porquê, não o quê).

## Review Focus

1. **`applyDueBankTransactions` devolvendo linha aguardando ao saldo.** Uma `:transfer-dest` reclassificada ou uma linha de arquivo em conta OF tem `external_id` e `balance_applied = false` — exatamente o filtro do apply-due. Esperado: nunca entra no saldo por data. Teste na Task 5.
2. **Editar lançamento aguardando pelo formulário.** `deveAplicarSaldoNaEdicao` devolve `true` para linha manual; sem guarda, salvar a edição soma a linha no saldo. Esperado: continua fora do saldo; mover a linha para conta manual a devolve ao saldo. Teste na Task 5.
3. **Par que o usuário desfez voltando sozinho.** Depois de `desconciliar` e recusar a proposta, o próximo sync não pode absorver o mesmo par de novo; e extrato com proposta pendente de recorrência (R3 antiga) não pode ser absorvido (a aprovação estouraria `idx_transactions_matched_unique`). Testes nas Tasks 2 e 7.
4. **Proposta ambígua batendo no índice único.** `uq_fmp_previsao_pendente` e `uq_fmp_realizado_pendente` aceitam uma proposta pendente por ponta; "dois candidatos" não pode tentar gravar duas. Esperado: uma proposta por ponta, as demais nascem depois da decisão. Teste na Task 2 (puro) e no script real da Task 14.
5. **Cron barrado pelo middleware.** Rota fora de `PUBLIC_ROUTE_PREFIXES` é redirecionada para `/auth` e o cron da Vercel "roda" sem executar nada, sem erro. Teste na Task 12.

---

### Task 1: Migration, schema e origem no banco

**Files:**
- Create: `supabase/migrations/00067_origem_e_aguarda_extrato.sql`
- Modify: `packages/db/src/schema/finance.ts` (colunas em `transactions`, perto de `reviewState` ~linha 227; índice no callback ~linha 231)
- Modify: `scripts/rls-probe.mjs:73` (insert cru passa a declarar `origem`)
- Test: `apps/web/__tests__/finance/origem-da-transacao-schema.test.ts`

**Interfaces:**
- Produces: `ORIGENS_DE_TRANSACAO` (readonly tuple) e `type OrigemDaTransacao` exportados de `@floow/db`; colunas `transactions.origem: OrigemDaTransacao` (NOT NULL, sem default) e `transactions.aguardaExtrato: boolean` (NOT NULL, default false).

- [ ] **Step 0: Criar a branch**

```bash
git status --short
git checkout master
git pull --ff-only
git checkout -b feat/conciliacao-unica
git branch --show-current
```
Expected: última linha `feat/conciliacao-unica`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/__tests__/finance/origem-da-transacao-schema.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { transactions, ORIGENS_DE_TRANSACAO } from '@floow/db'

/**
 * `origem` é NOT NULL sem default de propósito: um caminho de entrada novo não
 * compila sem declarar de onde vem. O CHECK da migration e a lista do schema
 * têm de ser a mesma — divergir só estoura em produção, porque os testes
 * mockam o banco.
 */
const repoRoot = resolve(__dirname, '../../../..')
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/00067_origem_e_aguarda_extrato.sql'),
  'utf8',
)
const coluna = (nome: string) => getTableConfig(transactions).columns.find((c) => c.name === nome)!

describe('origem da transação', () => {
  it('o CHECK da migration aceita exatamente as origens do schema', () => {
    const check = migration.match(/CHECK \(origem IN \(([\s\S]*?)\)\)/)?.[1] ?? ''
    const naMigration = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(naMigration).toEqual([...ORIGENS_DE_TRANSACAO].sort())
  })

  it('origem é NOT NULL e sem default', () => {
    expect(coluna('origem').notNull).toBe(true)
    expect(coluna('origem').hasDefault).toBe(false)
  })

  it('aguarda_extrato é NOT NULL e nasce false', () => {
    expect(coluna('aguarda_extrato').notNull).toBe(true)
    expect(coluna('aguarda_extrato').default).toBe(false)
  })

  it('a migration pode rodar de novo sem erro nem efeito', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS origem/)
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS aguarda_extrato/)
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS idx_transactions_aguarda_extrato/)
    expect(migration).toMatch(/AND t\.origem IS NULL/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/origem-da-transacao-schema.test.ts`
Expected: FAIL (`ENOENT` na migration / `ORIGENS_DE_TRANSACAO` undefined).

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/00067_origem_e_aguarda_extrato.sql
-- =============================================================================
-- Origem explícita e marca "aguarda o extrato"
-- -----------------------------------------------------------------------------
-- Numa conta Open Finance, só o extrato daquela conta move o saldo. Todo o
-- resto que entra nela (lançamento manual, linha de arquivo, perna de
-- transferência) aguarda o extrato, que o absorve quando chega.
--
-- `origem` é NOT NULL sem default de propósito: o tipo do Drizzle passa a
-- exigir o campo em todo insert, e um caminho de entrada novo não compila sem
-- dizer de onde vem. O backfill abaixo adivinha pelo formato do id UMA vez,
-- sobre dado parado; daqui em diante a origem é declarada por quem grava.
--
-- Invariante: aguarda_extrato = true => balance_applied = false. Não vira
-- CHECK: o auditor diário (api/cron/auditar-conciliacao) vigia.
--
-- Idempotente: pode rodar de novo sem erro e sem efeito.
-- Ver docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md §3.1
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS origem text
    CHECK (origem IN ('extrato', 'manual', 'arquivo', 'perna',
                      'recorrencia', 'ajuste', 'investimento', 'parcela_prevista'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS aguarda_extrato boolean NOT NULL DEFAULT false;

-- Backfill, na ordem da spec. A perna de transferência de recorrência
-- (template com par) fica como `recorrencia`, que é o que
-- `createRecurringTransactions` passa a declarar — sem o
-- `recurring_template_id IS NULL`, o backfill e o código discordariam.
UPDATE public.transactions t
   SET origem = CASE
     WHEN t.external_id LIKE '%:transfer-dest'
       OR t.external_id LIKE '%:transfer-par'
       OR (t.transfer_group_id IS NOT NULL AND t.external_id IS NULL AND t.recurring_template_id IS NULL)
       THEN 'perna'
     WHEN t.recurring_template_id IS NOT NULL THEN 'recorrencia'
     WHEN t.is_installment_forecast THEN 'parcela_prevista'
     WHEN t.affects_cash_flow = false AND t.description LIKE 'Ajuste de saldo%' THEN 'ajuste'
     WHEN t.external_id IS NULL AND a.type = 'brokerage' THEN 'investimento'
     WHEN t.external_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.openfinance_resources r WHERE r.account_id = t.account_id)
       THEN CASE
         WHEN t.external_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN 'extrato'
         ELSE 'arquivo'
       END
     WHEN t.external_id IS NOT NULL THEN 'arquivo'
     ELSE 'manual'
   END
  FROM public.accounts a
 WHERE a.id = t.account_id
   AND t.origem IS NULL;

ALTER TABLE public.transactions ALTER COLUMN origem SET NOT NULL;

-- A perna prevista (`:transfer-par`) já era "aguarda o extrato" com outro
-- nome: nunca entrou no saldo. Passa a carregar a marca, e o motor a absorve
-- (R1) em vez de mandá-la para a fila.
UPDATE public.transactions
   SET aguarda_extrato = true
 WHERE external_id LIKE '%:transfer-par'
   AND balance_applied = false
   AND aguarda_extrato = false;

CREATE INDEX IF NOT EXISTS idx_transactions_aguarda_extrato
  ON public.transactions (account_id, date)
  WHERE aguarda_extrato AND matched_transaction_id IS NULL;
```

- [ ] **Step 4: Colunas no schema do Drizzle**

Em `packages/db/src/schema/finance.ts`, logo acima de `export const transactions = pgTable(` (linha ~122):

```ts
/**
 * De onde a linha veio. Declarada por quem grava — nunca deduzida do formato
 * do `external_id` (FITID de arquivo e id da Polp moram na mesma coluna).
 * Ver migration 00067 e `lib/finance/conciliacao/`.
 */
export const ORIGENS_DE_TRANSACAO = [
  'extrato',
  'manual',
  'arquivo',
  'perna',
  'recorrencia',
  'ajuste',
  'investimento',
  'parcela_prevista',
] as const

export type OrigemDaTransacao = (typeof ORIGENS_DE_TRANSACAO)[number]
```

Dentro das colunas de `transactions`, logo depois de `reviewState` e antes de `createdAt`:

```ts
    /**
     * NOT NULL sem default de propósito: todo `insert(transactions)` tem de
     * dizer de onde a linha vem, senão não compila.
     */
    origem: text('origem').$type<OrigemDaTransacao>().notNull(),
    /**
     * Linha provisória numa conta Open Finance: fora do saldo
     * (`balance_applied = false`) até o extrato daquela conta absorvê-la
     * (`matched_transaction_id`). Ver `lib/finance/conciliacao/`.
     */
    aguardaExtrato: boolean('aguarda_extrato').notNull().default(false),
```

No callback de índices da tabela, junto de `idxTransactionsOrgAccountDate`:

```ts
    idxTransactionsAguardaExtrato: index('idx_transactions_aguarda_extrato')
      .on(table.accountId, table.date)
      .where(sql`aguarda_extrato AND matched_transaction_id IS NULL`),
```

(Se `sql` ainda não estiver importado de `drizzle-orm` no topo do arquivo, acrescente-o ao import existente.)

- [ ] **Step 5: `rls-probe.mjs` declara a origem**

Em `scripts/rls-probe.mjs:73-74`, troque o insert por:

```js
        await tx`insert into transactions (org_id, account_id, date, description, amount_cents, type, origem)
                 values (gen_random_uuid(), gen_random_uuid(), current_date, 'probe', 1, 'expense', 'manual')`
```

Sem isto o insert estoura por `origem` NULL e o probe marca "escrita negada" pelo motivo errado.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/origem-da-transacao-schema.test.ts`
Expected: PASS (4 testes). O `typecheck` do app fica vermelho até o fim da Task 4 — esperado: é o compilador apontando os inserts que faltam.

- [ ] **Step 7: Pedir ao usuário para aplicar a migration**

Abra o arquivo no editor para o usuário copiar: `code supabase/migrations/00067_origem_e_aguarda_extrato.sql`. Diga: "Cole o conteúdo inteiro no SQL editor do Supabase e rode. Pode rodar de novo sem problema." Não cole o SQL no terminal. Espere a confirmação antes da Task 14.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add supabase/migrations/00067_origem_e_aguarda_extrato.sql packages/db/src/schema/finance.ts scripts/rls-probe.mjs apps/web/__tests__/finance/origem-da-transacao-schema.test.ts
git commit -m "feat(conciliacao): origem explícita e marca aguarda_extrato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regra pura (R1, efeito da absorção) e `emitidoEm` com sufixo

**Files:**
- Create: `packages/core-finance/src/conciliacao/regras.ts`
- Create: `packages/core-finance/src/conciliacao/index.ts`
- Modify: `packages/core-finance/src/index.ts` (exporta `./conciliacao`)
- Modify: `packages/core-finance/src/openfinance/duplicata.ts` (`emitidoEm` ignora sufixo; `contrapartesCompativeis` exportada)
- Test: `packages/core-finance/src/__tests__/conciliacao/regras.test.ts`
- Test: `packages/core-finance/src/__tests__/openfinance/duplicata.test.ts` (novo `it`)

**Interfaces:**
- Consumes: `type OrigemDaTransacao` de `@floow/db` (Task 1).
- Produces (de `@floow/core-finance`):
  - `ORIGENS_QUE_AGUARDAM_EXTRATO: readonly OrigemDaTransacao[]`
  - `deveAguardarExtrato(origem: OrigemDaTransacao, contaOpenFinance: boolean): boolean`
  - `JANELA_DE_ABSORCAO_DIAS = 3`
  - `interface LinhaParaConciliar { id: string; amountCents: number; dateISO: string; counterpartyTaxId: string | null }`
  - `interface ParConciliado { aguardandoId: string; extratoId: string }`
  - `chaveDoPar(aguardandoId: string, extratoId: string): string`
  - `conciliarExtratoComAguardando(extrato: LinhaParaConciliar[], aguardando: LinhaParaConciliar[], recusados?: ReadonlySet<string>): { absorver: ParConciliado[]; propor: ParConciliado[] }`
  - `interface ProvisoriaParaEfeito { origem: OrigemDaTransacao; categoryId: string | null; description: string }`
  - `interface ExtratoParaEfeito { reviewState: 'confirmed' | 'pending'; categoryId: string | null; isAutoCategorized: boolean }`
  - `type EfeitoDaAbsorcao`
  - `efeitoDaAbsorcao(provisoria: ProvisoriaParaEfeito, extrato: ExtratoParaEfeito, outraConta: string | null): EfeitoDaAbsorcao | null`
  - `contrapartesCompativeis(a: { counterpartyTaxId: string | null }, b: { counterpartyTaxId: string | null }): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// packages/core-finance/src/__tests__/conciliacao/regras.test.ts
import { describe, it, expect } from 'vitest'
import {
  chaveDoPar,
  conciliarExtratoComAguardando,
  deveAguardarExtrato,
  efeitoDaAbsorcao,
  type LinhaParaConciliar,
} from '../../conciliacao/regras'

/**
 * Numa conta Open Finance só o extrato move o saldo; o resto aguarda e o
 * extrato absorve. Absorver sozinho é seguro porque a linha provisória nunca
 * esteve no saldo: um casamento errado troca uma etiqueta, nunca o saldo.
 * Ambiguidade real vai para a fila.
 */

const linha = (id: string, dateISO: string, amountCents = 20000, counterpartyTaxId: string | null = null): LinhaParaConciliar =>
  ({ id, dateISO, amountCents, counterpartyTaxId })

describe('deveAguardarExtrato', () => {
  it('manual, arquivo e perna aguardam só em conta Open Finance', () => {
    for (const origem of ['manual', 'arquivo', 'perna'] as const) {
      expect(deveAguardarExtrato(origem, true)).toBe(true)
      expect(deveAguardarExtrato(origem, false)).toBe(false)
    }
  })

  it('extrato, ajuste, recorrência, parcela prevista e investimento nunca aguardam', () => {
    for (const origem of ['extrato', 'ajuste', 'recorrencia', 'parcela_prevista', 'investimento'] as const) {
      expect(deveAguardarExtrato(origem, true)).toBe(false)
    }
  })
})

describe('conciliarExtratoComAguardando', () => {
  it('caso de 28/09: cada perna acha a sua linha do extrato e é absorvida', () => {
    const r = conciliarExtratoComAguardando(
      [linha('ext-18', '2026-09-18', 20000, '33076492802'), linha('ext-01', '2026-09-01', 12300, '33076492802')],
      [linha('perna-18', '2026-09-18', 20000), linha('perna-01', '2026-09-01', 12300)],
    )
    expect(r.absorver).toEqual([
      { aguardandoId: 'perna-01', extratoId: 'ext-01' },
      { aguardandoId: 'perna-18', extratoId: 'ext-18' },
    ])
    expect(r.propor).toEqual([])
  })

  it('valor diferente em um centavo não casa', () => {
    const r = conciliarExtratoComAguardando([linha('e', '2026-09-18', 20001)], [linha('a', '2026-09-18', 20000)])
    expect(r).toEqual({ absorver: [], propor: [] })
  })

  it('janela de 3 dias: 3 casa, 4 não', () => {
    expect(conciliarExtratoComAguardando([linha('e', '2026-09-21')], [linha('a', '2026-09-18')]).absorver).toHaveLength(1)
    expect(conciliarExtratoComAguardando([linha('e', '2026-09-22')], [linha('a', '2026-09-18')]).absorver).toHaveLength(0)
  })

  it('contraparte declarada dos dois lados e diferente não casa; ausente de um lado casa', () => {
    expect(conciliarExtratoComAguardando([linha('e', '2026-09-18', 20000, '111')], [linha('a', '2026-09-18', 20000, '222')]).absorver).toHaveLength(0)
    expect(conciliarExtratoComAguardando([linha('e', '2026-09-18', 20000, '111')], [linha('a', '2026-09-18', 20000, null)]).absorver).toHaveLength(1)
  })

  it('dois extratos para um aguardando: não absorve, propõe o de data mais próxima', () => {
    const r = conciliarExtratoComAguardando(
      [linha('longe', '2026-09-20'), linha('perto', '2026-09-18')],
      [linha('a', '2026-09-18')],
    )
    expect(r.absorver).toEqual([])
    expect(r.propor).toEqual([{ aguardandoId: 'a', extratoId: 'perto' }])
  })

  it('dois aguardando para um extrato: não absorve e propõe uma vez só (índice único por ponta)', () => {
    const r = conciliarExtratoComAguardando(
      [linha('e', '2026-09-18')],
      [linha('a1', '2026-09-17'), linha('a2', '2026-09-18')],
    )
    expect(r.absorver).toEqual([])
    expect(r.propor).toHaveLength(1)
    expect(new Set(r.propor.map((p) => p.extratoId)).size).toBe(r.propor.length)
  })

  it('par recusado pelo usuário não volta, nem como absorção nem como proposta', () => {
    const r = conciliarExtratoComAguardando(
      [linha('e', '2026-09-18')],
      [linha('a', '2026-09-18')],
      new Set([chaveDoPar('a', 'e')]),
    )
    expect(r).toEqual({ absorver: [], propor: [] })
  })

  it('par único convive com grupo ambíguo sem ser contaminado por ele', () => {
    const r = conciliarExtratoComAguardando(
      [linha('e-unico', '2026-09-01', 500), linha('e1', '2026-09-18'), linha('e2', '2026-09-19')],
      [linha('a-unico', '2026-09-01', 500), linha('a', '2026-09-18')],
    )
    expect(r.absorver).toEqual([{ aguardandoId: 'a-unico', extratoId: 'e-unico' }])
    expect(r.propor).toEqual([{ aguardandoId: 'a', extratoId: 'e1' }])
  })
})

describe('efeitoDaAbsorcao', () => {
  const extratoPendente = { reviewState: 'pending' as const, categoryId: null, isAutoCategorized: false }

  it('perna: o extrato vira a ponta da transferência', () => {
    expect(
      efeitoDaAbsorcao({ origem: 'perna', categoryId: null, description: 'Transferência recebida' }, extratoPendente, 'conta-itau'),
    ).toEqual({ type: 'transfer', categoryId: null, reviewState: 'confirmed', transferAccountId: 'conta-itau' })
  })

  it('perna sem outra conta conhecida: não inventa transferência', () => {
    expect(efeitoDaAbsorcao({ origem: 'perna', categoryId: null, description: 'x' }, extratoPendente, null)).toBeNull()
  })

  it('manual: o extrato ainda não classificado herda categoria e descrição do usuário', () => {
    expect(
      efeitoDaAbsorcao({ origem: 'manual', categoryId: 'cat-mercado', description: 'Feira' }, extratoPendente, null),
    ).toEqual({ categoryId: 'cat-mercado', description: 'Feira', reviewState: 'confirmed', isAutoCategorized: false })
  })

  it('categoria automática não conta como classificação: a do usuário vence', () => {
    const auto = { reviewState: 'confirmed' as const, categoryId: 'cat-polp', isAutoCategorized: true }
    expect(efeitoDaAbsorcao({ origem: 'arquivo', categoryId: 'cat-user', description: 'Luz' }, auto, null)).toMatchObject({ categoryId: 'cat-user' })
  })

  it('extrato já classificado à mão fica como está', () => {
    const classificado = { reviewState: 'confirmed' as const, categoryId: 'cat-x', isAutoCategorized: false }
    expect(efeitoDaAbsorcao({ origem: 'manual', categoryId: 'cat-y', description: 'y' }, classificado, null)).toBeNull()
  })

  it('manual sem categoria não apaga a do extrato', () => {
    expect(efeitoDaAbsorcao({ origem: 'manual', categoryId: null, description: 'y' }, extratoPendente, null)).toBeNull()
  })
})
```

No `packages/core-finance/src/__tests__/openfinance/duplicata.test.ts`, dentro de `describe('detectarDuplicatas', ...)`, acrescente:

```ts
  it('lê o UUIDv7 mesmo com sufixo (:transfer-dest) em vez de calar', () => {
    const a = { ...BASE, id: 'a', externalId: `${uuidV7Em('2026-09-16T03:00:00Z')}:transfer-dest` }
    const b = { ...BASE, id: 'b', externalId: `${uuidV7Em('2026-09-16T19:00:00Z', '1111')}:transfer-dest` }
    const pares = detectarDuplicatas([a, b])
    expect(pares).toHaveLength(1)
    expect(Math.round(pares[0].minutosEntreEmissoes)).toBe(16 * 60)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/conciliacao src/__tests__/openfinance/duplicata.test.ts`
Expected: FAIL (módulo `conciliacao/regras` inexistente; o `it` de sufixo com 0 pares).

- [ ] **Step 3: `duplicata.ts`: sufixo e contraparte exportada**

Em `packages/core-finance/src/openfinance/duplicata.ts`, troque o começo de `emitidoEm`:

```ts
function emitidoEm(externalId: string): number | null {
  // Perna derivada carrega o id da origem com sufixo (`:transfer-dest`,
  // `:transfer-par`). Sem cortá-lo, o id não tinha 32 hex e a função calava.
  const limpo = externalId.split(':')[0].replace(/-/g, '')
```

E troque a assinatura de `contrapartesCompativeis` (mantendo o comentário de cima):

```ts
export function contrapartesCompativeis(
  a: { counterpartyTaxId: string | null },
  b: { counterpartyTaxId: string | null },
): boolean {
```

- [ ] **Step 4: Escrever a regra pura**

```ts
// packages/core-finance/src/conciliacao/regras.ts
import type { OrigemDaTransacao } from '@floow/db'
import { contrapartesCompativeis } from '../openfinance/duplicata'

/**
 * Numa conta Open Finance, só o extrato daquela conta move o saldo. Todo o
 * resto que entra nela aguarda o extrato, e o extrato, quando chega, absorve.
 *
 * Absorver sem perguntar é seguro porque a linha provisória nunca esteve no
 * saldo: um casamento errado troca uma etiqueta, nunca o saldo. É o oposto da
 * previsão de recorrência (21/09), em que casar errado escondia dinheiro de
 * verdade — lá a aprovação continua.
 *
 * Ver docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md
 */

/** Quem aguarda o extrato, e só em conta Open Finance viva. */
export const ORIGENS_QUE_AGUARDAM_EXTRATO: readonly OrigemDaTransacao[] = ['manual', 'arquivo', 'perna']

export function deveAguardarExtrato(origem: OrigemDaTransacao, contaOpenFinance: boolean): boolean {
  return contaOpenFinance && ORIGENS_QUE_AGUARDAM_EXTRATO.includes(origem)
}

/** Folga entre a data que o usuário (ou o outro banco) deu e a do extrato. */
export const JANELA_DE_ABSORCAO_DIAS = 3

const DIA_EM_MS = 24 * 60 * 60 * 1000

export interface LinhaParaConciliar {
  id: string
  amountCents: number
  /** AAAA-MM-DD. */
  dateISO: string
  counterpartyTaxId: string | null
}

export interface ParConciliado {
  aguardandoId: string
  extratoId: string
}

export function chaveDoPar(aguardandoId: string, extratoId: string): string {
  return `${aguardandoId}|${extratoId}`
}

function distanciaEmDias(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA_EM_MS
}

function compativeis(aguardando: LinhaParaConciliar, extrato: LinhaParaConciliar): boolean {
  return (
    aguardando.amountCents === extrato.amountCents &&
    distanciaEmDias(aguardando.dateISO, extrato.dateISO) <= JANELA_DE_ABSORCAO_DIAS &&
    contrapartesCompativeis(aguardando, extrato)
  )
}

/**
 * R1: absorve o par ÚNICO dos dois lados (o extrato tem um só aguardando
 * compatível e vice-versa). Mais de um candidato de qualquer lado não escolhe:
 * propõe o de data mais próxima, para o usuário decidir.
 *
 * Uma proposta por ponta, nunca duas: `uq_fmp_previsao_pendente` e
 * `uq_fmp_realizado_pendente` aceitam uma pendente por lado. As outras
 * candidatas nascem na passada seguinte, depois da decisão.
 *
 * `recusados` (chaves de `chaveDoPar`) é o que o usuário já disse que não é o
 * mesmo dinheiro — não volta nem como absorção nem como proposta.
 */
export function conciliarExtratoComAguardando(
  extrato: LinhaParaConciliar[],
  aguardando: LinhaParaConciliar[],
  recusados: ReadonlySet<string> = new Set(),
): { absorver: ParConciliado[]; propor: ParConciliado[] } {
  const candidatosDe = new Map<string, LinhaParaConciliar[]>()
  const grauDoExtrato = new Map<string, number>()

  for (const a of aguardando) {
    const cs = extrato.filter((e) => !recusados.has(chaveDoPar(a.id, e.id)) && compativeis(a, e))
    candidatosDe.set(a.id, cs)
    for (const e of cs) grauDoExtrato.set(e.id, (grauDoExtrato.get(e.id) ?? 0) + 1)
  }

  // Ordem estável: o resultado não pode depender da ordem em que o banco
  // devolveu as linhas.
  const ordenados = [...aguardando].sort((x, y) => x.dateISO.localeCompare(y.dateISO) || x.id.localeCompare(y.id))

  const absorver: ParConciliado[] = []
  const extratoUsado = new Set<string>()
  for (const a of ordenados) {
    const cs = candidatosDe.get(a.id)!
    if (cs.length === 1 && grauDoExtrato.get(cs[0].id) === 1) {
      absorver.push({ aguardandoId: a.id, extratoId: cs[0].id })
      extratoUsado.add(cs[0].id)
    }
  }

  const absorvidos = new Set(absorver.map((p) => p.aguardandoId))
  const propor: ParConciliado[] = []
  for (const a of ordenados) {
    if (absorvidos.has(a.id)) continue
    const livres = candidatosDe.get(a.id)!.filter((e) => !extratoUsado.has(e.id))
    if (livres.length === 0) continue
    const [melhor] = [...livres].sort(
      (x, y) => distanciaEmDias(a.dateISO, x.dateISO) - distanciaEmDias(a.dateISO, y.dateISO) || x.id.localeCompare(y.id),
    )
    propor.push({ aguardandoId: a.id, extratoId: melhor.id })
    extratoUsado.add(melhor.id)
  }

  return { absorver, propor }
}

export interface ProvisoriaParaEfeito {
  origem: OrigemDaTransacao
  categoryId: string | null
  description: string
}

export interface ExtratoParaEfeito {
  reviewState: 'confirmed' | 'pending'
  categoryId: string | null
  isAutoCategorized: boolean
}

export type EfeitoDaAbsorcao =
  | { type: 'transfer'; categoryId: null; reviewState: 'confirmed'; transferAccountId: string }
  | { categoryId: string; description: string; reviewState: 'confirmed'; isAutoCategorized: false }

/**
 * O que muda na linha do extrato quando ela absorve a provisória.
 *
 * Perna de transferência: o extrato vira a ponta da transferência — o mesmo
 * efeito que `aprovarProposta` dava à perna prevista (spec de 24/09 §3.3).
 * O `transfer_group_id` NÃO vai junto: `deleteTransaction` e
 * `desfazerParDaRegra` tratam o grupo inteiro, e estornariam o saldo do
 * extrato junto com a perna.
 *
 * Manual ou arquivo: o extrato herda o que o usuário decidiu, só se ainda não
 * foi classificado à mão. Categoria automática (regra, Polp, contraparte) é
 * palpite da máquina e perde para a escolha do usuário.
 */
export function efeitoDaAbsorcao(
  provisoria: ProvisoriaParaEfeito,
  extrato: ExtratoParaEfeito,
  outraConta: string | null,
): EfeitoDaAbsorcao | null {
  if (provisoria.origem === 'perna') {
    return outraConta ? { type: 'transfer', categoryId: null, reviewState: 'confirmed', transferAccountId: outraConta } : null
  }
  const classificadoAMao = extrato.reviewState === 'confirmed' && extrato.categoryId !== null && !extrato.isAutoCategorized
  if (classificadoAMao || provisoria.categoryId === null) return null
  return { categoryId: provisoria.categoryId, description: provisoria.description, reviewState: 'confirmed', isAutoCategorized: false }
}
```

```ts
// packages/core-finance/src/conciliacao/index.ts
export * from './regras'
```

Em `packages/core-finance/src/index.ts`, logo depois de `export * from './openfinance/duplicata'`:

```ts
// Conciliação única — o extrato é a verdade
export * from './conciliacao'
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/conciliacao src/__tests__/openfinance/duplicata.test.ts`
Expected: PASS.
Run: `pnpm --filter @floow/core-finance typecheck`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/core-finance/src/conciliacao/regras.ts packages/core-finance/src/conciliacao/index.ts packages/core-finance/src/index.ts packages/core-finance/src/openfinance/duplicata.ts packages/core-finance/src/__tests__/conciliacao/regras.test.ts packages/core-finance/src/__tests__/openfinance/duplicata.test.ts
git commit -m "feat(conciliacao): regra pura R1 e emitidoEm com sufixo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Origem declarada na ingestão Open Finance

Cobre os pontos de `apps/web/lib/openfinance/`: `persist-page.ts` (insert ~:274 e pernas ~:293), `aplicar-regra.ts:163`, `pernas-faltantes.ts:75`, `investimentos/vincular-aplicacoes.ts:154` (as três últimas gravam o que `transfer-leg.ts` monta), `completar-parcelas.ts:107`, e a ocupação da parcela prevista (`parcelas-previstas.ts`, que transforma a previsão em linha do extrato).

**Files:**
- Modify: `apps/web/lib/openfinance/transfer-leg.ts:81-122`
- Modify: `apps/web/lib/openfinance/persist-page.ts` (objeto de `toInsert.push`, ~linha 237)
- Modify: `apps/web/lib/openfinance/completar-parcelas.ts:22-41`
- Modify: `apps/web/lib/openfinance/parcelas-previstas.ts:38-53`
- Test: `apps/web/__tests__/openfinance/origem-na-ingestao.test.ts`

**Interfaces:**
- Consumes: `transactions.origem`, `transactions.aguardaExtrato` (Task 1).
- Produces: `buildTransferLegRow` → `{ origem: 'perna', aguardaExtrato: false, ... }`; `buildForecastTransferLegRow` → `{ origem: 'perna', aguardaExtrato: true, balanceApplied: false, ... }`; `linhaDaPrevisao` → `origem: 'parcela_prevista'`; `camposDaOcupacao` → `origem: 'extrato'`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/__tests__/openfinance/origem-na-ingestao.test.ts
import { describe, it, expect } from 'vitest'
import { buildForecastTransferLegRow, buildTransferLegRow } from '@/lib/openfinance/transfer-leg'
import { linhaDaPrevisao } from '@/lib/openfinance/completar-parcelas'
import { camposDaOcupacao } from '@/lib/openfinance/parcelas-previstas'

const ORIGEM = {
  orgId: 'org-1',
  amountCents: -20000,
  date: new Date('2026-09-18T12:00:00Z'),
  externalId: '01a0b603-4d83-732c-a6d9-19833739b795',
  balanceApplied: true,
}

describe('origem declarada na ingestão Open Finance', () => {
  it('perna para conta manual é perna real: conta no saldo, não aguarda', () => {
    expect(buildTransferLegRow(ORIGEM, 'nubank', 'g-1')).toMatchObject({ origem: 'perna', aguardaExtrato: false, balanceApplied: true })
  })

  it('perna para conta Open Finance aguarda o extrato e fica fora do saldo', () => {
    expect(buildForecastTransferLegRow(ORIGEM, 'itau', 'nubank', 'g-1')).toMatchObject({
      origem: 'perna',
      aguardaExtrato: true,
      balanceApplied: false,
      externalId: `${ORIGEM.externalId}:transfer-par`,
    })
  })

  it('parcela prevista declara a própria origem', () => {
    const linha = linhaDaPrevisao(
      { purchaseDate: '2026-08-01', installmentNumber: 3, installmentTotal: 6, amountCents: -45916, date: '2026-11-16', description: 'AIRBNB', categoryId: null },
      { orgId: 'org-1', accountId: 'cartao' },
    )
    expect(linha.origem).toBe('parcela_prevista')
  })

  it('parcela real que ocupa a previsão passa a ser linha do extrato', () => {
    const c = camposDaOcupacao(
      { externalId: 'polp-3', amountCents: -45916, description: 'AIRBNB 03/06', date: '2026-10-16', categoryId: null },
      new Date('2026-10-20T15:00:00Z'),
    )
    expect(c.origem).toBe('extrato')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/openfinance/origem-na-ingestao.test.ts`
Expected: FAIL (`origem` undefined).

- [ ] **Step 3: Implementar**

`transfer-leg.ts`, em `buildTransferLegRow`, no objeto retornado, depois de `reviewState: 'confirmed',`:

```ts
    origem: 'perna',
    aguardaExtrato: false,
```

`transfer-leg.ts`, `buildForecastTransferLegRow` passa a ser (e o comentário de cima troca "previsão" por "aguarda o extrato"):

```ts
/**
 * A perna do lado de uma conta Open Finance: aguarda o extrato, não é
 * lançamento. Quem move o saldo daquela conta é o extrato dela; esta linha
 * fica fora do saldo até o motor de conciliação (R1) a absorver.
 * `transferAccountId` guarda a conta de ORIGEM — é o que vira a outra ponta
 * da transferência na linha do extrato que a absorve.
 */
export function buildForecastTransferLegRow(
  source: TransferSourceLeg,
  sourceAccountId: string,
  otherAccountId: string,
  transferGroupId: string,
): NewTransaction {
  return {
    ...buildTransferLegRow(source, otherAccountId, transferGroupId),
    externalId: `${source.externalId}${SUFIXO_PERNA_PREVISTA}`,
    balanceApplied: false,
    aguardaExtrato: true,
    transferAccountId: sourceAccountId,
  }
}
```

`persist-page.ts`, no objeto de `toInsert.push({ ... })`, depois de `externalId: tx.externalId,`:

```ts
      origem: 'extrato',
```

`completar-parcelas.ts`, em `linhaDaPrevisao`, depois de `isInstallmentForecast: true,`:

```ts
    origem: 'parcela_prevista',
```

`parcelas-previstas.ts`, em `camposDaOcupacao`, depois de `isInstallmentForecast: false as const,`:

```ts
    // A previsão ocupada vira a linha do extrato: daqui em diante é ela que
    // move o saldo, e o motor a trata como tal.
    origem: 'extrato' as const,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/openfinance/origem-na-ingestao.test.ts __tests__/openfinance/parcelas-previstas.test.ts __tests__/openfinance/transfer-leg.test.ts`
Expected: PASS. Se algum `toEqual` de `transfer-leg.test.ts` comparar o objeto inteiro da perna, acrescente `origem: 'perna'` e `aguardaExtrato` esperados ao objeto do teste.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/transfer-leg.ts apps/web/lib/openfinance/persist-page.ts apps/web/lib/openfinance/completar-parcelas.ts apps/web/lib/openfinance/parcelas-previstas.ts apps/web/__tests__/openfinance/origem-na-ingestao.test.ts apps/web/__tests__/openfinance/transfer-leg.test.ts
git commit -m "feat(conciliacao): origem declarada na ingestão Open Finance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Origem nos demais pontos de entrada (com as extrações de arquivo grande)

Cobre `finance/account-actions.ts:149`, `finance/recurring-actions.ts` (:81 e :237), `finance/transaction-create-actions.ts` (:83, :99, :143, :331, :332, :370), `finance/transaction-actions.ts:223`, `finance/import-actions.ts` (:285, :428), `finance/import-transfer.ts` (:30, :68 — o :57 usa `buildForecastTransferLegRow`), `investments/actions.ts` (:209, :522). Aqui só se declara a origem; a marca `aguarda_extrato` nesses caminhos vem na Task 10.

- `recurring-actions.ts` está em 498: `generateForTemplate` sai para `recurring-generate.ts`.
- `investments/actions.ts` está em 555: o lançamento de caixa do evento sai para `transacao-do-evento.ts` e as checagens de dono para `ownership.ts` (o arquivo fica abaixo de 500).

**Files:**
- Create: `apps/web/lib/finance/recurring-generate.ts`
- Create: `apps/web/lib/investments/transacao-do-evento.ts`
- Create: `apps/web/lib/investments/ownership.ts`
- Modify: `apps/web/lib/finance/recurring-actions.ts` (remove linhas 43-116; importa `generateForTemplate`; `origem` nas `rows` de `createRecurringTemplate`)
- Modify: `apps/web/lib/investments/actions.ts` (remove `assertAssetOwnership`, `assertAccountOwnership`, `CASH_FLOW_EVENT_TYPES` e os dois blocos de insert de caixa)
- Modify: `apps/web/lib/finance/account-actions.ts:149`
- Modify: `apps/web/lib/finance/transaction-create-actions.ts`
- Modify: `apps/web/lib/finance/transaction-actions.ts:223`
- Modify: `apps/web/lib/finance/import-actions.ts` (as duas funções de `rows`)
- Modify: `apps/web/lib/finance/import-transfer.ts`
- Test: `apps/web/__tests__/investments/transacao-do-evento.test.ts`
- Test: `apps/web/__tests__/finance/ajuste-de-saldo-fora-do-fluxo.test.ts` (uma asserção)
- Test: `apps/web/__tests__/finance/previsao-nao-sensibiliza-saldo.test.ts` (uma asserção)

**Interfaces:**
- Consumes: `OrigemDaTransacao` (Task 1).
- Produces: `generateForTemplate(templateId: string, orgId: string): Promise<number>` em `recurring-generate.ts`; `CASH_FLOW_EVENT_TYPES` e `inserirTransacaoDoEvento(tx: Db, args: { orgId: string; accountId: string; eventId: string; eventType: string; eventDate: NewTransaction['date']; totalCents: number; assetTicker: string }): Promise<void>` em `transacao-do-evento.ts`; `assertAssetOwnership`, `assertAccountOwnership` em `investments/ownership.ts`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// apps/web/__tests__/investments/transacao-do-evento.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { inserirTransacaoDoEvento } from '@/lib/investments/transacao-do-evento'

const inseridos: Record<string, unknown>[] = []
const atualizadas: string[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['where', 'returning', 'set']) c[m] = () => c
  return c
}
const tx: any = {
  insert: () => ({ values: (v: Record<string, unknown>) => { inseridos.push(v); return chain([{ id: 'tx-1' }]) } }),
  update: (t: any) => { atualizadas.push(getTableName(t)); return chain([]) },
}

beforeEach(() => { inseridos.length = 0; atualizadas.length = 0 })

describe('inserirTransacaoDoEvento', () => {
  it('compra: despesa com origem investimento, saldo e vínculo do evento', async () => {
    await inserirTransacaoDoEvento(tx, {
      orgId: 'org-1', accountId: 'corrente', eventId: 'ev-1', eventType: 'buy',
      eventDate: new Date('2026-09-10T12:00:00Z'), totalCents: 150000, assetTicker: 'PETR4',
    })
    expect(inseridos[0]).toMatchObject({ origem: 'investimento', type: 'expense', amountCents: -150000, description: 'buy: PETR4' })
    expect(atualizadas).toEqual(['accounts', 'portfolio_events'])
  })

  it('desdobramento não move caixa', async () => {
    await inserirTransacaoDoEvento(tx, {
      orgId: 'org-1', accountId: 'corrente', eventId: 'ev-2', eventType: 'split',
      eventDate: new Date('2026-09-10T12:00:00Z'), totalCents: 1, assetTicker: 'PETR4',
    })
    expect(inseridos).toEqual([])
    expect(atualizadas).toEqual([])
  })
})
```

Em `apps/web/__tests__/finance/ajuste-de-saldo-fora-do-fluxo.test.ts:55`, troque por:

```ts
    expect(inseridos[0]).toMatchObject({ affectsCashFlow: false, origem: 'ajuste' })
```

Em `apps/web/__tests__/finance/previsao-nao-sensibiliza-saldo.test.ts:115`, troque por:

```ts
      expect(linha.valores).toMatchObject({ balanceApplied: false, origem: 'recorrencia' })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/investments/transacao-do-evento.test.ts __tests__/finance/ajuste-de-saldo-fora-do-fluxo.test.ts __tests__/finance/previsao-nao-sensibiliza-saldo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extrair `generateForTemplate`**

Crie `apps/web/lib/finance/recurring-generate.ts` com o corpo de `recurring-actions.ts:47-116`, sem mudar a lógica, acrescentando `origem`:

```ts
// apps/web/lib/finance/recurring-generate.ts
import { getDb, transactions, recurringTemplates } from '@floow/db'
import { matchCategory, advanceByFrequency, getOverdueDates } from '@floow/core-finance'
import { eq, and } from 'drizzle-orm'
import { getCategoryRules } from './queries'

/**
 * Gera as ocorrências vencidas de um template (não é server action). Saiu de
 * `recurring-actions.ts`, que estava em 498 linhas com o limite em 500.
 */
export async function generateForTemplate(templateId: string, orgId: string): Promise<number> {
  const db = getDb()

  const [template] = await db
    .select()
    .from(recurringTemplates)
    .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
    .limit(1)

  if (!template || !template.isActive) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueDates = getOverdueDates(template.nextDueDate, template.frequency as any, today)
  if (overdueDates.length === 0) return 0

  let resolvedCategoryId = template.categoryId
  let isAutoCategorized = false
  if (!resolvedCategoryId && template.description) {
    const rules = await getCategoryRules(orgId)
    const enabledRules = rules.filter((r: any) => r.isEnabled)
    const matched = matchCategory(template.description, enabledRules)
    if (matched) {
      resolvedCategoryId = matched
      isAutoCategorized = true
    }
  }

  const signedAmount = template.type === 'income' ? template.amountCents : -template.amountCents
  let generated = 0

  await db.transaction(async (tx) => {
    for (const dueDate of overdueDates) {
      const result = await tx
        .insert(transactions)
        .values({
          orgId,
          accountId: template.accountId,
          categoryId: resolvedCategoryId,
          type: template.type as any,
          amountCents: signedAmount,
          description: template.description,
          date: dueDate,
          recurringTemplateId: template.id,
          origem: 'recorrencia',
          // Previsao NUNCA sensibiliza `accounts.balance_cents`. Antes esta
          // linha omitia o campo, pegava o default `true` da coluna e somava
          // o valor no saldo logo abaixo — 41 linhas e R$ 126.746,00 de
          // estimativa dentro do saldo de uma conta cujo saldo real era
          // R$ 190,84, com 21 delas contando dobrado junto com o realizado
          // que o banco trouxe. Quem soma no saldo e o lancamento do banco;
          // esta linha espera ser casada com ele.
          balanceApplied: false,
          isAutoCategorized,
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id })

      if (result.length > 0) generated++
    }

    const lastDate = overdueDates[overdueDates.length - 1]
    const newNextDueDate = advanceByFrequency(lastDate, template.frequency as any)
    await tx
      .update(recurringTemplates)
      .set({ nextDueDate: newNextDueDate, updatedAt: new Date() })
      .where(eq(recurringTemplates.id, template.id))
  })

  return generated
}
```

Em `recurring-actions.ts`: apague as linhas 43-116 (o bloco de comentário "Internal: generate overdue..." e a função), acrescente `import { generateForTemplate } from './recurring-generate'` e tire `getOverdueDates` do import de `@floow/core-finance` (só a função movida usava). Nas `rows` de `createRecurringTemplate` (~linha 222 original), depois de `recurringTemplateId: t.id,`, acrescente `origem: 'recorrencia' as const,`.

- [ ] **Step 4: Extrair o caixa do evento de investimento**

```ts
// apps/web/lib/investments/transacao-do-evento.ts
import { eq, sql } from 'drizzle-orm'
import { accounts, portfolioEvents, transactions, type getDb, type NewTransaction } from '@floow/db'

type Db = ReturnType<typeof getDb>

// ---------------------------------------------------------------------------
// Cash flow mapping for INV-07 integration
// buy: expense (cash leaves account), sell: income (cash enters account),
// dividend/interest/amortization: income (cash enters account), split: no cash flow
// ---------------------------------------------------------------------------

export const CASH_FLOW_EVENT_TYPES: Record<string, { transactionType: 'income' | 'expense'; sign: 1 | -1 } | null> = {
  buy: { transactionType: 'expense', sign: -1 },
  sell: { transactionType: 'income', sign: 1 },
  dividend: { transactionType: 'income', sign: 1 },
  interest: { transactionType: 'income', sign: 1 },
  amortization: { transactionType: 'income', sign: 1 },
  split: null,
}

/**
 * O lançamento de caixa de um evento de carteira: grava a transação, move o
 * saldo da conta e liga o evento a ela. Saiu de `actions.ts`, que passava de
 * 500 linhas, e os dois caminhos (criar e editar evento) repetiam o bloco.
 */
export async function inserirTransacaoDoEvento(
  tx: Db,
  args: {
    orgId: string
    accountId: string
    eventId: string
    eventType: string
    eventDate: NewTransaction['date']
    totalCents: number
    assetTicker: string
  },
): Promise<void> {
  const mapeamento = CASH_FLOW_EVENT_TYPES[args.eventType]
  if (!mapeamento) return

  const signedAmount = mapeamento.sign * Math.abs(args.totalCents)

  const [txRow] = await tx
    .insert(transactions)
    .values({
      orgId: args.orgId,
      accountId: args.accountId,
      type: mapeamento.transactionType,
      amountCents: signedAmount,
      description: `${args.eventType}: ${args.assetTicker}`,
      date: args.eventDate,
      origem: 'investimento',
    })
    .returning()

  await tx
    .update(accounts)
    .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
    .where(eq(accounts.id, args.accountId))

  await tx
    .update(portfolioEvents)
    .set({ transactionId: txRow.id })
    .where(eq(portfolioEvents.id, args.eventId))
}
```

```ts
// apps/web/lib/investments/ownership.ts
import { and, eq } from 'drizzle-orm'
import { accounts, assets, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>

/**
 * Verifies that an asset belongs to the given org.
 * Throws if the asset does not exist or belongs to a different org.
 */
export async function assertAssetOwnership(db: Db, assetId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.orgId, orgId)))
    .limit(1)

  if (!row) {
    throw new Error(`Asset ${assetId} not found or does not belong to this organization`)
  }
}

/**
 * Verifies that an account belongs to the given org.
 * Throws if the account does not exist or belongs to a different org.
 */
export async function assertAccountOwnership(db: Db, accountId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    .limit(1)

  if (!row) {
    throw new Error(`Account ${accountId} not found or does not belong to this organization`)
  }
}
```

Em `investments/actions.ts`:
- apague `assertAssetOwnership`, `assertAccountOwnership` (linhas 49-79) e o bloco do mapeamento `CASH_FLOW_EVENT_TYPES` com o comentário de cima (linhas 81-94);
- acrescente os imports:

```ts
import { assertAccountOwnership, assertAssetOwnership } from './ownership'
import { CASH_FLOW_EVENT_TYPES, inserirTransacaoDoEvento } from './transacao-do-evento'
```

- em `createPortfolioEvent`, troque o bloco inteiro `// 2. INV-07: ...` (do `if (cashFlowMapping && input.totalCents) {` até o fechamento depois do `update(portfolioEvents)`) por:

```ts
    // 2. INV-07: lançamento de caixa do evento, quando ele move caixa
    if (cashFlowMapping && input.totalCents) {
      await inserirTransacaoDoEvento(tx as unknown as Db, {
        orgId, accountId: input.accountId, eventId: event.id, eventType: input.eventType,
        eventDate: input.eventDate, totalCents: input.totalCents, assetTicker,
      })
    }
```

- em `updatePortfolioEvent`, troque o bloco `// 3. Create new cash-flow transaction ...` (do `if` até o fechamento depois do `update(portfolioEvents)`) por:

```ts
    // 3. Novo lançamento de caixa, se o evento editado move caixa
    if (cashFlowMapping && input.totalCents) {
      await inserirTransacaoDoEvento(tx as unknown as Db, {
        orgId, accountId: input.accountId, eventId: input.id, eventType: input.eventType,
        eventDate: input.eventDate, totalCents: input.totalCents, assetTicker,
      })
    }
```

- tire `transactions`/`accounts` do import de `@floow/db` só se o typecheck/lint acusar que ficaram sem uso (o bloco de reverter caixa em `updatePortfolioEvent` e `deletePortfolioEvent` ainda usam os dois).

Confira: `wc -l apps/web/lib/investments/actions.ts` imprime menos de 500.

- [ ] **Step 5: Origem nos demais inserts**

`account-actions.ts:149` (ajuste de saldo), no `values`, depois de `balanceApplied: true,`:

```ts
      // Correção explícita do usuário: nunca aguarda extrato, nem em conta
      // Open Finance.
      origem: 'ajuste',
```

`transaction-create-actions.ts`:
- insert de origem (~:83) e de destino (~:99) da transferência manual: `origem: 'perna',` depois de `transferGroupId,` (o backfill da 00067 trata par manual como perna);
- insert de receita/despesa (~:143): `origem: 'manual',` depois de `isAutoCategorized,`;
- `sourceRows.push` e `destRows.push` (~:292 e ~:308): `origem: 'recorrencia' as const,` depois de `recurringTemplateId: template.id,`;
- `rows` de receita/despesa recorrente (~:350): `origem: 'recorrencia' as const,` depois de `recurringTemplateId: template.id,`.

`transaction-actions.ts:223` (perna de destino ao converter em transferência): `origem: 'perna',` depois de `transferGroupId,`.

`import-actions.ts`, nos dois `rows.map` (`importTransactions` ~:250 e `importSelectedTransactions` ~:389): `origem: 'arquivo' as const,` depois de `externalId: tx.externalId,`.

`import-transfer.ts`: no insert da origem (~:30) `origem: 'arquivo',` depois de `externalId: args.externalId,`; no insert da perna real de destino (~:68) `origem: 'perna',` depois de `transferGroupId,`.

- [ ] **Step 6: Typecheck e testes**

Run: `pnpm --filter @floow/web typecheck`
Expected: nenhum erro de `origem` faltando em `lib/`. Se o compilador apontar insert de `transactions` em teste (`__tests__/`) que monta objeto tipado, acrescente a origem que o caminho real usa. Se apontar algum insert em `lib/` fora da lista acima, declare a origem dele pela tabela da spec §3.1 e registre no commit.

Run: `pnpm --filter @floow/web exec vitest run __tests__/investments __tests__/finance`
Expected: PASS.

Run: `wc -l apps/web/lib/finance/recurring-actions.ts apps/web/lib/finance/import-actions.ts apps/web/lib/investments/actions.ts`
Expected: todos ≤ 500.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/recurring-generate.ts apps/web/lib/finance/recurring-actions.ts apps/web/lib/investments/transacao-do-evento.ts apps/web/lib/investments/ownership.ts apps/web/lib/investments/actions.ts apps/web/lib/finance/account-actions.ts apps/web/lib/finance/transaction-create-actions.ts apps/web/lib/finance/transaction-actions.ts apps/web/lib/finance/import-actions.ts apps/web/lib/finance/import-transfer.ts apps/web/__tests__/investments/transacao-do-evento.test.ts apps/web/__tests__/finance/ajuste-de-saldo-fora-do-fluxo.test.ts apps/web/__tests__/finance/previsao-nao-sensibiliza-saldo.test.ts
git commit -m "feat(conciliacao): origem declarada em todo insert de transactions

Extrai generateForTemplate (recurring-actions em 498 linhas) e o caixa
do evento de investimento (investments/actions em 555) para módulos
próprios.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Se o Step 6 exigiu mexer em arquivos de teste além destes, acrescente os caminhos explícitos ao `git add`.)

---

### Task 5: Guardas — linha aguardando nunca volta ao saldo por data nem por edição

**Files:**
- Modify: `apps/web/lib/finance/apply-due.ts:43-65` (filtro)
- Modify: `apps/web/lib/finance/saldo-na-edicao.ts`
- Test: `apps/web/__tests__/finance/aplicar-vencidos-ignora-perna-prevista.test.ts` (novo `it`)
- Test: `apps/web/__tests__/finance/saldo-na-edicao-aguarda.test.ts`

**Interfaces:**
- Produces: `deveAplicarSaldoNaEdicao(linha: { recurringTemplateId: string | null; isInstallmentForecast?: boolean | null; externalId?: string | null; balanceApplied: boolean; aguardaExtrato?: boolean | null }, dataEditada: string, hoje: string): boolean`

- [ ] **Step 1: Escrever os testes que falham**

No fim de `describe('applyDueBankTransactions', ...)` em `aplicar-vencidos-ignora-perna-prevista.test.ts`:

```ts
  it('exclui a linha que aguarda o extrato: :transfer-dest reclassificada tem external_id e não pode voltar ao saldo', async () => {
    wheres.length = 0
    await applyDueBankTransactions()
    const q = new PgDialect().sqlToQuery(wheres[0])
    expect(q.sql).toContain('"aguarda_extrato" = ')
  })
```

```ts
// apps/web/__tests__/finance/saldo-na-edicao-aguarda.test.ts
import { describe, it, expect } from 'vitest'
import { deveAplicarSaldoNaEdicao } from '@/lib/finance/saldo-na-edicao'

/**
 * Linha que aguarda o extrato está fora do saldo por regra (spec de 28/09 §2):
 * salvar a edição não pode somá-la, mesmo sendo lançamento manual com data
 * passada — o caso em que a função devolvia `true` sem olhar mais nada.
 */
const MANUAL = { recurringTemplateId: null, isInstallmentForecast: false, externalId: null, balanceApplied: false }

describe('deveAplicarSaldoNaEdicao com aguarda_extrato', () => {
  it('aguardando: nunca entra no saldo', () => {
    expect(deveAplicarSaldoNaEdicao({ ...MANUAL, aguardaExtrato: true }, '2026-09-01', '2026-09-28')).toBe(false)
  })

  it('sem a marca: manual com data passada entra, como antes', () => {
    expect(deveAplicarSaldoNaEdicao({ ...MANUAL, aguardaExtrato: false }, '2026-09-01', '2026-09-28')).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/aplicar-vencidos-ignora-perna-prevista.test.ts __tests__/finance/saldo-na-edicao-aguarda.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`apply-due.ts`, no `and(...)` de `filtro`, depois de `condicaoNaoEPernaPrevista(),`:

```ts
    // Linha que aguarda o extrato (perna `:transfer-dest` reclassificada,
    // linha de arquivo em conta Open Finance) também tem `external_id` e
    // `balance_applied = false`. Numa conta OF só o extrato move o saldo:
    // aplicá-la por data contaria o mesmo dinheiro duas vezes.
    eq(transactions.aguardaExtrato, false),
```

`saldo-na-edicao.ts`: acrescente `aguardaExtrato?: boolean | null` ao tipo de `linha`, um item no comentário de cima (" - a linha que aguarda o extrato, que numa conta Open Finance nunca entra no saldo — quem soma é o extrato que a absorve;") e, como primeira linha do corpo:

```ts
  if (linha.aguardaExtrato) return false
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/aplicar-vencidos-ignora-perna-prevista.test.ts __tests__/finance/saldo-na-edicao-aguarda.test.ts __tests__/finance/aplicacao-por-data-so-do-banco.test.ts __tests__/finance/edicao-e-ignorar-respeitam-saldo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/apply-due.ts apps/web/lib/finance/saldo-na-edicao.ts apps/web/__tests__/finance/aplicar-vencidos-ignora-perna-prevista.test.ts apps/web/__tests__/finance/saldo-na-edicao-aguarda.test.ts
git commit -m "fix(conciliacao): linha aguardando nunca volta ao saldo por data ou edição

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `reclassificarConta` — conta vira Open Finance, o que já existe passa a aguardar

**Files:**
- Create: `apps/web/lib/finance/conciliacao/reclassificar-conta.ts`
- Test: `apps/web/__tests__/finance/reclassificar-conta.test.ts`

**Interfaces:**
- Consumes: `ORIGENS_QUE_AGUARDAM_EXTRATO` (Task 2).
- Produces:
  - `reclassificarConta(db: Db, orgId: string, accountId: string, desde: string): Promise<{ reclassificadas: number; estornoCents: number }>`
  - `inicioDoExtrato(db: Db, orgId: string, accountId: string, syncFromDate: string | null): Promise<string | null>`

Decisão de gatilho (spec §3.2): em vez de detectar "recurso recém-vinculado", a reclassificação roda em **toda** passada do motor (Task 8), sob o lock da conta. É idempotente (só pega `aguarda_extrato = false`) e é a única forma que pega também a `:transfer-dest` criada enquanto a conta estava `TEMPORARILY_UNAVAILABLE`. Roda depois das páginas do sync, e não antes do primeiro `persistPage`: a ordem não muda o saldo final, e depois das páginas já existe extrato para servir de corte quando falta `sync_from_date`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/__tests__/finance/reclassificar-conta.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { getTableName, type SQL } from 'drizzle-orm'
import { inicioDoExtrato, reclassificarConta } from '@/lib/finance/conciliacao/reclassificar-conta'

const dialect = new PgDialect()
let linhasAfetadas: unknown[] = []
let selectResult: unknown[] = []
const executados: SQL[] = []
const updates: { tabela: string; payload: Record<string, unknown> }[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit']) c[m] = () => c
  return c
}
const db: any = {
  execute: async (q: SQL) => { executados.push(q); return linhasAfetadas },
  select: () => chain(selectResult),
  update: (t: any) => ({
    set: (payload: Record<string, unknown>) => { updates.push({ tabela: getTableName(t), payload }); return chain([]) },
  }),
}

beforeEach(() => { linhasAfetadas = []; selectResult = []; executados.length = 0; updates.length = 0 })

describe('reclassificarConta', () => {
  it('caso de 28/09: as duas :transfer-dest passam a aguardar e estornam R$ 323,00', async () => {
    linhasAfetadas = [
      { id: 'perna-18', amount_cents: 20000, no_saldo: true },
      { id: 'perna-01', amount_cents: 12300, no_saldo: true },
    ]
    const r = await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    expect(r).toEqual({ reclassificadas: 2, estornoCents: 32300 })
    expect(updates).toHaveLength(1)
    expect(updates[0].tabela).toBe('accounts')
    expect(dialect.sqlToQuery(updates[0].payload.balanceCents as SQL).params).toContain(32300)
  })

  it('só toca manual/arquivo/perna ainda fora da marca, a partir do corte, travando as linhas', async () => {
    await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    const q = dialect.sqlToQuery(executados[0])
    expect(q.sql).toContain('"aguarda_extrato" = false')
    expect(q.sql).toContain('for update')
    expect(q.sql).toContain('set aguarda_extrato = true, balance_applied = false')
    expect(q.params).toEqual(expect.arrayContaining(['org-1', 'nubank', '2026-01-01', 'manual', 'arquivo', 'perna']))
  })

  it('linha ignorada ou futura (fora do saldo) muda de marca mas não estorna', async () => {
    linhasAfetadas = [{ id: 'x', amount_cents: 5000, no_saldo: false }]
    const r = await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    expect(r).toEqual({ reclassificadas: 1, estornoCents: 0 })
    expect(updates).toEqual([])
  })

  it('rodar de novo sem nada a reclassificar não mexe em saldo', async () => {
    const r = await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    expect(r).toEqual({ reclassificadas: 0, estornoCents: 0 })
    expect(updates).toEqual([])
  })
})

describe('inicioDoExtrato', () => {
  it('usa o sync_from_date quando o recurso tem', async () => {
    expect(await inicioDoExtrato(db, 'org-1', 'nubank', '2026-01-01')).toBe('2026-01-01')
  })

  it('sem sync_from_date, a primeira linha do extrato da conta', async () => {
    selectResult = [{ inicio: '2025-10-03' }]
    expect(await inicioDoExtrato(db, 'org-1', 'nubank', null)).toBe('2025-10-03')
  })

  it('sem corte e sem extrato ainda: não reclassifica nada', async () => {
    selectResult = [{ inicio: null }]
    expect(await inicioDoExtrato(db, 'org-1', 'nubank', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/reclassificar-conta.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// apps/web/lib/finance/conciliacao/reclassificar-conta.ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/reclassificar-conta.test.ts`
Expected: PASS. (Se a renderização do `sql` cru mudar espaçamento e o `toContain` da string do `set` falhar, ajuste a string esperada para a que o `PgDialect` imprime — o que importa é o texto do SQL enviado.)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/conciliacao/reclassificar-conta.ts apps/web/__tests__/finance/reclassificar-conta.test.ts
git commit -m "feat(conciliacao): reclassificar conta que virou Open Finance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: R1 no banco — absorver e propor, e a aprovação com o mesmo efeito

**Files:**
- Create: `apps/web/lib/finance/conciliacao/absorver.ts`
- Create: `apps/web/lib/finance/conciliacao/r1-db.ts`
- Modify: `apps/web/lib/finance/forecast-match-actions.ts:59-116` (efeito da absorção no lugar do bloco `ehPernaPrevista`)
- Test: `apps/web/__tests__/finance/absorver.test.ts`
- Test: `apps/web/__tests__/finance/r1-db.test.ts`
- Test: `apps/web/__tests__/finance/aprovar-e-recusar-conciliacao.test.ts` (ajuste de fixture)

**Interfaces:**
- Consumes: `conciliarExtratoComAguardando`, `chaveDoPar`, `efeitoDaAbsorcao`, `JANELA_DE_ABSORCAO_DIAS`, `ParConciliado` (Task 2); `condicaoDePrevisaoSemPropostaAberta`, `condicaoDeRealizadoSemVinculo`, `condicaoDaTransacaoDaOrg` de `@/lib/finance/forecast-match-db`.
- Produces:
  - `interface ProvisoriaAbsorvida { id: string; origem: OrigemDaTransacao; categoryId: string | null; description: string; transferAccountId: string | null; transferGroupId: string | null }`
  - `aplicarEfeitoDaAbsorcao(db: Db, orgId: string, provisoria: ProvisoriaAbsorvida, extratoId: string): Promise<void>`
  - `absorverNoBanco(db: Db, orgId: string, par: ParConciliado): Promise<boolean>`
  - `condicaoSemPropostaPendenteComoRealizado(): SQL`
  - `aplicarR1(db: Db, orgId: string, accountId: string): Promise<{ absorvidas: ParConciliado[]; propostas: number }>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// apps/web/__tests__/finance/absorver.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { absorverNoBanco } from '@/lib/finance/conciliacao/absorver'

/** Fila de retornos: [0] o UPDATE condicional da provisória, depois os selects. */
let retornosDoUpdate: unknown[][] = []
let retornosDoSelect: unknown[][] = []
const sets: Record<string, unknown>[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning']) c[m] = () => c
  return c
}
const db: any = {
  update: () => ({ set: (p: Record<string, unknown>) => { sets.push(p); return chain(retornosDoUpdate.shift() ?? []) } }),
  select: () => chain(retornosDoSelect.shift() ?? []),
}

const EXTRATO_PENDENTE = { reviewState: 'pending', categoryId: null, isAutoCategorized: false }

beforeEach(() => { retornosDoUpdate = []; retornosDoSelect = []; sets.length = 0 })

describe('absorverNoBanco', () => {
  it(':transfer-dest do caso de 28/09: vínculo na perna e o extrato vira transferência vinda do Itaú', async () => {
    retornosDoUpdate = [[{ id: 'perna-18', origem: 'perna', categoryId: null, description: 'Transferência recebida', transferAccountId: null, transferGroupId: 'g-18' }]]
    retornosDoSelect = [[EXTRATO_PENDENTE], [{ accountId: 'itau' }]]
    const ok = await absorverNoBanco(db, 'org-1', { aguardandoId: 'perna-18', extratoId: 'ext-18' })
    expect(ok).toBe(true)
    expect(sets[0]).toEqual({ matchedTransactionId: 'ext-18' })
    expect(sets[1]).toEqual({ type: 'transfer', categoryId: null, reviewState: 'confirmed', transferAccountId: 'itau' })
    expect(sets[1]).not.toHaveProperty('transferGroupId')
  })

  it('outro sync ganhou a corrida (UPDATE condicional não pegou nada): não toca no extrato', async () => {
    retornosDoUpdate = [[]]
    const ok = await absorverNoBanco(db, 'org-1', { aguardandoId: 'a', extratoId: 'e' })
    expect(ok).toBe(false)
    expect(sets).toHaveLength(1)
  })

  it('manual: o extrato herda categoria e descrição', async () => {
    retornosDoUpdate = [[{ id: 'm', origem: 'manual', categoryId: 'cat-feira', description: 'Feira', transferAccountId: null, transferGroupId: null }]]
    retornosDoSelect = [[EXTRATO_PENDENTE]]
    await absorverNoBanco(db, 'org-1', { aguardandoId: 'm', extratoId: 'e' })
    expect(sets[1]).toEqual({ categoryId: 'cat-feira', description: 'Feira', reviewState: 'confirmed', isAutoCategorized: false })
  })
})
```

```ts
// apps/web/__tests__/finance/r1-db.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const absorver = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/finance/conciliacao/absorver', () => ({ absorverNoBanco: (...a: unknown[]) => absorver(...a) }))

const selectQueue: unknown[][] = []
const wheres: SQL[] = []
const propostas: Record<string, unknown>[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => c
  c.where = (w: SQL) => { wheres.push(w); return c }
  return c
}
const db: any = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => ({ values: (v: Record<string, unknown>) => { propostas.push(v); return chain([{ id: 'p' }]) } }),
}

const { aplicarR1 } = await import('@/lib/finance/conciliacao/r1-db')
const dialect = new PgDialect()

const d = (iso: string) => new Date(`${iso}T12:00:00Z`)

beforeEach(() => { selectQueue.length = 0; wheres.length = 0; propostas.length = 0; absorver.mockClear() })

describe('aplicarR1', () => {
  it('par único: absorve; sem propostas', async () => {
    selectQueue.push(
      [{ id: 'perna-18', amountCents: 20000, date: d('2026-09-18'), counterpartyTaxId: null }],
      [{ id: 'ext-18', amountCents: 20000, date: d('2026-09-18'), counterpartyTaxId: '33076492802' }],
      [],
    )
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(absorver).toHaveBeenCalledWith(db, 'org-1', { aguardandoId: 'perna-18', extratoId: 'ext-18' })
    expect(r).toEqual({ absorvidas: [{ aguardandoId: 'perna-18', extratoId: 'ext-18' }], propostas: 0 })
  })

  it('ambíguo: grava uma proposta pendente e não absorve', async () => {
    selectQueue.push(
      [{ id: 'a', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null }],
      [
        { id: 'e1', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null },
        { id: 'e2', amountCents: 500, date: d('2026-09-19'), counterpartyTaxId: null },
      ],
      [],
    )
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(absorver).not.toHaveBeenCalled()
    expect(propostas).toEqual([{ orgId: 'org-1', forecastTransactionId: 'a', realizedTransactionId: 'e1', status: 'pending' }])
    expect(r.propostas).toBe(1)
  })

  it('par recusado não volta', async () => {
    selectQueue.push(
      [{ id: 'a', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null }],
      [{ id: 'e', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null }],
      [{ forecastTransactionId: 'a', realizedTransactionId: 'e' }],
    )
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(r).toEqual({ absorvidas: [], propostas: 0 })
  })

  it('aguardando com proposta aberta e extrato já vinculado ou com proposta pendente ficam de fora', async () => {
    selectQueue.push([{ id: 'a', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null }], [])
    await aplicarR1(db, 'org-1', 'nubank')
    const aguardando = dialect.sqlToQuery(wheres[0]).sql.toLowerCase()
    const extrato = dialect.sqlToQuery(wheres[1]).sql.toLowerCase()
    expect(aguardando).toContain('"aguarda_extrato" = ')
    expect(aguardando).toContain('forecast_transaction_id')
    expect(extrato).toContain('"origem" = ')
    expect(extrato).toContain('matched_transaction_id')
    expect(extrato).toContain('realized_transaction_id')
  })

  it('nada aguardando: não consulta o extrato', async () => {
    selectQueue.push([])
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(r).toEqual({ absorvidas: [], propostas: 0 })
    expect(wheres).toHaveLength(1)
  })
})
```

Em `apps/web/__tests__/finance/aprovar-e-recusar-conciliacao.test.ts`:
- no mock de `@floow/db` (linha 42), acrescente ao objeto `transactions`: `aguardaExtrato: 'aguarda_extrato', origem: 'origem', description: 'description', transferGroupId: 'transfer_group_id', accountId: 'account_id', isAutoCategorized: 'is_auto_categorized'`;
- troque o `it('perna prevista de transferência: ...')` (linha 98) por estes dois:

```ts
  it('perna prevista de transferência: a ponta real vira transferência confirmada, sem categoria', async () => {
    selectQueue.push([PENDENTE])
    selectQueue.push([
      {
        ...PREVISAO_ABERTA, externalId: 'ext-1:transfer-par', transferAccountId: 'conta-itau',
        aguardaExtrato: true, origem: 'perna', categoryId: null, description: 'Transferência recebida', transferGroupId: 'g-1',
      },
      { ...REALIZADO_VALENDO, externalId: 'pix-nubank', transferAccountId: null },
    ])
    // Estado do extrato, lido por `aplicarEfeitoDaAbsorcao`.
    selectQueue.push([{ reviewState: 'pending', categoryId: null, isAutoCategorized: false }])

    const { efetivada } = await aprovarProposta('prop-1')

    expect(efetivada).toBe(true)
    const escritas = ops.filter((o) => o.op === 'update:transactions').map((o) => o.payload)
    expect(escritas).toContainEqual({ matchedTransactionId: 'real-1' })
    expect(escritas).toContainEqual({
      type: 'transfer',
      categoryId: null,
      reviewState: 'confirmed',
      transferAccountId: 'conta-itau',
    })
  })

  it('lançamento manual aguardando o banco: aprovar faz o extrato herdar a categoria do usuário', async () => {
    selectQueue.push([PENDENTE])
    selectQueue.push([
      { ...PREVISAO_ABERTA, aguardaExtrato: true, origem: 'manual', categoryId: 'cat-feira', description: 'Feira', transferGroupId: null },
      REALIZADO_VALENDO,
    ])
    selectQueue.push([{ reviewState: 'pending', categoryId: null, isAutoCategorized: false }])

    const { efetivada } = await aprovarProposta('prop-1')

    expect(efetivada).toBe(true)
    const escritas = ops.filter((o) => o.op === 'update:transactions').map((o) => o.payload)
    expect(escritas).toContainEqual({ categoryId: 'cat-feira', description: 'Feira', reviewState: 'confirmed', isAutoCategorized: false })
  })
```

O `it('previsão recorrente: a ponta real não muda de natureza')` continua valendo sem mudança: `PREVISAO_ABERTA` não tem `aguardaExtrato`, então só o vínculo é gravado.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/absorver.test.ts __tests__/finance/r1-db.test.ts __tests__/finance/aprovar-e-recusar-conciliacao.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `absorver.ts`**

```ts
// apps/web/lib/finance/conciliacao/absorver.ts
import { and, eq, isNull, ne } from 'drizzle-orm'
import { transactions, type getDb, type OrigemDaTransacao } from '@floow/db'
import { efeitoDaAbsorcao, type ParConciliado } from '@floow/core-finance'
import { condicaoDaTransacaoDaOrg } from '@/lib/finance/forecast-match-db'

type Db = ReturnType<typeof getDb>

export interface ProvisoriaAbsorvida {
  id: string
  origem: OrigemDaTransacao
  categoryId: string | null
  description: string
  transferAccountId: string | null
  transferGroupId: string | null
}

const colunasDaProvisoria = {
  id: transactions.id,
  origem: transactions.origem,
  categoryId: transactions.categoryId,
  description: transactions.description,
  transferAccountId: transactions.transferAccountId,
  transferGroupId: transactions.transferGroupId,
}

/**
 * A outra conta da transferência. A perna que aguarda uma conta OF
 * (`:transfer-par`) guarda a origem em `transfer_account_id`; a
 * `:transfer-dest` e a perna manual, não — a origem é a outra linha do grupo.
 */
async function outraContaDaPerna(db: Db, orgId: string, p: ProvisoriaAbsorvida): Promise<string | null> {
  if (p.transferAccountId) return p.transferAccountId
  if (!p.transferGroupId) return null
  const [outra] = await db
    .select({ accountId: transactions.accountId })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.transferGroupId, p.transferGroupId),
        ne(transactions.id, p.id),
      ),
    )
    .limit(1)
  return outra?.accountId ?? null
}

/**
 * O que a linha do extrato ganha ao absorver a provisória (regra em
 * `efeitoDaAbsorcao`). Usado pelo motor (R1) e por `aprovarProposta`, para
 * que decidir na fila e absorver sozinho deem o mesmo resultado.
 */
export async function aplicarEfeitoDaAbsorcao(
  db: Db,
  orgId: string,
  provisoria: ProvisoriaAbsorvida,
  extratoId: string,
): Promise<void> {
  const [extrato] = await db
    .select({
      reviewState: transactions.reviewState,
      categoryId: transactions.categoryId,
      isAutoCategorized: transactions.isAutoCategorized,
    })
    .from(transactions)
    .where(condicaoDaTransacaoDaOrg(extratoId, orgId))
    .limit(1)
  if (!extrato) return

  const outraConta = provisoria.origem === 'perna' ? await outraContaDaPerna(db, orgId, provisoria) : null
  const efeito = efeitoDaAbsorcao(provisoria, extrato, outraConta)
  if (efeito) await db.update(transactions).set(efeito).where(condicaoDaTransacaoDaOrg(extratoId, orgId))
}

/**
 * Grava o vínculo provisória → extrato (o mesmo `matched_transaction_id` de
 * hoje, que `desconciliar` já desfaz) e aplica o efeito no extrato.
 *
 * UPDATE condicional: se outro caminho vinculou a provisória antes (a
 * aprovação na fila, um sync que furou o lock), não pega nada e devolve
 * `false` — nada muda no extrato. Não mexe em saldo: a provisória nunca
 * esteve nele, e o extrato já está.
 */
export async function absorverNoBanco(db: Db, orgId: string, par: ParConciliado): Promise<boolean> {
  const [provisoria] = await db
    .update(transactions)
    .set({ matchedTransactionId: par.extratoId })
    .where(
      and(
        eq(transactions.id, par.aguardandoId),
        eq(transactions.orgId, orgId),
        eq(transactions.aguardaExtrato, true),
        isNull(transactions.matchedTransactionId),
      ),
    )
    .returning(colunasDaProvisoria)

  if (!provisoria) return false
  await aplicarEfeitoDaAbsorcao(db, orgId, provisoria, par.extratoId)
  return true
}
```

- [ ] **Step 4: Implementar `r1-db.ts`**

```ts
// apps/web/lib/finance/conciliacao/r1-db.ts
import { and, eq, gte, inArray, isNull, lte, notExists, sql } from 'drizzle-orm'
import { forecastMatchProposals, transactions, type getDb } from '@floow/db'
import {
  chaveDoPar,
  conciliarExtratoComAguardando,
  JANELA_DE_ABSORCAO_DIAS,
  type LinhaParaConciliar,
  type ParConciliado,
} from '@floow/core-finance'
import { condicaoDePrevisaoSemPropostaAberta, condicaoDeRealizadoSemVinculo } from '@/lib/finance/forecast-match-db'
import { absorverNoBanco } from './absorver'

type Db = ReturnType<typeof getDb>

const DIA_EM_MS = 24 * 60 * 60 * 1000
const dia = (d: Date | string) => new Date(d).toISOString().slice(0, 10)

/**
 * O extrato que já é o realizado de uma proposta pendente (uma recorrência
 * proposta num sync anterior) não é absorvido: se fosse, aprovar a proposta
 * depois violaria `idx_transactions_matched_unique` e a action estouraria.
 * SQL cru com parênteses pelo mesmo motivo de
 * `condicaoDePrevisaoSemPropostaAberta`.
 */
export function condicaoSemPropostaPendenteComoRealizado() {
  return notExists(
    sql`(select 1 from ${forecastMatchProposals} where ${forecastMatchProposals.realizedTransactionId} = ${transactions.id} and ${forecastMatchProposals.status} = 'pending')`,
  )
}

/**
 * R1 — extrato × aguardando. Absorve o par único; propõe o ambíguo em
 * `forecast_match_proposals`, onde o usuário decide em "Confirmar
 * previsões" como hoje. Quem chama segura o lock da conta.
 */
export async function aplicarR1(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<{ absorvidas: ParConciliado[]; propostas: number }> {
  const aguardando = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      counterpartyTaxId: transactions.counterpartyTaxId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.aguardaExtrato, true),
        isNull(transactions.matchedTransactionId),
        eq(transactions.isIgnored, false),
        // Com proposta aberta, a decisão já está com o usuário — inclusive a
        // que `desconciliar` reabriu.
        condicaoDePrevisaoSemPropostaAberta(),
      ),
    )

  if (aguardando.length === 0) return { absorvidas: [], propostas: 0 }

  const tempos = aguardando.map((a) => new Date(a.date).getTime())
  const inicio = new Date(Math.min(...tempos) - JANELA_DE_ABSORCAO_DIAS * DIA_EM_MS)
  const fim = new Date(Math.max(...tempos) + JANELA_DE_ABSORCAO_DIAS * DIA_EM_MS)

  const extrato = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      counterpartyTaxId: transactions.counterpartyTaxId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.origem, 'extrato'),
        eq(transactions.aguardaExtrato, false),
        eq(transactions.isIgnored, false),
        gte(transactions.date, inicio),
        lte(transactions.date, fim),
        condicaoDeRealizadoSemVinculo(),
        condicaoSemPropostaPendenteComoRealizado(),
      ),
    )

  if (extrato.length === 0) return { absorvidas: [], propostas: 0 }

  // O que o usuário já recusou não volta — nem depois de um `desconciliar`.
  const recusadas = await db
    .select({
      forecastTransactionId: forecastMatchProposals.forecastTransactionId,
      realizedTransactionId: forecastMatchProposals.realizedTransactionId,
    })
    .from(forecastMatchProposals)
    .where(
      and(
        eq(forecastMatchProposals.orgId, orgId),
        eq(forecastMatchProposals.status, 'refused'),
        inArray(forecastMatchProposals.forecastTransactionId, aguardando.map((a) => a.id)),
      ),
    )

  const paraRegra = (l: (typeof aguardando)[number]): LinhaParaConciliar => ({
    id: l.id,
    amountCents: l.amountCents,
    dateISO: dia(l.date),
    counterpartyTaxId: l.counterpartyTaxId,
  })

  const { absorver, propor } = conciliarExtratoComAguardando(
    extrato.map(paraRegra),
    aguardando.map(paraRegra),
    new Set(recusadas.map((r) => chaveDoPar(r.forecastTransactionId, r.realizedTransactionId))),
  )

  const absorvidas: ParConciliado[] = []
  for (const par of absorver) {
    if (await absorverNoBanco(db, orgId, par)) absorvidas.push(par)
  }

  let propostas = 0
  for (const par of propor) {
    // `onConflictDoNothing`: par já decidido (`uq_fmp_par`) ou ponta com
    // outra proposta pendente — não é erro, a próxima passada tenta de novo.
    const inserida = await db
      .insert(forecastMatchProposals)
      .values({ orgId, forecastTransactionId: par.aguardandoId, realizedTransactionId: par.extratoId, status: 'pending' })
      .onConflictDoNothing()
      .returning({ id: forecastMatchProposals.id })
    if (inserida.length > 0) propostas++
  }

  return { absorvidas, propostas }
}
```

- [ ] **Step 5: `aprovarProposta` com o mesmo efeito**

Em `forecast-match-actions.ts`:
- troque `import { ehPernaPrevista } from '@/lib/openfinance/perna-prevista'` por `import { aplicarEfeitoDaAbsorcao } from './conciliacao/absorver'`, e acrescente `type Db = ReturnType<typeof getDb>` depois dos imports;
- no `select` de `pontas`, acrescente `aguardaExtrato: transactions.aguardaExtrato, origem: transactions.origem, categoryId: transactions.categoryId, description: transactions.description, transferGroupId: transactions.transferGroupId,`;
- troque o bloco `if (ehPernaPrevista(previsao.externalId)) { ... }` (com o comentário de cima) por:

```ts
    // Linha que aguardava o extrato (perna de transferência, manual, arquivo):
    // o extrato ganha o mesmo efeito que o motor daria ao absorvê-la sozinho
    // (`aplicarEfeitoDaAbsorcao`). A perna vira a outra ponta da transferência
    // e sai de Classificar — senão o usuário a classificaria de novo e
    // criaria um segundo par, cruzado.
    if (previsao.aguardaExtrato) {
      await aplicarEfeitoDaAbsorcao(tx as unknown as Db, orgId, previsao, proposta.realizedTransactionId)
    }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/absorver.test.ts __tests__/finance/r1-db.test.ts __tests__/finance/aprovar-e-recusar-conciliacao.test.ts __tests__/finance/escopo-de-org-nas-actions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/conciliacao/absorver.ts apps/web/lib/finance/conciliacao/r1-db.ts apps/web/lib/finance/forecast-match-actions.ts apps/web/__tests__/finance/absorver.test.ts apps/web/__tests__/finance/r1-db.test.ts apps/web/__tests__/finance/aprovar-e-recusar-conciliacao.test.ts
git commit -m "feat(conciliacao): R1 absorve o par único e propõe o ambíguo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: O motor `conciliarConta` (lock, ordem R1 → R2 → R3) e R2/R3 ajustados

**Files:**
- Create: `apps/web/lib/finance/conciliacao/conciliar-conta.ts`
- Create: `apps/web/lib/finance/conciliacao/aguarda-extrato.ts`
- Modify: `apps/web/lib/finance/forecast-match-db.ts:136-249` (R3 sem perna; realizado nunca aguardando)
- Modify: `apps/web/lib/finance/duplicata-db.ts:28-65` (R2 fora do aguardando)
- Test: `apps/web/__tests__/finance/conciliar-conta.test.ts`
- Test: `apps/web/__tests__/finance/forecast-match-db.test.ts` (ajuste)
- Test: `apps/web/__tests__/finance/duplicata-fora-do-aguardando-sql.test.ts`
- Test: `apps/web/__tests__/finance/sync-propoe-nao-casa.test.ts` (mock de colunas)

**Interfaces:**
- Consumes: `reclassificarConta`, `inicioDoExtrato` (Task 6); `aplicarR1` (Task 7); `criarPropostasDeDuplicata`, `criarPropostasDeConciliacao`; `deveAguardarExtrato` (Task 2); `isOpenFinanceLinkedAccount`.
- Produces:
  - `interface ResumoDaConciliacao { reclassificadas: number; estornoCents: number; absorvidas: ParConciliado[]; propostasDeConciliacao: number; propostasDeDuplicata: number }`
  - `conciliarConta(db: Db, orgId: string, accountId: string): Promise<ResumoDaConciliacao>`
  - `conciliarContas(db: Db, orgId: string, contas: Iterable<string>, rotulo: string): Promise<ResumoDaConciliacao>` (nunca lança; loga por conta)
  - `aguardaExtratoNaConta(db: Db, orgId: string, accountId: string, origem: OrigemDaTransacao): Promise<boolean>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// apps/web/__tests__/finance/conciliar-conta.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const ordem: string[] = []

vi.mock('@/lib/finance/conciliacao/reclassificar-conta', () => ({
  inicioDoExtrato: vi.fn(async () => '2026-01-01'),
  reclassificarConta: vi.fn(async () => { ordem.push('reclassificar'); return { reclassificadas: 2, estornoCents: 32300 } }),
}))
vi.mock('@/lib/finance/conciliacao/r1-db', () => ({
  aplicarR1: vi.fn(async () => { ordem.push('r1'); return { absorvidas: [{ aguardandoId: 'a', extratoId: 'e' }], propostas: 1 } }),
}))
vi.mock('@/lib/finance/duplicata-db', () => ({
  criarPropostasDeDuplicata: vi.fn(async () => { ordem.push('r2'); return 3 }),
}))
vi.mock('@/lib/finance/forecast-match-db', () => ({
  criarPropostasDeConciliacao: vi.fn(async () => { ordem.push('r3'); return 4 }),
}))

let recurso: unknown[] = [{ syncFromDate: '2026-01-01' }]
const locks: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit']) c[m] = () => c
  return c
}
const db: any = {
  select: () => chain(recurso),
  execute: async (q: SQL) => { locks.push(new PgDialect().sqlToQuery(q).params); ordem.push('lock') },
  transaction: async (fn: (tx: unknown) => unknown) => fn(db),
}

const { conciliarConta, conciliarContas } = await import('@/lib/finance/conciliacao/conciliar-conta')
const { aplicarR1 } = await import('@/lib/finance/conciliacao/r1-db')

beforeEach(() => { ordem.length = 0; locks.length = 0; recurso = [{ syncFromDate: '2026-01-01' }] })

describe('conciliarConta', () => {
  it('trava a conta e roda reclassificar → R1 → R2 → R3, nessa ordem', async () => {
    await conciliarConta(db, 'org-1', 'nubank')
    expect(ordem).toEqual(['lock', 'reclassificar', 'r1', 'r2', 'r3'])
    expect(locks[0]).toContain('conciliar-conta:nubank')
  })

  it('soma o resumo: propostas de R1 e de R3 juntas', async () => {
    const r = await conciliarConta(db, 'org-1', 'nubank')
    expect(r).toEqual({
      reclassificadas: 2,
      estornoCents: 32300,
      absorvidas: [{ aguardandoId: 'a', extratoId: 'e' }],
      propostasDeConciliacao: 5,
      propostasDeDuplicata: 3,
    })
  })

  it('conta sem Open Finance vivo: não faz nada', async () => {
    recurso = []
    const r = await conciliarConta(db, 'org-1', 'manual')
    expect(ordem).toEqual([])
    expect(r.propostasDeConciliacao).toBe(0)
  })
})

describe('conciliarContas', () => {
  it('uma conta repetida roda uma vez; falha numa não impede a outra nem sobe', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(aplicarR1).mockRejectedValueOnce(new Error('boom'))
    const r = await conciliarContas(db, 'org-1', ['c1', 'c1', 'c2'], '[teste]')
    expect(ordem.filter((o) => o === 'lock')).toHaveLength(2)
    expect(r.propostasDeDuplicata).toBe(3)
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('[teste]'), expect.any(Error))
    erro.mockRestore()
  })
})
```

```ts
// apps/web/__tests__/finance/duplicata-fora-do-aguardando-sql.test.ts
import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { criarPropostasDeDuplicata } from '@/lib/finance/duplicata-db'

/**
 * R2 é extrato × extrato. A linha que aguarda o extrato (ou que ele já
 * absorveu) nunca é duplicata do extrato que a absorve — propor o par
 * poria na fila, como "duplicata", o lançamento que o motor acabou de
 * conciliar.
 */
const wheres: SQL[] = []
function chain(): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve([]).then(r) }
  c.from = () => c
  c.where = (w: SQL) => { wheres.push(w); return c }
  return c
}

describe('criarPropostasDeDuplicata fora do aguardando', () => {
  it('nem a candidata nem a irmã podem estar aguardando o extrato', async () => {
    await criarPropostasDeDuplicata({ select: () => chain() } as never, 'org-1', 'nubank')
    const q = new PgDialect().sqlToQuery(wheres[0]).sql.toLowerCase()
    expect(q).toContain('"aguarda_extrato" = ')
    expect(q).toContain('irma.aguarda_extrato = false')
  })
})
```

Em `apps/web/__tests__/finance/forecast-match-db.test.ts`:
- troque o `it('perna prevista de transferência entra como previsão', ...)` por:

```ts
  it('perna de transferência não é mais previsão de R3: quem a resolve é R1', async () => {
    selectQueue.push([])
    await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)
    const q = dialect.sqlToQuery(wheres[0])
    expect(q.sql).toContain('"recurring_template_id" is not null')
    expect(q.params).not.toContain('%:transfer-par')
  })

  it('linha que aguarda o extrato nunca é candidata a realizado', async () => {
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([])
    await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)
    expect(sqlDoWhere(1)).toContain('"aguarda_extrato" = ')
  })
```

- apague o `it('transferência de valor exato casa com a perna prevista', ...)` (a perna saiu de R3; o caso passou para `regras.test.ts`).

Em `apps/web/__tests__/finance/sync-propoe-nao-casa.test.ts`, no mock de `@floow/db`, acrescente ao objeto `transactions`: `aguardaExtrato: 'aguarda_extrato', transferGroupId: 'transfer_group_id'`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/conciliar-conta.test.ts __tests__/finance/duplicata-fora-do-aguardando-sql.test.ts __tests__/finance/forecast-match-db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o motor**

```ts
// apps/web/lib/finance/conciliacao/conciliar-conta.ts
import { and, eq, sql } from 'drizzle-orm'
import { openfinanceResources, type getDb } from '@floow/db'
import type { ParConciliado } from '@floow/core-finance'
import { criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'
import { criarPropostasDeDuplicata } from '@/lib/finance/duplicata-db'
import { inicioDoExtrato, reclassificarConta } from './reclassificar-conta'
import { aplicarR1 } from './r1-db'

type Db = ReturnType<typeof getDb>

/**
 * O motor de conciliação: um lugar só decide.
 *
 * Numa conta Open Finance, só o extrato daquela conta move o saldo. Todo
 * caminho que grava numa conta OF chama isto no fim — sync, importação de
 * arquivo, lançamento manual, criação de perna. Caminho novo de entrada chama
 * o motor; não traz regra de dedupe própria.
 *
 * Em ordem, sob `pg_advisory_xact_lock` da conta (dois syncs simultâneos não
 * absorvem a mesma linha duas vezes — o mesmo padrão de `completarParcelas`):
 *  0. reclassifica o que ainda conta no saldo sem ser extrato (idempotente);
 *  1. R1 — extrato × aguardando: absorve o par único, propõe o ambíguo;
 *  2. R2 — extrato × extrato: duplicata reemitida pela fonte, proposta;
 *  3. R3 — previsão de recorrência × extrato, proposta.
 * R1 antes de R3: o extrato absorvido por uma perna não pode ser proposto
 * também contra uma recorrência.
 *
 * Tudo na mesma transação: uma falha desfaz a passada inteira e a próxima
 * tenta de novo, sem meio caminho gravado.
 *
 * Ver docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md §3.3
 */
export interface ResumoDaConciliacao {
  reclassificadas: number
  estornoCents: number
  absorvidas: ParConciliado[]
  propostasDeConciliacao: number
  propostasDeDuplicata: number
}

function resumoVazio(): ResumoDaConciliacao {
  return { reclassificadas: 0, estornoCents: 0, absorvidas: [], propostasDeConciliacao: 0, propostasDeDuplicata: 0 }
}

/** O recurso Open Finance VIVO da conta, se houver — o mesmo critério de `isOpenFinanceLinkedAccount`. */
async function recursoVivoDaConta(db: Db, orgId: string, accountId: string): Promise<{ syncFromDate: string | null } | null> {
  const [recurso] = await db
    .select({ syncFromDate: openfinanceResources.syncFromDate })
    .from(openfinanceResources)
    .where(
      and(
        eq(openfinanceResources.orgId, orgId),
        eq(openfinanceResources.accountId, accountId),
        eq(openfinanceResources.status, 'AVAILABLE'),
      ),
    )
    .limit(1)
  return recurso ?? null
}

export async function conciliarConta(db: Db, orgId: string, accountId: string): Promise<ResumoDaConciliacao> {
  // Conta manual: tudo como hoje (spec §4).
  const recurso = await recursoVivoDaConta(db, orgId, accountId)
  if (!recurso) return resumoVazio()

  return db.transaction(async (transacao) => {
    const tx = transacao as unknown as Db
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`conciliar-conta:${accountId}`}))`)

    const desde = await inicioDoExtrato(tx, orgId, accountId, recurso.syncFromDate)
    const reclassificacao = desde
      ? await reclassificarConta(tx, orgId, accountId, desde)
      : { reclassificadas: 0, estornoCents: 0 }

    const r1 = await aplicarR1(tx, orgId, accountId)
    const propostasDeDuplicata = await criarPropostasDeDuplicata(tx, orgId, accountId)
    const propostasR3 = await criarPropostasDeConciliacao(tx, orgId, accountId)

    return {
      ...reclassificacao,
      absorvidas: r1.absorvidas,
      propostasDeConciliacao: r1.propostas + propostasR3,
      propostasDeDuplicata,
    }
  })
}

/**
 * O motor em várias contas, para quem acabou de gravar. Nunca lança: o dado
 * já entrou, e a próxima passada concilia. Falhar aqui não pode desfazer a
 * ação do usuário nem derrubar o sync.
 */
export async function conciliarContas(
  db: Db,
  orgId: string,
  contas: Iterable<string>,
  rotulo: string,
): Promise<ResumoDaConciliacao> {
  const total = resumoVazio()
  for (const conta of new Set(contas)) {
    try {
      const r = await conciliarConta(db, orgId, conta)
      total.reclassificadas += r.reclassificadas
      total.estornoCents += r.estornoCents
      total.absorvidas.push(...r.absorvidas)
      total.propostasDeConciliacao += r.propostasDeConciliacao
      total.propostasDeDuplicata += r.propostasDeDuplicata
    } catch (error) {
      console.error(`${rotulo} falha ao conciliar a conta ${conta}:`, error)
    }
  }
  return total
}
```

```ts
// apps/web/lib/finance/conciliacao/aguarda-extrato.ts
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
```

- [ ] **Step 4: R3 sem perna, R2 fora do aguardando**

Em `forecast-match-db.ts`, `criarPropostasDeConciliacao`:
- no `where` de `previstos`, troque `or(isNotNull(transactions.recurringTemplateId), condicaoDePernaPrevista()),` e o comentário de cima por:

```ts
        // Só previsão de template (recorrência). A perna de transferência para
        // conta Open Finance aguarda o extrato e é resolvida por R1
        // (`conciliacao/r1-db.ts`), que absorve sem pedir aprovação.
        isNotNull(transactions.recurringTemplateId),
```

- no `where` de `realizados`, depois de `condicaoNaoEPernaPrevista(),`:

```ts
        // Linha que aguarda o extrato não é realizado: é o outro lado de R1.
        eq(transactions.aguardaExtrato, false),
```

- atualize o docstring da função: "O filtro de previsão aberta ... de template ou perna prevista" → "de template"; tire `or` e `condicaoDePernaPrevista` do import se ficarem sem uso.

Em `duplicata-db.ts`, `criarPropostasDeDuplicata`:
- no SQL de `temIrma`, depois de `AND irma.is_ignored = false`, acrescente a linha `AND irma.aguarda_extrato = false`;
- no `where` de `candidatos`, depois de `eq(transactions.isIgnored, false),`:

```ts
        // R2 é extrato × extrato. A linha que aguarda o extrato (ou que ele já
        // absorveu) é assunto de R1, nunca duplicata.
        eq(transactions.aguardaExtrato, false),
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/conciliar-conta.test.ts __tests__/finance/duplicata-fora-do-aguardando-sql.test.ts __tests__/finance/forecast-match-db.test.ts __tests__/finance/sync-propoe-nao-casa.test.ts __tests__/finance/criar-propostas-de-duplicata.test.ts __tests__/finance/previsao-sem-proposta-aberta-sql.test.ts __tests__/finance/realizado-ja-reivindicado-sql.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/conciliacao/conciliar-conta.ts apps/web/lib/finance/conciliacao/aguarda-extrato.ts apps/web/lib/finance/forecast-match-db.ts apps/web/lib/finance/duplicata-db.ts apps/web/__tests__/finance/conciliar-conta.test.ts apps/web/__tests__/finance/duplicata-fora-do-aguardando-sql.test.ts apps/web/__tests__/finance/forecast-match-db.test.ts apps/web/__tests__/finance/sync-propoe-nao-casa.test.ts
git commit -m "feat(conciliacao): motor conciliarConta com lock por conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Um lugar só decide — sync e demais chamadores passam pelo motor

Substitui as chamadas soltas de `criarPropostasDeConciliacao`/`criarPropostasDeDuplicata` em `sync.ts` (~:160-191), `counterparty-actions.ts:148`, `corrigir-regra-actions.ts:147`, `pernas-faltantes.ts:90` e `import-actions.ts:474` (este último sai junto com a extração da Task 10; aqui fica só o teste-guarda, que passa depois da Task 10 — ver Step 4).

**Files:**
- Modify: `apps/web/lib/openfinance/sync.ts:24-27, 160-191`
- Modify: `apps/web/lib/openfinance/counterparty-actions.ts:11, 145-153`
- Modify: `apps/web/lib/openfinance/corrigir-regra-actions.ts:11, 145-153`
- Modify: `apps/web/lib/openfinance/pernas-faltantes.ts:3, 90`
- Test: `apps/web/__tests__/finance/um-lugar-so-decide.test.ts`
- Test: `apps/web/__tests__/openfinance/counterparty-actions.test.ts`, `counterparty-actions-par.test.ts`, `corrigir-regra-actions.test.ts`, `pernas-faltantes.test.ts` (troca de mock)

**Interfaces:**
- Consumes: `conciliarContas(db, orgId, contas, rotulo)` (Task 8).

- [ ] **Step 1: Escrever o teste-guarda que falha**

```ts
// apps/web/__tests__/finance/um-lugar-so-decide.test.ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Cinco rotinas casavam lançamentos, cada uma com sua regra, e o terceiro
 * caminho de duplicata em duas semanas nasceu disso. Agora quem grava chama
 * o motor (`conciliacao/conciliar-conta.ts`); só ele chama as regras.
 * Uma revisão humana não pega o sexto caminho; o CI pega.
 */
const LIB = join(__dirname, '..', '..', 'lib')
const PERMITIDOS = new Set([
  'finance/forecast-match-db.ts',
  'finance/duplicata-db.ts',
  'finance/conciliacao/conciliar-conta.ts',
])

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e)
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(e) ? [full] : []
  })
}

describe('um lugar só decide', () => {
  it('ninguém fora do motor chama criarPropostasDeConciliacao/criarPropostasDeDuplicata', () => {
    const infratores = walk(LIB)
      .map((f) => relative(LIB, f).split(sep).join('/'))
      .filter((rel) => !PERMITIDOS.has(rel))
      .filter((rel) => /criarPropostasDe(Conciliacao|Duplicata)\s*\(/.test(readFileSync(join(LIB, rel), 'utf8')))
    expect(infratores).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/um-lugar-so-decide.test.ts`
Expected: FAIL listando `openfinance/sync.ts`, `openfinance/counterparty-actions.ts`, `openfinance/corrigir-regra-actions.ts`, `openfinance/pernas-faltantes.ts`, `finance/import-actions.ts`.

- [ ] **Step 3: Trocar os chamadores**

`sync.ts`: troque os imports de `criarPropostasDeConciliacao` e `criarPropostasDeDuplicata` por `import { conciliarContas } from '@/lib/finance/conciliacao/conciliar-conta'`. Troque os dois blocos `try { ... criarPropostasDeConciliacao ... }` e `try { ... criarPropostasDeDuplicata ... }` (com seus comentários) por:

```ts
    // O motor de conciliação, depois das páginas e não dentro do persistPage:
    // o `returning` de lá não traz data nem descrição, e é delas que o
    // casamento depende. Reclassifica o que ainda conta no saldo sem ser
    // extrato, absorve o que aguarda (R1), propõe duplicata (R2) e previsão
    // de recorrência (R3). A perna prevista nasceu em OUTRA conta: se a ponta
    // real de lá já chegou num sync anterior, a conciliação tem que rodar lá
    // agora. Nunca lança — o dado já entrou, e a próxima passada concilia.
    const conciliacao = await conciliarContas(db, connection.orgId, [resource.accountId, ...contasComPernaPrevista], '[sync]')
    summary.propostasDeConciliacao += conciliacao.propostasDeConciliacao
    summary.propostasDeDuplicata += conciliacao.propostasDeDuplicata
```

`counterparty-actions.ts`: troque `criarPropostasDeConciliacao` no import de `@/lib/finance/forecast-match-db` (fica só `condicaoForaDeParDeTransferenciaPendente`), acrescente `import { conciliarContas } from '@/lib/finance/conciliacao/conciliar-conta'` e troque o `for (const conta of contasParaConciliar) { try { ... } catch ... }` por:

```ts
  await conciliarContas(db, orgId, contasParaConciliar, '[confirmCounterparty]')
```

(o comentário de cima continua valendo: troque "propõe o par agora" por "concilia agora").

`corrigir-regra-actions.ts`: mesma troca — tire o import de `criarPropostasDeConciliacao`, importe `conciliarContas` e troque o laço por:

```ts
  await conciliarContas(db, orgId, contasParaConciliar, '[corrigirRegra]')
```

`pernas-faltantes.ts`: tire `criarPropostasDeConciliacao` do import (fica `condicaoDeRealizadoSemVinculo`), importe `conciliarContas` e troque a linha 90 por:

```ts
  await conciliarContas(db, orgId, contas, '[pernasFaltantes]')
```

- [ ] **Step 4: Ajustar os testes que mockavam `criarPropostasDeConciliacao`**

Nos quatro arquivos (`counterparty-actions.test.ts:62`, `counterparty-actions-par.test.ts:63`, `corrigir-regra-actions.test.ts:63`, `pernas-faltantes.test.ts:28`), troque o bloco `vi.mock('@/lib/finance/forecast-match-db', ...)` que sobrescreve `criarPropostasDeConciliacao` por:

```ts
const criarPropostas = vi.fn(async (..._args: unknown[]) => ({
  reclassificadas: 0, estornoCents: 0, absorvidas: [], propostasDeConciliacao: 0, propostasDeDuplicata: 0,
}))
vi.mock('@/lib/finance/conciliacao/conciliar-conta', () => ({
  conciliarContas: (...args: unknown[]) => criarPropostas(...args),
}))
```

(Mantenha o nome da variável que o arquivo já usa — `criarPropostas` nos três de `openfinance`; em `pernas-faltantes.test.ts` use o nome que estiver lá.) As asserções que conferiam "chamou para a conta X" passam a conferir o terceiro argumento, que agora é a coleção de contas: `expect([...(criarPropostas.mock.calls[0][2] as Iterable<string>)]).toEqual(['nubank'])` no lugar de `expect(criarPropostas).toHaveBeenCalledWith(expect.anything(), 'org-1', 'nubank')`. Se o arquivo não usa mais nada de `forecast-match-db` além disso, o `vi.importActual` some junto.

`import-actions.ts` ainda chama `criarPropostasDeConciliacao`: o teste-guarda só fica verde ao fim da Task 10. Não pule o Step 2 da Task 10.

- [ ] **Step 5: Rodar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/openfinance __tests__/finance/um-lugar-so-decide.test.ts`
Expected: tudo PASS exceto `um-lugar-so-decide`, que falha listando só `finance/import-actions.ts`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/sync.ts apps/web/lib/openfinance/counterparty-actions.ts apps/web/lib/openfinance/corrigir-regra-actions.ts apps/web/lib/openfinance/pernas-faltantes.ts apps/web/__tests__/finance/um-lugar-so-decide.test.ts apps/web/__tests__/openfinance/counterparty-actions.test.ts apps/web/__tests__/openfinance/counterparty-actions-par.test.ts apps/web/__tests__/openfinance/corrigir-regra-actions.test.ts apps/web/__tests__/openfinance/pernas-faltantes.test.ts
git commit -m "refactor(conciliacao): sync e confirmações passam pelo motor único

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Manual, arquivo e perna nascem aguardando em conta Open Finance

`import-actions.ts` está em 491 linhas: a gravação das linhas do arquivo e a chamada ao motor saem para `import-linhas.ts`.

**Files:**
- Create: `apps/web/lib/finance/import-linhas.ts`
- Modify: `apps/web/lib/finance/import-actions.ts` (os dois blocos de insert+saldo e o laço de `criarPropostasDeConciliacao`)
- Modify: `apps/web/lib/finance/import-transfer.ts`
- Modify: `apps/web/lib/finance/transaction-create-actions.ts` (`createTransaction`)
- Modify: `apps/web/lib/finance/transaction-actions.ts` (`updateTransaction`)
- Test: `apps/web/__tests__/finance/import-linhas.test.ts`
- Test: `apps/web/__tests__/finance/import-transfer.test.ts` (novos `it`)
- Test: `apps/web/__tests__/finance/manual-em-conta-open-finance.test.ts`

**Interfaces:**
- Consumes: `aguardaExtratoNaConta`, `conciliarContas` (Task 8); `deveAplicarSaldoNaEdicao` com `aguardaExtrato` (Task 5).
- Produces:
  - `type LinhaDoArquivo = Omit<NewTransaction, 'origem' | 'aguardaExtrato' | 'balanceApplied'>`
  - `inserirLinhasDoArquivo(tx: Db, args: { accountId: string; linhas: LinhaDoArquivo[]; aguardaExtrato: boolean }): Promise<number>` (quantas entraram)
  - `conciliarDepoisDaImportacao(orgId: string, contas: Iterable<string>): Promise<void>`
  - `inserirTransferenciaImportada(tx, args & { contaImportadaAguarda: boolean })`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// apps/web/__tests__/finance/import-linhas.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { inserirLinhasDoArquivo } from '@/lib/finance/import-linhas'

const inseridas: Record<string, unknown>[][] = []
const updates: string[] = []
let retornoDoInsert: unknown[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['where', 'set', 'onConflictDoNothing', 'returning']) c[m] = () => c
  return c
}
const tx: any = {
  insert: () => ({ values: (v: Record<string, unknown>[]) => { inseridas.push(v); return chain(retornoDoInsert) } }),
  update: (t: any) => { updates.push(getTableName(t)); return chain([]) },
}

const LINHA = { orgId: 'org-1', accountId: 'nubank', type: 'expense' as const, amountCents: -4321, description: 'LUZ', date: new Date('2026-09-20T12:00:00Z'), externalId: 'fitid-1' }

beforeEach(() => { inseridas.length = 0; updates.length = 0; retornoDoInsert = [{ id: 'l1', amountCents: -4321 }] })

describe('inserirLinhasDoArquivo', () => {
  it('conta manual: origem arquivo, no saldo, soma o que entrou', async () => {
    const n = await inserirLinhasDoArquivo(tx, { accountId: 'itau', linhas: [LINHA], aguardaExtrato: false })
    expect(n).toBe(1)
    expect(inseridas[0][0]).toMatchObject({ origem: 'arquivo', aguardaExtrato: false, balanceApplied: true })
    expect(updates).toEqual(['accounts'])
  })

  it('conta Open Finance: aguarda o extrato e não mexe no saldo', async () => {
    await inserirLinhasDoArquivo(tx, { accountId: 'nubank', linhas: [LINHA], aguardaExtrato: true })
    expect(inseridas[0][0]).toMatchObject({ origem: 'arquivo', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual([])
  })

  it('lista vazia: não grava nada', async () => {
    expect(await inserirLinhasDoArquivo(tx, { accountId: 'x', linhas: [], aguardaExtrato: false })).toBe(0)
    expect(inseridas).toEqual([])
  })
})
```

Em `apps/web/__tests__/finance/import-transfer.test.ts`: acrescente `contaImportadaAguarda: false` ao objeto `BASE` e, no `describe`, os casos:

```ts
  it('conta importada é Open Finance: a origem aguarda o extrato e não debita o saldo', async () => {
    selectQueue.push([]) // destino não linked
    await inserirTransferenciaImportada(tx, { ...BASE, contaImportadaAguarda: true })
    expect(inserts[0]).toMatchObject({ origem: 'arquivo', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual(['accounts']) // só o crédito da perna real no destino manual
  })

  it('destino Open Finance sem FITID: perna manual aguardando, sem crédito no destino', async () => {
    selectQueue.push([{ id: 'recurso' }]) // destino linked
    await inserirTransferenciaImportada(tx, { ...BASE, externalId: null })
    expect(inserts[1]).toMatchObject({ accountId: 'nubank', origem: 'perna', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual(['accounts']) // só o débito da origem
  })
```

```ts
// apps/web/__tests__/finance/manual-em-conta-open-finance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

/**
 * Lançamento manual numa conta Open Finance não mexe no saldo: quem move o
 * saldo é o extrato daquela conta, que absorve o manual quando chega (com a
 * categoria que o usuário deu). Em conta manual, tudo como antes.
 */
const inseridos: Record<string, unknown>[] = []
const updates: string[] = []
const aguarda = vi.fn(async (..._a: unknown[]) => false)
const conciliar = vi.fn(async (..._a: unknown[]) => undefined)

vi.mock('@/lib/finance/conciliacao/aguarda-extrato', () => ({ aguardaExtratoNaConta: (...a: unknown[]) => aguarda(...a) }))
vi.mock('@/lib/finance/conciliacao/conciliar-conta', () => ({ conciliarContas: (...a: unknown[]) => conciliar(...a) }))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1', getCategoryRules: async () => [] }))
vi.mock('@/lib/finance/account-actions', () => ({ assertAccountOwnership: async () => undefined }))
vi.mock('@/lib/finance/revalidate', () => ({ revalidateAccountData: vi.fn(), revalidateTransactionData: vi.fn() }))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['where', 'set', 'returning']) c[m] = () => c
  return c
}
const tx: any = {
  insert: () => ({ values: (v: Record<string, unknown>) => { inseridos.push(v); return chain([{ id: 'nova' }]) } }),
  update: (t: any) => { updates.push(getTableName(t)); return chain([]) },
}
vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => ({ transaction: async (fn: (t: unknown) => unknown) => fn(tx) }) }
})

const { createTransaction } = await import('@/lib/finance/transaction-create-actions')

function form(campos: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}
const DESPESA = { accountId: '00000000-0000-4000-8000-000000000001', type: 'expense', amountCents: '4321', description: 'Feira', date: '2026-09-20', categoryId: '00000000-0000-4000-8000-0000000000c1' }

beforeEach(() => { inseridos.length = 0; updates.length = 0; aguarda.mockReset(); conciliar.mockClear() })

describe('createTransaction em conta Open Finance', () => {
  it('conta OF: nasce aguardando, fora do saldo, e chama o motor', async () => {
    aguarda.mockResolvedValue(true)
    await createTransaction(form(DESPESA))
    expect(inseridos[0]).toMatchObject({ origem: 'manual', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual([])
    expect(conciliar).toHaveBeenCalledWith(expect.anything(), 'org-1', [DESPESA.accountId], expect.any(String))
  })

  it('conta manual: soma no saldo como antes', async () => {
    aguarda.mockResolvedValue(false)
    await createTransaction(form(DESPESA))
    expect(inseridos[0]).toMatchObject({ origem: 'manual', aguardaExtrato: false, balanceApplied: true })
    expect(updates).toEqual(['accounts'])
  })

  it('transferência manual para conta OF: a perna de lá aguarda, a de cá soma', async () => {
    aguarda.mockImplementation(async (...a: unknown[]) => a[2] === '00000000-0000-4000-8000-000000000002')
    await createTransaction(form({ ...DESPESA, type: 'transfer', categoryId: '', transferToAccountId: '00000000-0000-4000-8000-000000000002' }))
    expect(inseridos[0]).toMatchObject({ origem: 'perna', aguardaExtrato: false, balanceApplied: true })
    expect(inseridos[1]).toMatchObject({ origem: 'perna', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual(['accounts'])
  })
})
```

(Se `createTransactionSchema` exigir outro formato de id/data, ajuste `DESPESA` para o que o schema aceita — o que importa são as asserções.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/import-linhas.test.ts __tests__/finance/import-transfer.test.ts __tests__/finance/manual-em-conta-open-finance.test.ts`
Expected: FAIL.

- [ ] **Step 3: `import-linhas.ts` e a extração em `import-actions.ts`**

```ts
// apps/web/lib/finance/import-linhas.ts
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
```

Em `import-actions.ts`:
- troque `import { criarPropostasDeConciliacao } from './forecast-match-db'` por `import { conciliarDepoisDaImportacao, contaImportadaAguardaExtrato, inserirLinhasDoArquivo } from './import-linhas'`;
- tire `origem: 'arquivo' as const,` dos dois `rows.map` (a Task 4 pôs; agora é `inserirLinhasDoArquivo` quem declara);
- em `importTransactions`, dentro do `db.transaction`, troque tudo do `const insertedRows = await tx.insert(...)` até o fim do `if (importedCount > 0) { ... }` por:

```ts
    const aguarda = await contaImportadaAguardaExtrato(tx as unknown as Db, orgId, accountId)
    const importedCount = await inserirLinhasDoArquivo(tx as unknown as Db, { accountId, linhas: rows, aguardaExtrato: aguarda })
    const skippedCount = normalized.length - importedCount
```

  e, depois do `db.transaction`, antes dos `revalidatePath`: `await conciliarDepoisDaImportacao(orgId, [accountId])`;
- em `importSelectedTransactions`, dentro do `db.transaction`, logo depois da checagem de dono: `const aguarda = await contaImportadaAguardaExtrato(tx as unknown as Db, orgId, accountId)`; troque o bloco `if (rows.length > 0) { ... }` por:

```ts
    if (rows.length > 0) {
      const inseridas = await inserirLinhasDoArquivo(tx as unknown as Db, { accountId, linhas: rows, aguardaExtrato: aguarda })
      importedCount += inseridas
      skippedCount += rows.length - inseridas
    }
```

  passe `contaImportadaAguarda: aguarda` na chamada de `inserirTransferenciaImportada`; e troque o laço `for (const conta of destinosPrevistos) { try { await criarPropostasDeConciliacao(...) } ... }` (com o comentário) por:

```ts
  // A ponta real pode já estar na outra conta, e a linha do arquivo pode já
  // ter extrato para absorvê-la: o motor roda nas duas agora.
  await conciliarDepoisDaImportacao(orgId, [accountId, ...destinosPrevistos])
```

- `sql` e `accounts` podem ficar sem uso em `import-actions.ts`: tire-os do import se o typecheck/lint acusar.

- [ ] **Step 4: `import-transfer.ts`**

Acrescente `contaImportadaAguarda: boolean` a `args`. No insert da origem, troque para:

```ts
  const origem = await tx.insert(transactions).values({
    orgId: args.orgId,
    accountId: args.accountId,
    type: 'transfer',
    amountCents: -absAmount,
    description: args.description,
    date: args.date,
    externalId: args.externalId,
    importedAt: args.importedAt,
    transferGroupId,
    categoryId: args.categoryId,
    isAutoCategorized: false,
    origem: 'arquivo',
    // Conta importada Open Finance: a linha do arquivo aguarda o extrato.
    aguardaExtrato: args.contaImportadaAguarda,
    balanceApplied: !args.contaImportadaAguarda,
  }).onConflictDoNothing().returning({ id: transactions.id })
```

O débito da origem passa a ser condicional:

```ts
  if (!args.contaImportadaAguarda) {
    await tx.update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-absAmount}` })
      .where(eq(accounts.id, args.accountId))
  }
```

Troque o cálculo de destino por:

```ts
  const destinoLinked = await isOpenFinanceLinkedAccount(tx, args.orgId, args.destAccountId)

  // Com FITID, a perna que aguarda tem chave de dedupe (`:transfer-par`).
  if (destinoLinked && args.externalId !== null) {
```

(o corpo do `if` fica como está). A perna real de destino, no fim, passa a:

```ts
  // Destino manual: perna real no saldo. Destino Open Finance sem FITID: a
  // perna aguarda o extrato de lá, fora do saldo, e o motor a absorve.
  await tx.insert(transactions).values({
    orgId: args.orgId,
    accountId: args.destAccountId,
    type: 'transfer',
    amountCents: absAmount,
    description: args.description,
    date: args.date,
    transferGroupId,
    categoryId: args.categoryId,
    isAutoCategorized: false,
    origem: 'perna',
    aguardaExtrato: destinoLinked,
    balanceApplied: !destinoLinked,
  })

  if (!destinoLinked) {
    await tx.update(accounts)
      .set({ balanceCents: sql`balance_cents + ${absAmount}` })
      .where(eq(accounts.id, args.destAccountId))
  }

  return { inserida: true, destinoPrevisto: destinoLinked ? args.destAccountId : null }
```

- [ ] **Step 5: `createTransaction` e `updateTransaction`**

`transaction-create-actions.ts`: importe `aguardaExtratoNaConta` de `./conciliacao/aguarda-extrato` e `conciliarContas` de `./conciliacao/conciliar-conta`.

No ramo de transferência, dentro do `db.transaction`, logo depois das duas checagens de dono:

```ts
      // Numa conta Open Finance só o extrato move o saldo: a perna de lá
      // aguarda o extrato e o motor a absorve.
      const aguardaOrigem = await aguardaExtratoNaConta(tx as unknown as Db, orgId, input.accountId, 'perna')
      const aguardaDestino = await aguardaExtratoNaConta(tx as unknown as Db, orgId, transferToAccountId, 'perna')
```

Nos `values` das duas pernas acrescente `aguardaExtrato: aguardaOrigem, balanceApplied: !aguardaOrigem,` (origem) e `aguardaExtrato: aguardaDestino, balanceApplied: !aguardaDestino,` (destino); cerque cada `update(accounts)` com `if (!aguardaOrigem) { ... }` / `if (!aguardaDestino) { ... }`. Depois do `db.transaction`, antes dos `revalidate*`:

```ts
    await conciliarContas(db, orgId, [input.accountId, transferToAccountId], '[createTransaction]')
```

No ramo receita/despesa, dentro do `db.transaction`, depois da checagem de dono:

```ts
    const aguarda = await aguardaExtratoNaConta(tx as unknown as Db, orgId, input.accountId, 'manual')
```

acrescente `aguardaExtrato: aguarda, balanceApplied: !aguarda,` aos `values`, cerque o `update(accounts)` com `if (!aguarda) { ... }` e, depois do `db.transaction`:

```ts
  await conciliarContas(db, orgId, [input.accountId], '[createTransaction]')
```

`transaction-actions.ts` (`updateTransaction`): importe `aguardaExtratoNaConta` e `conciliarContas`. Dentro do `db.transaction`, troque o cálculo de `balanceAppliedValue` por:

```ts
    // Numa conta Open Finance, lançamento manual (ou linha de arquivo) editado
    // continua aguardando o extrato — e mover a linha para conta manual a
    // devolve ao saldo.
    const aguardaOrigem = await aguardaExtratoNaConta(tx as unknown as Db, orgId, input.accountId, oldTx.origem)
    const dataEditada = input.date.toISOString().slice(0, 10)
    const balanceAppliedValue = deveAplicarSaldoNaEdicao({ ...oldTx, aguardaExtrato: aguardaOrigem }, dataEditada, hoje)
```

acrescente `aguardaExtrato: aguardaOrigem,` ao `.set({ ... })` da linha editada. Na perna de destino:

```ts
      const aguardaDestino = await aguardaExtratoNaConta(tx as unknown as Db, orgId, input.destAccountId!, 'perna')
      const destinoAplicado = deveAplicarSaldoNaEdicao({ ...oldTx, aguardaExtrato: aguardaDestino }, dataEditada, hoje)
```

use `aguardaExtrato: aguardaDestino, balanceApplied: destinoAplicado,` nos `values` (no lugar de `balanceApplied: balanceAppliedValue`) e `if (destinoAplicado)` no crédito do destino. Depois do `db.transaction`:

```ts
  await conciliarContas(db, orgId, [input.accountId, ...(input.destAccountId ? [input.destAccountId] : [])], '[updateTransaction]')
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance`
Expected: PASS, inclusive `um-lugar-so-decide.test.ts`. Testes de action que já existiam e passaram a quebrar porque o fake de banco não tem `select` para `isOpenFinanceLinkedAccount` ou não espera o motor: acrescente neles

```ts
vi.mock('@/lib/finance/conciliacao/aguarda-extrato', () => ({ aguardaExtratoNaConta: async () => false }))
vi.mock('@/lib/finance/conciliacao/conciliar-conta', () => ({ conciliarContas: async () => undefined }))
```

(conta manual: o comportamento que eles testam não muda).

Run: `pnpm --filter @floow/web typecheck && wc -l apps/web/lib/finance/import-actions.ts apps/web/lib/finance/transaction-create-actions.ts apps/web/lib/finance/transaction-actions.ts`
Expected: sem erro; todos ≤ 500.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/import-linhas.ts apps/web/lib/finance/import-actions.ts apps/web/lib/finance/import-transfer.ts apps/web/lib/finance/transaction-create-actions.ts apps/web/lib/finance/transaction-actions.ts apps/web/__tests__/finance/import-linhas.test.ts apps/web/__tests__/finance/import-transfer.test.ts apps/web/__tests__/finance/manual-em-conta-open-finance.test.ts
git commit -m "feat(conciliacao): manual, arquivo e perna aguardam o extrato em conta OF

Extrai a gravação das linhas do arquivo para import-linhas.ts
(import-actions estava em 491 linhas).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Acrescente ao `git add`, com caminho explícito, os testes antigos que precisaram dos mocks do Step 6.)

---

### Task 11: Selo "aguardando o banco" na lista

**Files:**
- Modify: `apps/web/lib/finance/queries-transactions.ts:~283` (select da listagem)
- Modify: `apps/web/components/finance/transaction-list-types.ts:~56`
- Modify: `apps/web/components/finance/transaction-display-row.tsx:125-176` (`ForecastBadge`)
- Test: `apps/web/__tests__/finance/forecast-badge.test.tsx` (novos `it`)

**Interfaces:**
- Produces: `TransactionRowData.aguardaExtrato?: boolean`.

- [ ] **Step 1: Escrever os testes que falham**

Em `forecast-badge.test.tsx`, dentro do `describe` principal (usa o `renderRow` do arquivo):

```ts
  it('lançamento que aguarda o extrato mostra "aguardando o banco"', () => {
    renderRow({ balanceApplied: false, aguardaExtrato: true, date: '2026-09-18' })
    expect(screen.getByText('aguardando o banco')).toBeTruthy()
    expect(screen.queryByText('não confirmado')).toBeNull()
  })

  it('depois de absorvido pelo extrato, volta ao selo "confirmado"', () => {
    renderRow({ balanceApplied: false, aguardaExtrato: true, matchedTransactionId: 'ext-1' })
    expect(screen.getByText('confirmado')).toBeTruthy()
    expect(screen.queryByText('aguardando o banco')).toBeNull()
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/forecast-badge.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`queries-transactions.ts`, no `select` da listagem, depois de `matchedTransactionId: transactions.matchedTransactionId,`:

```ts
      aguardaExtrato: transactions.aguardaExtrato,
```

`transaction-list-types.ts`, depois de `matchedTransactionId?: string | null`:

```ts
  /**
   * Linha provisória numa conta Open Finance (manual, arquivo, perna de
   * transferência): fora do saldo até o extrato daquela conta absorvê-la.
   */
  aguardaExtrato?: boolean
```

`transaction-display-row.tsx`, em `ForecastBadge`, logo depois do bloco `if (tx.matchedTransactionId) { ... }`:

```tsx
  // Numa conta Open Finance só o extrato move o saldo. Esta linha espera o
  // extrato dela e, até lá, não soma em saldo nenhum. Sem fila nova: quando o
  // extrato chega, o motor absorve sozinho; ambiguidade vai para "Confirmar
  // previsões" (selo "confirmar?", acima deste).
  if (tx.aguardaExtrato && !tx.hasPendingMatchProposal) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800"
        title="Conta conectada ao banco: este lançamento fica fora do saldo até o extrato trazer o mesmo valor. Aí os dois viram um só."
      >
        aguardando o banco
      </span>
    )
  }
```

(O bloco `hasPendingMatchProposal` vem antes na função; mova o novo `if` para depois dele se a ordem no arquivo for outra — "confirmar?" tem prioridade porque exige ação.)

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/forecast-badge.test.tsx __tests__/finance/pagina-de-lancamentos-sql.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/queries-transactions.ts apps/web/components/finance/transaction-list-types.ts apps/web/components/finance/transaction-display-row.tsx apps/web/__tests__/finance/forecast-badge.test.tsx
git commit -m "feat(conciliacao): selo 'aguardando o banco' na lista

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Auditor diário (cron read-only + Sentry)

**Files:**
- Create: `apps/web/lib/finance/conciliacao/auditoria.ts`
- Create: `apps/web/app/api/cron/auditar-conciliacao/route.ts`
- Modify: `apps/web/vercel.json`
- Modify: `apps/web/middleware.ts:17-27` (`PUBLIC_ROUTE_PREFIXES`)
- Test: `apps/web/__tests__/finance/auditar-conciliacao.test.ts`
- Test: `apps/web/__tests__/auth/cron-routes-get.test.ts` (novo `it.each`)

**Interfaces:**
- Consumes: `compararComOBanco` de `@/lib/finance/divergencia-com-o-banco`.
- Produces:
  - `interface AchadosDaAuditoria { paresQueMovemSaldo: { accountId: string; pares: number }[]; divergencias: { accountId: string; diferencaCents: number }[]; invarianteQuebrado: { accountId: string; linhas: number }[] }`
  - `auditarConciliacao(db: Db): Promise<AchadosDaAuditoria>`
  - `divergenciasRelevantes(contas: { accountId: string; saldoLocalCents: number; saldoBancoCents: number | null }[]): { accountId: string; diferencaCents: number }[]`
  - `GET`/`POST` em `/api/cron/auditar-conciliacao`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// apps/web/__tests__/finance/auditar-conciliacao.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const capturar = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => capturar(...a) }))

let achados = { paresQueMovemSaldo: [] as unknown[], divergencias: [] as unknown[], invarianteQuebrado: [] as unknown[] }
vi.mock('@/lib/finance/conciliacao/auditoria', async () => {
  const actual = await vi.importActual<typeof import('@/lib/finance/conciliacao/auditoria')>('@/lib/finance/conciliacao/auditoria')
  return { ...actual, auditarConciliacao: async () => achados }
})
vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => ({}) }
})

const { GET } = await import('@/app/api/cron/auditar-conciliacao/route')
const { divergenciasRelevantes } = await import('@/lib/finance/conciliacao/auditoria')

const pedido = (token?: string) =>
  new Request('https://floow.app/api/cron/auditar-conciliacao', { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeEach(() => {
  capturar.mockClear()
  process.env.CRON_SECRET = 'segredo'
  achados = { paresQueMovemSaldo: [], divergencias: [], invarianteQuebrado: [] }
})

describe('cron auditar-conciliacao', () => {
  it('sem segredo: 401 e não audita', async () => {
    const r = await GET(pedido())
    expect(r.status).toBe(401)
    expect(capturar).not.toHaveBeenCalled()
  })

  it('nada achado: 200 e nenhum evento', async () => {
    const r = await GET(pedido('segredo'))
    expect(r.status).toBe(200)
    expect(capturar).not.toHaveBeenCalled()
  })

  it('um evento por tipo de achado, só com contagens e ids de conta', async () => {
    achados = {
      paresQueMovemSaldo: [{ accountId: 'nubank', pares: 2 }],
      divergencias: [],
      invarianteQuebrado: [{ accountId: 'itau', linhas: 1 }],
    }
    await GET(pedido('segredo'))
    expect(capturar).toHaveBeenCalledTimes(2)
    const [mensagem, contexto] = capturar.mock.calls[0] as [string, { level: string; tags: Record<string, string>; extra: Record<string, unknown> }]
    expect(mensagem).toMatch(/par que move saldo/)
    expect(contexto.level).toBe('warning')
    expect(contexto.tags).toMatchObject({ auditoria: 'conciliacao', achado: 'par_move_saldo' })
    expect(contexto.extra).toEqual({ total: 2, contas: [{ accountId: 'nubank', pares: 2 }] })
  })
})

describe('divergenciasRelevantes', () => {
  it('só acima de R$ 1,00, e ignora conta sem saldo do banco', () => {
    expect(
      divergenciasRelevantes([
        { accountId: 'a', saldoLocalCents: 10_100, saldoBancoCents: 10_000 },
        { accountId: 'b', saldoLocalCents: 10_101, saldoBancoCents: 10_000 },
        { accountId: 'c', saldoLocalCents: 9_000, saldoBancoCents: 10_000 },
        { accountId: 'd', saldoLocalCents: 1, saldoBancoCents: null },
      ]),
    ).toEqual([
      { accountId: 'b', diferencaCents: 101 },
      { accountId: 'c', diferencaCents: -1_000 },
    ])
  })
})
```

Em `apps/web/__tests__/auth/cron-routes-get.test.ts`, dentro do `describe`:

```ts
  // Rota fora da allowlist do middleware é redirecionada para /auth: o cron
  // "roda" todo dia, recebe o HTML do login e não executa nada, sem erro.
  it.each(vercel.crons.map((c) => c.path))('%s passa pelo middleware sem sessão', (path) => {
    const middleware = readFileSync(resolve(repoRoot, 'apps/web/middleware.ts'), 'utf8')
    const prefixos = [...(middleware.match(/PUBLIC_ROUTE_PREFIXES = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(prefixos.some((p) => path.startsWith(p))).toBe(true)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/auditar-conciliacao.test.ts __tests__/auth/cron-routes-get.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar a auditoria**

```ts
// apps/web/lib/finance/conciliacao/auditoria.ts
import { sql } from 'drizzle-orm'
import type { getDb } from '@floow/db'
import { compararComOBanco } from '@/lib/finance/divergencia-com-o-banco'

type Db = ReturnType<typeof getDb>

/**
 * O que não deveria existir se o motor de conciliação estivesse certo. Só
 * lê: achado é bug no motor, e o conserto vai no motor, não em correção
 * silenciosa por aqui.
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
         and r.resource_type in ('ACCOUNT', 'CREDIT_CARD_ACCOUNT')
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
```

- [ ] **Step 4: A rota**

```ts
// apps/web/app/api/cron/auditar-conciliacao/route.ts
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getDb } from '@floow/db'
import { isAuthorizedService } from '@/lib/auth/service-auth'
import { auditarConciliacao } from '@/lib/finance/conciliacao/auditoria'

/**
 * GET /api/cron/auditar-conciliacao — diário, read-only.
 *
 * Procura o que a regra "numa conta Open Finance só o extrato move o saldo"
 * diz que não pode existir, e manda ao Sentry um evento por tipo de achado.
 * Só contagens e ids de conta: nem descrição de lançamento, nem nome.
 */
export async function POST(request: Request) {
  const authorized = isAuthorizedService(request.headers.get('authorization'), [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
  ])
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const achados = await auditarConciliacao(getDb())

    const eventos = [
      { achado: 'par_move_saldo', mensagem: 'conciliação: par que move saldo em conta Open Finance', contas: achados.paresQueMovemSaldo, total: achados.paresQueMovemSaldo.reduce((s, c) => s + c.pares, 0) },
      { achado: 'divergencia_de_saldo', mensagem: 'conciliação: saldo diverge do banco em mais de R$ 1,00', contas: achados.divergencias, total: achados.divergencias.length },
      { achado: 'invariante_quebrado', mensagem: 'conciliação: linha aguardando o extrato dentro do saldo', contas: achados.invarianteQuebrado, total: achados.invarianteQuebrado.reduce((s, c) => s + c.linhas, 0) },
    ]

    for (const e of eventos) {
      if (e.contas.length === 0) continue
      Sentry.captureMessage(e.mensagem, {
        level: 'warning',
        tags: { auditoria: 'conciliacao', achado: e.achado },
        extra: { total: e.total, contas: e.contas },
      })
    }

    return NextResponse.json({
      ok: true,
      paresQueMovemSaldo: achados.paresQueMovemSaldo.length,
      divergencias: achados.divergencias.length,
      invarianteQuebrado: achados.invarianteQuebrado.length,
    })
  } catch (err) {
    console.error('[auditar-conciliacao] falhou:', err)
    return NextResponse.json({ error: 'Audit failed' }, { status: 500 })
  }
}

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
```

`apps/web/vercel.json`, no array `crons`, depois de `import-transactions` (roda às 11h; o auditor às 12h, depois da importação do dia):

```json
    {
      "path": "/api/cron/auditar-conciliacao",
      "schedule": "0 12 * * *"
    }
```

`apps/web/middleware.ts`, em `PUBLIC_ROUTE_PREFIXES`, depois de `'/api/category-suggestions/run-weekly', ...`:

```ts
  '/api/cron/auditar-conciliacao', // Cron diário — usa CRON_SECRET / SERVICE_ROLE_KEY
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/auditar-conciliacao.test.ts __tests__/auth`
Expected: PASS (inclui `auth-boundary.test.ts`: a rota importa `isAuthorizedService`).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/conciliacao/auditoria.ts apps/web/app/api/cron/auditar-conciliacao/route.ts apps/web/vercel.json apps/web/middleware.ts apps/web/__tests__/finance/auditar-conciliacao.test.ts apps/web/__tests__/auth/cron-routes-get.test.ts
git commit -m "feat(conciliacao): auditor diário read-only com alerta no Sentry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Script do legado (`--dry-run` por padrão)

A spec pede `scripts/conciliacao-legado.mjs`; o script é `.mts` rodando com `tsx` (como `backfill-final-do-cartao.mts`) porque precisa rodar o motor de verdade (`conciliarConta`, TypeScript com aliases do app) — reescrever a regra em SQL cru testaria outra coisa. O dry-run é o mesmo caminho, dentro de uma transação que termina em ROLLBACK.

**Files:**
- Create: `scripts/conciliacao-comum.mts`
- Create: `scripts/conciliacao-legado.mts`

**Interfaces:**
- Consumes: `createDb` de `packages/db/src/client`; `conciliarConta` (Task 8).
- Produces: `databaseUrl(): string`, `class Rollback extends Error`, `sigla(nome: string): string`, `brl(centavos: number): string` em `conciliacao-comum.mts`.

- [ ] **Step 1: Módulo comum dos scripts**

```ts
// scripts/conciliacao-comum.mts
import { readFileSync } from 'node:fs'

/** DATABASE_URL do ambiente ou de apps/web/.env.local. */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const texto = readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8')
  for (const linha of texto.split(/\r?\n/)) {
    const i = linha.indexOf('=')
    if (i > 0 && !linha.trim().startsWith('#') && linha.slice(0, i).trim() === 'DATABASE_URL') {
      return linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  throw new Error('DATABASE_URL não encontrada (nem no ambiente nem em apps/web/.env.local)')
}

/** Lançada de dentro da transação para desfazê-la inteira. */
export class Rollback extends Error {}

export const brl = (centavos: number) =>
  (Number(centavos ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Anonimiza: "Nubank Conta" -> "N.C." */
export const sigla = (nome: string) => nome.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').join('.') + '.'
```

- [ ] **Step 2: O script**

```ts
#!/usr/bin/env -S npx tsx
// scripts/conciliacao-legado.mts
/**
 * Aplica a conciliação única ao que já existe (spec de 28/09 §3.6):
 *  0. imprime a contagem por origem (conferência do backfill da 00067);
 *  1. apaga as propostas PENDENTES de perna prevista (`:transfer-par`) — R1
 *     decide de novo, absorvendo ou recriando a proposta se ambíguo. Sem
 *     isto a perna com proposta aberta nunca seria absorvida;
 *  2. roda `conciliarConta` em toda conta Open Finance viva (reclassifica e
 *     aplica R1 → R2 → R3).
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
    for (const o of porOrigem) console.log(`  ${o.origem.padEnd(18)} ${String(o.n).padStart(7)}`)

    const apagadas = await tx.execute<{ id: string }>(sql`
      delete from forecast_match_proposals fmp
       using transactions prev
       where prev.id = fmp.forecast_transaction_id
         and fmp.status = 'pending'
         and prev.external_id like '%:transfer-par'
      returning fmp.id
    `)
    console.log(`\nPropostas pendentes de perna prevista apagadas (R1 decide de novo): ${apagadas.length}\n`)

    const contas = await tx.execute<{ org_id: string; account_id: string; nome: string }>(sql`
      select distinct r.org_id, r.account_id, a.name as nome
        from openfinance_resources r
        join accounts a on a.id = r.account_id
       where r.status = 'AVAILABLE' and r.account_id is not null
         and r.resource_type in ('ACCOUNT', 'CREDIT_CARD_ACCOUNT')
       order by a.name
    `)

    let totalAbsorvidas = 0
    for (const c of contas) {
      const r = await conciliarConta(tx, c.org_id, c.account_id)
      totalAbsorvidas += r.absorvidas.length
      console.log(
        `${sigla(c.nome).padEnd(8)} ${c.account_id}  reclassificadas=${r.reclassificadas}  estorno=${brl(r.estornoCents)}  ` +
          `absorvidas=${r.absorvidas.length}  propostas=${r.propostasDeConciliacao}  duplicatas=${r.propostasDeDuplicata}`,
      )
      if (r.absorvidas.length === 0) continue

      const ids = r.absorvidas.flatMap((p) => [p.aguardandoId, p.extratoId])
      const linhas = await tx
        .select({ id: transactions.id, date: transactions.date, amountCents: transactions.amountCents, externalId: transactions.externalId })
        .from(transactions)
        .where(inArray(transactions.id, ids))
      const porId = new Map(linhas.map((l) => [l.id, l]))
      for (const p of r.absorvidas) {
        const a = porId.get(p.aguardandoId)!
        const e = porId.get(p.extratoId)!
        console.log(
          `    ${a.externalId ?? a.id} (${new Date(a.date).toISOString().slice(0, 10)}, ${brl(a.amountCents)})` +
            `  ->  extrato ${e.id} (${new Date(e.date).toISOString().slice(0, 10)})`,
        )
      }
    }

    console.log(`\nTotal de pares absorvidos: ${totalAbsorvidas}`)
    if (!aplicar) throw new Rollback()
  })
  console.log('\nGravado.')
} catch (e) {
  if (!(e instanceof Rollback)) throw e
  console.log('\nDry-run: ROLLBACK, nada foi gravado. Revise os pares acima e rode com --aplicar.')
} finally {
  await db.$client.end()
}
```

- [ ] **Step 3: Conferir que carrega (sem banco)**

Run: `npx tsx --tsconfig apps/web/tsconfig.json -e "import('./scripts/conciliacao-comum.mts').then(m => console.log(typeof m.databaseUrl))"`
Expected: `function`. (A execução contra o banco é a Task 14, depois da migration aplicada.)

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add scripts/conciliacao-comum.mts scripts/conciliacao-legado.mts
git commit -m "feat(conciliacao): script do legado com dry-run por padrão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Reproduzir o 28/09 contra o banco real, com ROLLBACK

Os testes de unidade mockam o banco e não pegam CHECK, índice único (`idx_transactions_matched_unique`, `uq_fmp_*`) nem SQL que o Postgres recusa. Este script roda o motor de verdade contra a base, dentro de uma transação que **sempre** termina em ROLLBACK. Pré-requisito: o usuário confirmou que aplicou a 00067 (Task 1, Step 7).

**Files:**
- Create: `scripts/conciliacao-repro-28-09.mts`

**Interfaces:**
- Consumes: `conciliarConta` (Task 8), `aguardaExtratoNaConta` (Task 8), `databaseUrl`, `Rollback`, `brl` (Task 13).

- [ ] **Step 1: Escrever o script**

```ts
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
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/conciliacao-repro-28-09.mts
 *
 * Sai com código 1 se alguma checagem falhar.
 */
import { and, eq, sql } from 'drizzle-orm'
import { accounts, createDb, transactions } from '../packages/db/src/index'
import { conciliarConta } from '../apps/web/lib/finance/conciliacao/conciliar-conta'
import { aguardaExtratoNaConta } from '../apps/web/lib/finance/conciliacao/aguarda-extrato'
import { brl, databaseUrl, Rollback } from './conciliacao-comum.mts'

const ORG = 'e37a3049-9710-4a32-ab58-4b0d1d0417b9'
const NUBANK = 'cda45433-1970-40ab-b081-2bc85ea70eb4'
const PERNAS = {
  '01a0b603-4d83-732c-a6d9-19833739b795:transfer-dest': { valor: 20000, dia: '2026-09-18' },
  '01a067d3-1110-70f2-af23-d36cba102883:transfer-dest': { valor: 12300, dia: '2026-09-01' },
} as const
const EXTRATO = new Set(['cf0b94b4-30a7-432b-b0e9-6badbee3b6df', '711b4a08-90ce-4a99-980d-9f95a0e33ec4'])

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

try {
  await db.transaction(async (transacao) => {
    const tx = transacao as unknown as Db

    console.log('\n1. Caso de 28/09')
    const antes = await saldo(tx)
    const r = await conciliarConta(tx, ORG, NUBANK)
    const depois = await saldo(tx)

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

    const ext = await tx
      .select({ id: transactions.id, type: transactions.type, categoryId: transactions.categoryId, transferAccountId: transactions.transferAccountId, grupo: transactions.transferGroupId })
      .from(transactions)
      .where(sql`${transactions.id} in (${sql.join([...EXTRATO].map((i) => sql`${i}`), sql`, `)})`)
    for (const e of ext) {
      checar(`extrato ${e.id} virou transferência sem categoria, com a conta de origem`, e.type === 'transfer' && e.categoryId === null && e.transferAccountId !== null)
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
    checar('saldo igual ao do banco', depois.banco !== null && depois.local === depois.banco, `local ${brl(depois.local)} × banco ${depois.banco === null ? '—' : brl(depois.banco)}`)

    console.log('\n2. Idempotência: rodar de novo não muda nada')
    const r2 = await conciliarConta(tx, ORG, NUBANK)
    const depois2 = await saldo(tx)
    checar('nada reclassificado nem absorvido', r2.reclassificadas === 0 && r2.absorvidas.length === 0, JSON.stringify(r2))
    checar('saldo igual', depois2.local === depois.local)

    console.log('\n3. Manual em conta Open Finance: extrato chega, uma linha, com a categoria do usuário')
    const [cat] = await tx.execute<{ id: string }>(sql`select id from categories where org_id = ${ORG} or org_id is null limit 1`)
    const aguarda = await aguardaExtratoNaConta(tx, ORG, NUBANK, 'manual')
    checar('conta Nubank é Open Finance viva: manual aguarda', aguarda)
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
```

- [ ] **Step 2: Rodar o repro**

Run: `npx tsx --tsconfig apps/web/tsconfig.json scripts/conciliacao-repro-28-09.mts`
Expected: todas as linhas `OK`, "ROLLBACK: nada foi gravado.", código 0.
Se "saldo igual ao do banco" falhar e todo o resto passar, compare a diferença com a de antes do motor: sobrou divergência de outra origem (ex.: saldo do banco desatualizado há mais de um dia). Mostre os números ao usuário antes de seguir — não ajuste a checagem para passar.
Se estourar erro de Postgres (CHECK, índice único, sintaxe), é exatamente o que os mocks escondem: corrija no módulo e rode de novo.

- [ ] **Step 3: Rodar o legado em dry-run contra a base**

Run: `npx tsx --tsconfig apps/web/tsconfig.json scripts/conciliacao-legado.mts`
Expected: a conta do Nubank com `absorvidas=2` listando exatamente
`01a0b603-4d83-732c-a6d9-19833739b795:transfer-dest (2026-09-18, R$ 200,00) -> extrato cf0b94b4-…` (ou `711b4a08-…`) e
`01a067d3-1110-70f2-af23-d36cba102883:transfer-dest (2026-09-01, R$ 123,00) -> extrato …`, e a linha final de ROLLBACK. Qualquer outro par absorvido ou reclassificação inesperada em outra conta: **pare**, mostre a saída ao usuário e revise à mão antes de qualquer `--aplicar` (spec §5).

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add scripts/conciliacao-repro-28-09.mts
git commit -m "test(conciliacao): repro do 28/09 contra o banco real com rollback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Verificação final, merge em `master` e push

**Files:** nenhum novo.

- [ ] **Step 1: Suite inteira e tamanho de arquivo**

Run: `pnpm --filter @floow/core-finance test && pnpm --filter @floow/web test && pnpm --filter @floow/web typecheck`
Expected: tudo verde.

Run: `git diff --name-only master...HEAD | grep -E '\.(ts|tsx|mts|mjs)$' | xargs wc -l | sort -n | tail -5`
Expected: nenhum arquivo acima de 500 linhas.

- [ ] **Step 2: Build de produção**

Run: `pnpm build`
Expected: build conclui sem erro.

- [ ] **Step 3: Confirmar a migration em produção**

Pergunte ao usuário se a 00067 foi aplicada no Supabase de produção (Task 1, Step 7). Sem isso, **não faça o push**: o deploy grava `origem` e todo insert em `transactions` falharia. Os scripts da Task 14 terem rodado contra a base de produção já provam a coluna; se rodaram contra outra base, confirme.

- [ ] **Step 4: Merge e push**

```bash
git branch --show-current
git status --short
git checkout master
git pull --ff-only
git merge --no-ff feat/conciliacao-unica -m "Merge branch 'feat/conciliacao-unica'

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
pnpm build
git push origin master
```
Expected: primeira linha `feat/conciliacao-unica`; `git status --short` sem mudanças destas tarefas pendentes (arquivos de outras sessões, como `apps/web/.gitignore`, ficam como estão — não os adicione); push aceito. Se o push travar em silêncio, confira que `.git/config` ainda força o helper `manager`.

- [ ] **Step 5: Depois do deploy**

Diga ao usuário:
1. O próximo sync de cada conta Open Finance já reclassifica e absorve sozinho.
2. As propostas pendentes antigas de perna prevista bloqueiam a absorção daquela perna até serem apagadas: rodar `npx tsx --tsconfig apps/web/tsconfig.json scripts/conciliacao-legado.mts` (dry-run), revisar a saída juntos e só então `--aplicar`.
3. O auditor roda às 12h (UTC) e alerta no Sentry com a tag `auditoria:conciliacao`; nos primeiros dias, achado de "par que move saldo" antes do `--aplicar` é esperado.
