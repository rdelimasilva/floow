# Reclassificação de natureza Open Finance — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que R$ 231 mil de pagamento de fatura e aplicação de investimento parem de contar como despesa na conta corrente, por decisão confirmada do usuário e não por palpite do app.

**Architecture:** Três camadas em ordem de confiança. O `type` do BCB decide sozinho o que consegue, dentro do normalizador puro. Uma tabela de regras confirmadas pelo usuário decide o resto, numa camada separada em `apps/web/lib/openfinance/`. Um detector puro agrupa despesas suspeitas e sugere — nunca aplica. Mudar natureza não toca `amount_cents` nem `balance_cents`, e é isso que torna seguro reescrever doze meses de histórico.

**Tech Stack:** TypeScript, Next.js 15 (App Router, server actions), Drizzle ORM, Postgres/Supabase, vitest, Tailwind. Monorepo pnpm + turbo.

**Spec:** `docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md`

## Global Constraints

- Nenhum arquivo passa de **500 linhas de código** (regra de `CLAUDE.md`). Se um arquivo alcançar isso, dividir antes de continuar.
- Todo texto de interface e todo comentário em **português do Brasil**, com acentuação correta.
- O normalizador `packages/core-finance/src/openfinance/normalize.ts` **continua puro**: sem I/O, sem banco, sem `Date.now()` implícito além do que já existe.
- Mudança de natureza **nunca** altera `amount_cents`, `balance_cents` ou `date`. Nenhum `UPDATE` deste plano toca a tabela `accounts`.
- Todo `UPDATE` retroativo em `transactions` filtra por `org_id`, `external_id IS NOT NULL` e `transfer_group_id IS NULL`.
- Testes com `vitest`. Rodar do pacote correspondente: `pnpm --filter @floow/core-finance test` ou `pnpm --filter @floow/web test`.
- Commits em português, no formato `tipo(escopo): descrição`.
- Migrations são imutáveis depois de aplicadas: a próxima livre é a `00034`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/core-finance/src/openfinance/normalize.ts` (modificar) | camada 1: `type` do BCB → natureza; expõe `polpType` |
| `supabase/migrations/00034_transaction_nature_rules.sql` (criar) | tabela `transaction_nature_rules`, RLS, coluna `transactions.polp_type` |
| `packages/db/src/schema/automation.ts` (modificar) | tabela Drizzle `transactionNatureRules` |
| `packages/db/src/schema/finance.ts` (modificar) | coluna `polpType` em `transactions` |
| `apps/web/lib/openfinance/nature-rules.ts` (criar) | camada 2 pura: casamento e precedência de regras |
| `apps/web/lib/openfinance/nature-suspects.ts` (criar) | detector puro: agrupa, avalia sinais, explica |
| `apps/web/lib/openfinance/nature-queries.ts` (criar) | leitura que alimenta o detector |
| `apps/web/lib/openfinance/nature-actions.ts` (criar) | server action `createNatureRule` + backfill |
| `apps/web/lib/openfinance/sync.ts` (modificar) | carrega regras, aplica, grava `polp_type` |
| `apps/web/components/openfinance/nature-suspects-banner.tsx` (criar) | banner em `/transactions` |
| `apps/web/components/openfinance/nature-review-panel.tsx` (criar) | painel de revisão por grupo |
| `apps/web/app/(app)/transactions/page.tsx` (modificar) | busca as suspeitas e monta o banner |
| `apps/web/components/finance/transaction-display-row.tsx` (modificar) | atalho de natureza na linha |
| `apps/web/components/finance/transaction-list.tsx` (modificar) | liga o atalho ao diálogo |

---

## Task 1: Camada 1 — o `type` do BCB decide a natureza

**Files:**
- Modify: `packages/core-finance/src/openfinance/normalize.ts`
- Test: `packages/core-finance/src/__tests__/openfinance/normalize.test.ts`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: `NormalizedPolpTransaction.polpType: string | null` — consumido pela Task 3 (`sync.ts` grava) e pela Task 4 (sinal estrutural do detector)

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `packages/core-finance/src/__tests__/openfinance/normalize.test.ts`. O arquivo já tem as fábricas `accountTx()` e `cardTx()` no topo — reusar, não redefinir.

```ts
describe('camada 1: natureza determinada pelo type do BCB', () => {
  it('APLICACAO_FINANCEIRA é transferência mesmo com category_ref de despesa', () => {
    const result = normalizeAccountTransaction(
      accountTx({ type: 'APLICACAO_FINANCEIRA', category_ref: 'OTHER' }),
    )
    expect(result.type).toBe('transfer')
  })

  it('RESGATE_APLIC_FINANCEIRA é transferência, não receita', () => {
    const result = normalizeAccountTransaction(
      accountTx({
        type: 'RESGATE_APLIC_FINANCEIRA',
        credit_debit_type: 'CREDITO',
        category_ref: 'OTHER',
      }),
    )
    expect(result.type).toBe('transfer')
    // O sinal do valor não muda: resgate entra dinheiro, valor positivo.
    expect(result.amountCents).toBeGreaterThan(0)
  })

  it('TRANSFERENCIA_SALDO_RESERVADO é transferência', () => {
    const result = normalizeAccountTransaction(
      accountTx({ type: 'TRANSFERENCIA_SALDO_RESERVADO', category_ref: 'OTHER' }),
    )
    expect(result.type).toBe('transfer')
  })

  it('RENDIMENTO_APLIC_FINANCEIRA é receita: rendimento é dinheiro novo', () => {
    const result = normalizeAccountTransaction(
      accountTx({
        type: 'RENDIMENTO_APLIC_FINANCEIRA',
        credit_debit_type: 'CREDITO',
        category_ref: 'TRANSFER_IN_OTHER_TRANSFER_IN',
      }),
    )
    expect(result.type).toBe('income')
  })

  it('OUTROS não desempata: quem decide é o category_ref', () => {
    const transferencia = normalizeAccountTransaction(
      accountTx({ type: 'OUTROS', category_ref: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' }),
    )
    expect(transferencia.type).toBe('transfer')

    const despesa = normalizeAccountTransaction(
      accountTx({ type: 'OUTROS', category_ref: 'OTHER' }),
    )
    expect(despesa.type).toBe('expense')
  })

  it('polpType carrega o type cru da conta', () => {
    expect(normalizeAccountTransaction(accountTx({ type: 'TARIFA_SERVICOS_AVULSOS' })).polpType).toBe(
      'TARIFA_SERVICOS_AVULSOS',
    )
  })

  it('polpType é null em transação de cartão: transaction_type é outro enum', () => {
    expect(normalizeCardTransaction(cardTx()).polpType).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/core-finance test -- normalize`
Expected: FAIL. Os testes de `type` falham com `expected 'expense' to be 'transfer'`; os de `polpType` falham com `expected undefined to be 'TARIFA_SERVICOS_AVULSOS'`.

- [ ] **Step 3: Adicionar `polpType` à interface**

Em `packages/core-finance/src/openfinance/normalize.ts`, dentro de `NormalizedPolpTransaction`, depois de `categoryRef`:

```ts
  /**
   * `type` cru da Polp (AccountTransactionType). Null em transação de cartão:
   * `transaction_type` do cartão é OUTRO enum (PAGAMENTO_FATURA, ESTORNO,
   * CASHBACK), já consumido inteiro por `cardType()`. Guardar os dois no mesmo
   * campo criaria exatamente a confusão que o cabeçalho de `polp-types.ts`
   * avisa: dois enums distintos em campos de nome parecido.
   */
  polpType: string | null
```

- [ ] **Step 4: Escrever a função de decisão**

No mesmo arquivo, logo antes de `normalizeAccountTransaction`:

```ts
/**
 * Natureza que o `type` do Banco Central determina sozinho, ou `undefined`
 * quando ele não desempata.
 *
 * Tem precedência sobre o `category_ref` de propósito: quando os dois
 * discordam, é o `category_ref` que erra. `Aplicação CDB DI` chegou rotulada
 * `OTHER` e jogou R$ 125 mil em "despesa", enquanto `Saída APLICACAO CDB DI` —
 * a mesma operação, na mesma conta — veio rotulada como transferência. O enum
 * do BCB não tem essa ambiguidade.
 *
 * `PIX`, `TED`, `OUTROS` e a maioria dos outros valores não dizem nada sobre
 * ser gasto ou movimentação, e caem no `undefined`.
 */
function natureFromPolpType(
  type: PolpAccountTransactionType | null | undefined,
): NormalizedPolpTransaction['type'] | undefined {
  switch (type) {
    case 'APLICACAO_FINANCEIRA':
    case 'RESGATE_APLIC_FINANCEIRA':
    case 'TRANSFERENCIA_SALDO_RESERVADO':
      return 'transfer'

    // Rendimento é dinheiro novo, ao contrário do resgate — que é dinheiro que
    // já era do usuário voltando para a conta.
    case 'RENDIMENTO_APLIC_FINANCEIRA':
      return 'income'

    default:
      return undefined
  }
}
```

Acrescentar `PolpAccountTransactionType` ao `import type` que já existe no topo do arquivo:

```ts
import type {
  PolpAccountTransaction,
  PolpAccountTransactionType,
  PolpCardTransaction,
  PolpCounterparty,
} from './polp-types'
```

- [ ] **Step 5: Ligar a decisão e expor `polpType`**

Em `normalizeAccountTransaction`, trocar o cálculo de `type` por:

```ts
  const isCardBillPayment = categoryRef === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
  const type: NormalizedPolpTransaction['type'] =
    natureFromPolpType(tx.type) ??
    (kindForRef(categoryRef ?? '') === 'transfer' ||
    (isCardBillPayment && options.creditCardConnected === true)
      ? 'transfer'
      : tx.credit_debit_type === 'CREDITO'
        ? 'income'
        : 'expense')
```

No objeto de retorno de `normalizeAccountTransaction`, ao lado de `categoryRef`:

```ts
    polpType: tx.type ?? null,
```

No objeto de retorno de `normalizeCardTransaction`, ao lado de `categoryRef`:

```ts
    polpType: null,
```

- [ ] **Step 6: Rodar a suíte inteira do pacote**

Run: `pnpm --filter @floow/core-finance test`
Expected: PASS, inclusive os testes que já existiam de `creditCardConnected`, `parseAmountCents` e `toCompetenceDate`.

- [ ] **Step 7: Commit**

```bash
git add packages/core-finance/src/openfinance/normalize.ts packages/core-finance/src/__tests__/openfinance/normalize.test.ts
git commit -m "feat(openfinance): o type do BCB decide a natureza antes do category_ref"
```

---

## Task 2: Migration e schema Drizzle

**Files:**
- Create: `supabase/migrations/00034_transaction_nature_rules.sql`
- Modify: `packages/db/src/schema/automation.ts`
- Modify: `packages/db/src/schema/finance.ts:126` (ao lado de `categoryRef`)
- Test: `packages/db/src/__tests__/finance-schema.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `transactionNatureRules` (tabela Drizzle, exportada por `@floow/db`), com colunas `id, orgId, accountId, matchType, matchValue, nature, priority, isEnabled, createdAt, updatedAt`; e `transactions.polpType`

- [ ] **Step 1: Escrever os testes de schema que falham**

Adicionar ao fim de `packages/db/src/__tests__/finance-schema.test.ts`:

```ts
import { transactionNatureRules } from '../schema/automation'

describe('transactions: coluna polp_type', () => {
  it('polpType existe', () => {
    expect(transactions.polpType).toBeDefined()
  })
})

describe('transaction_nature_rules', () => {
  it('tem as colunas esperadas', () => {
    expect(transactionNatureRules.id).toBeDefined()
    expect(transactionNatureRules.orgId).toBeDefined()
    expect(transactionNatureRules.accountId).toBeDefined()
    expect(transactionNatureRules.matchType).toBeDefined()
    expect(transactionNatureRules.matchValue).toBeDefined()
    expect(transactionNatureRules.nature).toBeDefined()
    expect(transactionNatureRules.priority).toBeDefined()
    expect(transactionNatureRules.isEnabled).toBeDefined()
  })

  it('accountId é opcional: null vale para a org inteira', () => {
    expect(transactionNatureRules.accountId.notNull).toBe(false)
  })

  it('nature usa o enum transaction_type que já existe', () => {
    expect(transactionNatureRules.nature.enumValues).toEqual(['income', 'expense', 'transfer'])
  })
})
```

O `import` de `transactionNatureRules` vai no topo do arquivo, junto dos outros — não no meio, como está escrito aqui por conveniência de leitura.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/db test -- finance-schema`
Expected: FAIL com erro de importação — `transactionNatureRules` não existe em `../schema/automation`.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/00034_transaction_nature_rules.sql`:

```sql
-- =============================================================================
-- Regras de natureza: transformar despesa em transferência, com confirmação
-- explícita do usuário.
-- -----------------------------------------------------------------------------
-- A Polp classifica a mesma operação de dois jeitos na mesma conta corrente.
-- "Saída APLICACAO CDB DI" vem rotulada como transferência; "Aplicação CDB DI",
-- a mesma operação, vem como OTHER e entrou como despesa — R$ 125 mil. E o
-- débito automático da fatura do cartão chega como TARIFA_SERVICOS_AVULSOS com
-- category_ref de tarifa bancária: R$ 106 mil contados duas vezes, porque as
-- compras do cartão já entraram uma a uma.
--
-- `category_rules` não serve: ela atribui categoria, não natureza, e o
-- category_id de lá é NOT NULL. Tabela irmã, com o mesmo padrão de RLS.
--
-- Ver docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md
-- =============================================================================

CREATE TABLE public.transaction_nature_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- NULL = vale para a org inteira. Preenchido = só naquela conta.
  account_id  uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  match_type  text NOT NULL CHECK (match_type IN ('contains', 'exact')),
  match_value text NOT NULL CHECK (length(btrim(match_value)) > 0),
  nature      public.transaction_type NOT NULL,
  priority    integer NOT NULL DEFAULT 0,
  is_enabled  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_nature_rules_org_id
  ON public.transaction_nature_rules(org_id);

ALTER TABLE public.transaction_nature_rules ENABLE ROW LEVEL SECURITY;

-- Padrão consolidado pela 00026: a chave no JWT é o ARRAY `org_ids`, e
-- `app_metadata ->> 'org_id'` devolve NULL — o que o RLS trata como falso e
-- bloqueia tudo em silêncio.
CREATE POLICY "transaction_nature_rules: members can select"
  ON public.transaction_nature_rules FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "transaction_nature_rules: members can insert"
  ON public.transaction_nature_rules FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

-- WITH CHECK além do USING: sem ele o usuário poderia mover a regra de uma org
-- dele para outra no meio da atualização.
CREATE POLICY "transaction_nature_rules: members can update"
  ON public.transaction_nature_rules FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "transaction_nature_rules: members can delete"
  ON public.transaction_nature_rules FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- `type` cru da Polp (AccountTransactionType). O detector de suspeitas usa como
-- sinal estrutural, e hoje ele se perde depois da normalização. Fica NULL nas
-- linhas já importadas; a próxima sincronização preenche pelo UPDATE de
-- enriquecimento. Sem backfill aqui: o payload cru não está mais disponível.
ALTER TABLE public.transactions ADD COLUMN polp_type text;
```

- [ ] **Step 4: Adicionar a tabela Drizzle**

Em `packages/db/src/schema/automation.ts`, depois do bloco de `categoryRules` e antes de `recurringTemplates`:

```ts
// ---------------------------------------------------------------------------
// Nature Rules
// ---------------------------------------------------------------------------

/**
 * Regras que decidem a NATUREZA de uma transação, não a categoria.
 *
 * Tabela criada na migration 00034. Separada de `category_rules` porque os
 * conceitos são distintos: categoria diz *em que* o dinheiro foi, natureza diz
 * *se* foi dinheiro saindo. Uma regra de categoria nunca deveria poder mudar o
 * total de despesa do orçamento por acidente.
 *
 * `account_id` nulo vale para a org inteira; preenchido, só para aquela conta.
 */
export const transactionNatureRules = pgTable(
  'transaction_nature_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    matchType: text('match_type').notNull().$type<'contains' | 'exact'>(),
    matchValue: text('match_value').notNull(),
    nature: transactionTypeEnum('nature').notNull(),
    priority: integer('priority').notNull().default(0),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxTransactionNatureRulesOrgId: index('idx_transaction_nature_rules_org_id').on(table.orgId),
  })
)

export type TransactionNatureRuleRow = typeof transactionNatureRules.$inferSelect
export type NewTransactionNatureRuleRow = typeof transactionNatureRules.$inferInsert
```

O `import` no topo do arquivo já traz `pgTable, uuid, text, integer, boolean, timestamp, index, date` e `{ categories, transactionTypeEnum, accounts }` de `./finance` — nada a acrescentar.

- [ ] **Step 5: Adicionar `polpType` a `transactions`**

Em `packages/db/src/schema/finance.ts`, imediatamente depois da linha 126 (`categoryRef: text('category_ref'),`):

```ts
    /**
     * `type` cru da Polp (AccountTransactionType), sinal estrutural do detector
     * de suspeitas. Null em lançamento manual e em transação de cartão.
     */
    polpType: text('polp_type'),
```

- [ ] **Step 6: Rodar os testes e o typecheck**

Run: `pnpm --filter @floow/db test`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Aplicar a migration localmente e conferir**

Run: `npx supabase db push`

Depois, no SQL Editor ou via `psql`, conferir que a tabela e as políticas existem:

```sql
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'transaction_nature_rules' ORDER BY cmd;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'polp_type';
```

Expected: quatro políticas (SELECT, INSERT, UPDATE, DELETE) e uma linha com `polp_type`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/00034_transaction_nature_rules.sql packages/db/src/schema/automation.ts packages/db/src/schema/finance.ts packages/db/src/__tests__/finance-schema.test.ts
git commit -m "feat(db): tabela de regras de natureza e coluna polp_type"
```

---

## Task 3: Camada 2 — casamento de regras e ligação no sync

**Files:**
- Create: `apps/web/lib/openfinance/nature-rules.ts`
- Test: `apps/web/__tests__/openfinance/nature-rules.test.ts`
- Modify: `apps/web/lib/openfinance/sync.ts`

**Interfaces:**
- Consumes: `NormalizedPolpTransaction` (com `polpType`, da Task 1); `transactionNatureRules` (da Task 2)
- Produces:
  - `interface NatureRule { id: string; accountId: string | null; matchType: 'contains' | 'exact'; matchValue: string; nature: 'income' | 'expense' | 'transfer'; priority: number; isEnabled: boolean; createdAt: Date }`
  - `foldForMatch(value: string): string`
  - `natureForDescription(description: string, accountId: string, rules: NatureRule[]): 'income' | 'expense' | 'transfer' | undefined`
  - `applyNatureRules(normalized: NormalizedPolpTransaction[], accountId: string, rules: NatureRule[]): NormalizedPolpTransaction[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/web/__tests__/openfinance/nature-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyNatureRules,
  foldForMatch,
  natureForDescription,
  type NatureRule,
} from '@/lib/openfinance/nature-rules'
import type { NormalizedPolpTransaction } from '@floow/core-finance'

/**
 * A regra de natureza é a única coisa no floow que pode transformar despesa em
 * transferência. Errar a precedência aqui apaga ou dobra um mês de gasto no
 * orçamento sem nada acusar.
 */

const CONTA = 'conta-corrente'
const OUTRA_CONTA = 'conta-poupanca'

function rule(overrides: Partial<NatureRule> = {}): NatureRule {
  return {
    id: 'r1',
    accountId: null,
    matchType: 'contains',
    matchValue: 'PERS BLACK',
    nature: 'transfer',
    priority: 0,
    isEnabled: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  }
}

function tx(overrides: Partial<NormalizedPolpTransaction> = {}): NormalizedPolpTransaction {
  return {
    externalId: 'tx-1',
    date: '2026-08-12',
    amountCents: -1180422,
    type: 'expense',
    description: 'Débito automático PERS BLACK 12/08',
    categoryRef: 'BANK_FEES_OTHER_BANK_FEES',
    polpType: 'TARIFA_SERVICOS_AVULSOS',
    payeeMcc: null,
    billPostDate: null,
    billForecastMonth: null,
    installmentNumber: null,
    installmentTotal: null,
    settlement: 'settled',
    foreign: null,
    ...overrides,
  }
}

describe('foldForMatch', () => {
  it('ignora acento, caixa e espaço sobrando', () => {
    expect(foldForMatch('  Aplicação   CDB  ')).toBe('APLICACAO CDB')
  })
})

describe('natureForDescription', () => {
  it('contains casa no meio da descrição', () => {
    expect(natureForDescription('Débito automático PERS BLACK 12/08', CONTA, [rule()])).toBe(
      'transfer',
    )
  })

  it('exact exige a descrição inteira', () => {
    const regras = [rule({ matchType: 'exact', matchValue: 'Aplicação CDB DI' })]
    expect(natureForDescription('Aplicação CDB DI', CONTA, regras)).toBe('transfer')
    expect(natureForDescription('Aplicação CDB DI 12/08', CONTA, regras)).toBeUndefined()
  })

  it('regra de conta específica ganha da regra da org', () => {
    const regras = [
      rule({ id: 'org', accountId: null, nature: 'expense', priority: 99 }),
      rule({ id: 'conta', accountId: CONTA, nature: 'transfer', priority: 0 }),
    ]
    expect(natureForDescription('PERS BLACK', CONTA, regras)).toBe('transfer')
  })

  it('regra de outra conta não vale nesta', () => {
    const regras = [rule({ accountId: OUTRA_CONTA })]
    expect(natureForDescription('PERS BLACK', CONTA, regras)).toBeUndefined()
  })

  it('empate de escopo é resolvido por priority, depois por created_at', () => {
    const porPrioridade = [
      rule({ id: 'baixa', nature: 'expense', priority: 1 }),
      rule({ id: 'alta', nature: 'transfer', priority: 5 }),
    ]
    expect(natureForDescription('PERS BLACK', CONTA, porPrioridade)).toBe('transfer')

    const porData = [
      rule({ id: 'antiga', nature: 'expense', createdAt: new Date('2026-01-01T00:00:00Z') }),
      rule({ id: 'nova', nature: 'transfer', createdAt: new Date('2026-09-01T00:00:00Z') }),
    ]
    expect(natureForDescription('PERS BLACK', CONTA, porData)).toBe('transfer')
  })

  it('regra desligada é ignorada — a função filtra, não confia em quem chama', () => {
    expect(natureForDescription('PERS BLACK', CONTA, [rule({ isEnabled: false })])).toBeUndefined()
  })

  it('match_value só com espaço é ignorado, não casa com tudo', () => {
    expect(natureForDescription('qualquer coisa', CONTA, [rule({ matchValue: '   ' })])).toBeUndefined()
  })
})

describe('applyNatureRules', () => {
  it('troca a natureza e não toca em valor nem data', () => {
    const [resultado] = applyNatureRules([tx()], CONTA, [rule()])
    expect(resultado.type).toBe('transfer')
    expect(resultado.amountCents).toBe(-1180422)
    expect(resultado.date).toBe('2026-08-12')
  })

  it('sem regra que case, devolve a natureza que veio da camada 1 intacta', () => {
    const entrada = [tx({ type: 'transfer', description: 'Aplicação CDB DI' })]
    expect(applyNatureRules(entrada, CONTA, [rule()])[0].type).toBe('transfer')
  })

  it('lista de regras vazia devolve o mesmo array, sem cópia', () => {
    const entrada = [tx()]
    expect(applyNatureRules(entrada, CONTA, [])).toBe(entrada)
  })

  it('uma regra de despesa reafirma despesa: é o caminho que silencia o alerta', () => {
    const regras = [rule({ nature: 'expense' })]
    expect(applyNatureRules([tx()], CONTA, regras)[0].type).toBe('expense')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/web test -- nature-rules`
Expected: FAIL — `Cannot find module '@/lib/openfinance/nature-rules'`.

- [ ] **Step 3: Escrever o módulo**

Criar `apps/web/lib/openfinance/nature-rules.ts`:

```ts
import type { NormalizedPolpTransaction } from '@floow/core-finance'

/**
 * Regras que decidem a NATUREZA de uma transação importada.
 *
 * Só o usuário sabe que "Débito automático PERS BLACK" é o pagamento da fatura
 * do cartão dele. O app pode suspeitar — ver `nature-suspects.ts` — e nunca
 * afirmar: inferir sozinho e aplicar é o erro que a decisão D5 da spec de
 * ingestão evitou, e aqui o dano seria maior, porque natureza errada dobra ou
 * apaga um mês inteiro de gasto no orçamento.
 *
 * Esta camada vive fora do normalizador de propósito. `normalize.ts` é puro e
 * determinístico e não sabe que regras de usuário existem — é essa fronteira
 * que o mantém testável sem banco.
 *
 * Ver docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md
 */

export type TransactionNature = 'income' | 'expense' | 'transfer'

export interface NatureRule {
  id: string
  /** Null = vale para a org inteira. Preenchido = só naquela conta. */
  accountId: string | null
  matchType: 'contains' | 'exact'
  matchValue: string
  nature: TransactionNature
  priority: number
  isEnabled: boolean
  createdAt: Date
}

/**
 * Forma canônica dos dois lados da comparação: sem acento, sem caixa, sem
 * espaço sobrando.
 *
 * "Aplicação" e "APLICACAO" são a mesma coisa para quem escreveu a regra, e o
 * banco manda uma ou outra sem avisar.
 */
export function foldForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Filtra e ordena as regras: desligadas fora, vazias fora, e a ordem em que
 * competem.
 *
 * A ordem é conta específica primeiro, depois `priority` maior, depois mais
 * recente. Quem escreveu "toda 'aplicação' NESTA conta é transferência" foi
 * mais específico que quem escreveu a regra geral, e a intenção mais específica
 * é a que vale.
 *
 * O filtro de `isEnabled` mora aqui, e não em quem chama. `matchCategory` fez o
 * contrário e virou armadilha documentada: uma regra que o usuário desativou
 * voltava a valer se o chamador esquecesse o filtro.
 */
function prepareNatureRules(rules: NatureRule[]): NatureRule[] {
  return rules
    .filter((r) => r.isEnabled && foldForMatch(r.matchValue) !== '')
    .sort((a, b) => {
      const escopoA = a.accountId ? 0 : 1
      const escopoB = b.accountId ? 0 : 1
      if (escopoA !== escopoB) return escopoA - escopoB
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
}

/** Primeira regra preparada que casa, ou `undefined`. */
function matchPrepared(
  foldedDescription: string,
  accountId: string,
  prepared: NatureRule[],
): TransactionNature | undefined {
  for (const rule of prepared) {
    if (rule.accountId !== null && rule.accountId !== accountId) continue

    const needle = foldForMatch(rule.matchValue)
    const hit =
      rule.matchType === 'exact'
        ? foldedDescription === needle
        : foldedDescription.includes(needle)

    if (hit) return rule.nature
  }

  return undefined
}

/** A natureza que as regras do usuário determinam para uma descrição. */
export function natureForDescription(
  description: string,
  accountId: string,
  rules: NatureRule[],
): TransactionNature | undefined {
  return matchPrepared(foldForMatch(description), accountId, prepareNatureRules(rules))
}

/**
 * Aplica as regras a um lote já normalizado.
 *
 * Devolve o MESMO array quando não há regra aplicável, para o caminho comum não
 * pagar uma cópia por página de 500 transações. Nunca altera valor, data ou
 * qualquer outro campo: só `type`.
 */
export function applyNatureRules(
  normalized: NormalizedPolpTransaction[],
  accountId: string,
  rules: NatureRule[],
): NormalizedPolpTransaction[] {
  const prepared = prepareNatureRules(rules)
  if (prepared.length === 0) return normalized

  return normalized.map((tx) => {
    const nature = matchPrepared(foldForMatch(tx.description), accountId, prepared)
    return nature && nature !== tx.type ? { ...tx, type: nature } : tx
  })
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @floow/web test -- nature-rules`
Expected: PASS, os 13 testes.

- [ ] **Step 5: Ligar no `sync.ts`**

Em `apps/web/lib/openfinance/sync.ts`:

Acrescentar aos imports:

```ts
import { transactionNatureRules } from '@floow/db'
import { applyNatureRules, type NatureRule } from './nature-rules'
```

Acrescentar a função de carga, junto de `loadRules`:

```ts
/**
 * Regras de natureza da org.
 *
 * Sem filtro nem ordenação em SQL de propósito: `applyNatureRules` faz os dois,
 * e são poucas linhas por org. Duplicar a regra de precedência em SQL criaria
 * duas verdades — e a versão testada é a de TypeScript.
 */
async function loadNatureRules(db: Db, orgId: string): Promise<NatureRule[]> {
  const rows = await db
    .select()
    .from(transactionNatureRules)
    .where(eq(transactionNatureRules.orgId, orgId))

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    matchType: row.matchType,
    matchValue: row.matchValue,
    nature: row.nature,
    priority: row.priority,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt,
  }))
}
```

No `Promise.all` que já existe em `syncConnectionTransactions`, acrescentar a quarta carga:

```ts
  const [categoryByRef, rules, creditCardConnected, natureRules] = await Promise.all([
    loadCategoryIndex(db, connection.orgId),
    loadRules(db, connection.orgId),
    hasLinkedCreditCard(db, connection.orgId),
    loadNatureRules(db, connection.orgId),
  ])
```

Dentro do `for await (const page of pages)`, entre o `normalizeBatch` e o `persistPage`:

```ts
      // Camada 2: o que o usuário já confirmou sobre esta conta. Só muda
      // `type`; valor, data e descrição passam intactos.
      const comNatureza = applyNatureRules(ok, resource.accountId, natureRules)
```

E `persistPage` passa a receber `normalized: comNatureza` em vez de `normalized: ok`.

- [ ] **Step 6: Gravar `polp_type` nos dois ramos de `persistPage`**

No ramo de `UPDATE` (transação que já existe), acrescentar ao objeto do `.set()`, depois de `categoryRef: tx.categoryRef,`:

```ts
          polpType: tx.polpType,
```

No `toInsert.push({ ... })`, depois de `categoryRef: tx.categoryRef,`:

```ts
      polpType: tx.polpType,
```

O `type` **não** entra no `UPDATE`: a regra de que valor, data e tipo ficam como entraram continua valendo para a sincronização. Quem muda o tipo de uma linha já gravada é a ação da Task 5, sob confirmação do usuário.

- [ ] **Step 7: Typecheck e suíte**

Run: `pnpm --filter @floow/web test`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/openfinance/nature-rules.ts apps/web/__tests__/openfinance/nature-rules.test.ts apps/web/lib/openfinance/sync.ts
git commit -m "feat(openfinance): regras de natureza aplicadas na ingestao"
```

---

## Task 4: Detector de grupos suspeitos

**Files:**
- Create: `apps/web/lib/openfinance/nature-suspects.ts`
- Test: `apps/web/__tests__/openfinance/nature-suspects.test.ts`

**Interfaces:**
- Consumes: `foldForMatch` (da Task 3)
- Produces:
  - `interface SuspectCandidate { id: string; accountId: string; accountName: string; description: string; amountCents: number; categoryRef: string | null; polpType: string | null }`
  - `interface ConnectedCard { label: string; digits: string | null }`
  - `interface KnownTransfer { accountId: string; description: string }`
  - `type SuspectSignal = { kind: 'connected-card'; cardLabel: string } | { kind: 'investment-vocabulary'; token: string } | { kind: 'polp-contradiction'; transferDescription: string }`
  - `interface SuspectGroup { key: string; sample: string; accountId: string; accountName: string; count: number; totalCents: number; transactionIds: string[]; signals: SuspectSignal[]; structuralHint: boolean }`
  - `groupKey(description: string): string`
  - `detectNatureSuspects(input: { candidates: SuspectCandidate[]; cards: ConnectedCard[]; knownTransfers: KnownTransfer[] }): SuspectGroup[]`
  - `explainSuspect(group: SuspectGroup): string`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/web/__tests__/openfinance/nature-suspects.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  detectNatureSuspects,
  explainSuspect,
  groupKey,
  type ConnectedCard,
  type KnownTransfer,
  type SuspectCandidate,
} from '@/lib/openfinance/nature-suspects'

/**
 * O detector sugere e nunca aplica. O teste que importa mais aqui é o
 * NEGATIVO: um detector que marca "Aluguel" como suspeito ensina o usuário a
 * ignorar o alerta, e a partir daí o subsistema inteiro deixa de servir.
 */

const CONTA = 'conta-corrente'

function candidate(overrides: Partial<SuspectCandidate> = {}): SuspectCandidate {
  return {
    id: 'tx-1',
    accountId: CONTA,
    accountName: 'Conta Corrente Itaú',
    description: 'Débito automático PERS BLACK 12/08',
    amountCents: -1180422,
    categoryRef: 'BANK_FEES_OTHER_BANK_FEES',
    polpType: 'TARIFA_SERVICOS_AVULSOS',
    ...overrides,
  }
}

/** Nove meses do mesmo débito, com data diferente na descrição. */
function faturaDoCartao(): SuspectCandidate[] {
  return Array.from({ length: 9 }, (_, i) =>
    candidate({
      id: `fatura-${i}`,
      description: `Débito automático PERS BLACK ${10 + i}/08 1234`,
      amountCents: -1180422,
    }),
  )
}

function aplicacaoCdb(): SuspectCandidate[] {
  return Array.from({ length: 14 }, (_, i) =>
    candidate({
      id: `cdb-${i}`,
      description: 'Aplicação CDB DI',
      amountCents: -895714,
      categoryRef: 'OTHER',
      polpType: 'OUTROS',
    }),
  )
}

const CARTAO: ConnectedCard = { label: 'Cartão · PERSONNALITE MC BLACK · final 1234', digits: '1234' }

const TRANSFERENCIA_CONHECIDA: KnownTransfer[] = [
  { accountId: CONTA, description: 'Saída APLICACAO CDB DI' },
]

describe('groupKey', () => {
  it('remove data e número para o mesmo débito mensal cair num grupo', () => {
    expect(groupKey('Débito automático PERS BLACK 12/08 1234')).toBe('DEBITO AUTOMATICO PERS BLACK')
    expect(groupKey('Débito automático PERS BLACK 11/07 1234')).toBe('DEBITO AUTOMATICO PERS BLACK')
  })
})

describe('detectNatureSuspects', () => {
  it('acha o pagamento de fatura pelo nome do cartão conectado', () => {
    const [grupo] = detectNatureSuspects({
      candidates: faturaDoCartao(),
      cards: [CARTAO],
      knownTransfers: [],
    })

    expect(grupo.count).toBe(9)
    expect(grupo.totalCents).toBe(-1180422 * 9)
    expect(grupo.transactionIds).toHaveLength(9)
    expect(grupo.signals).toContainEqual({ kind: 'connected-card', cardLabel: CARTAO.label })
  })

  it('acha a aplicação de CDB por vocabulário e pela contradição da própria Polp', () => {
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb(),
      cards: [],
      knownTransfers: TRANSFERENCIA_CONHECIDA,
    })

    expect(grupo.signals.map((s) => s.kind).sort()).toEqual([
      'investment-vocabulary',
      'polp-contradiction',
    ])
  })

  it('ordena por dinheiro: o maior grupo vem primeiro', () => {
    const grupos = detectNatureSuspects({
      candidates: [...faturaDoCartao(), ...aplicacaoCdb()],
      cards: [CARTAO],
      knownTransfers: TRANSFERENCIA_CONHECIDA,
    })

    expect(grupos).toHaveLength(2)
    expect(Math.abs(grupos[0].totalCents)).toBeGreaterThan(Math.abs(grupos[1].totalCents))
  })

  it('NÃO sugere despesa legítima recorrente de valor alto', () => {
    const aluguel = Array.from({ length: 12 }, (_, i) =>
      candidate({
        id: `aluguel-${i}`,
        description: 'Aluguel',
        amountCents: -400000,
        categoryRef: 'RENT_AND_UTILITIES_RENT',
        polpType: 'BOLETO',
      }),
    )
    const escola = Array.from({ length: 12 }, (_, i) =>
      candidate({
        id: `escola-${i}`,
        description: 'Mensalidade escola',
        amountCents: -260000,
        categoryRef: 'OTHER',
        polpType: 'OUTROS',
      }),
    )

    expect(
      detectNatureSuspects({ candidates: [...aluguel, ...escola], cards: [CARTAO], knownTransfers: [] }),
    ).toEqual([])
  })

  it('um token só não casa com o cartão: BLACK FRIDAY não é fatura', () => {
    const compras = Array.from({ length: 4 }, (_, i) =>
      candidate({
        id: `bf-${i}`,
        description: 'Compra BLACK FRIDAY',
        amountCents: -50000,
        categoryRef: 'OTHER',
        polpType: 'OUTROS',
      }),
    )

    expect(detectNatureSuspects({ candidates: compras, cards: [CARTAO], knownTransfers: [] })).toEqual([])
  })

  it('sinal estrutural sozinho não produz sugestão', () => {
    const genericos = Array.from({ length: 5 }, (_, i) =>
      candidate({
        id: `g-${i}`,
        description: 'Pagamento fornecedor Zeta',
        amountCents: -300000,
        categoryRef: 'OTHER',
        polpType: 'OUTROS',
      }),
    )

    expect(detectNatureSuspects({ candidates: genericos, cards: [], knownTransfers: [] })).toEqual([])
  })

  it('grupo pequeno e barato fica abaixo do corte', () => {
    const pequeno = [
      candidate({ id: 'p1', description: 'Aplicação CDB DI', amountCents: -2000, categoryRef: 'OTHER' }),
      candidate({ id: 'p2', description: 'Aplicação CDB DI', amountCents: -2000, categoryRef: 'OTHER' }),
    ]

    expect(detectNatureSuspects({ candidates: pequeno, cards: [], knownTransfers: [] })).toEqual([])
  })

  it('grupo de dois lançamentos passa quando o valor é alto', () => {
    const caro = [
      candidate({ id: 'c1', description: 'Aplicação CDB DI', amountCents: -5000000, categoryRef: 'OTHER' }),
      candidate({ id: 'c2', description: 'Aplicação CDB DI', amountCents: -5000000, categoryRef: 'OTHER' }),
    ]

    expect(detectNatureSuspects({ candidates: caro, cards: [], knownTransfers: [] })).toHaveLength(1)
  })

  it('a mesma descrição em contas diferentes vira grupos diferentes', () => {
    const grupos = detectNatureSuspects({
      candidates: [
        ...aplicacaoCdb(),
        ...aplicacaoCdb().map((c) => ({ ...c, id: `outra-${c.id}`, accountId: 'poupanca', accountName: 'Poupança' })),
      ],
      cards: [],
      knownTransfers: [],
    })

    expect(grupos).toHaveLength(2)
    expect(new Set(grupos.map((g) => g.accountId))).toEqual(new Set([CONTA, 'poupanca']))
  })

  it('a contradição só vale na mesma conta', () => {
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb(),
      cards: [],
      knownTransfers: [{ accountId: 'outra-conta', description: 'Saída APLICACAO CDB DI' }],
    })

    expect(grupo.signals.map((s) => s.kind)).toEqual(['investment-vocabulary'])
  })
})

describe('explainSuspect', () => {
  it('explica o cartão pelo nome', () => {
    const [grupo] = detectNatureSuspects({
      candidates: faturaDoCartao(),
      cards: [CARTAO],
      knownTransfers: [],
    })

    expect(explainSuspect(grupo)).toContain('PERSONNALITE MC BLACK')
  })

  it('menciona o rótulo genérico do banco quando há sinal estrutural', () => {
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb(),
      cards: [],
      knownTransfers: TRANSFERENCIA_CONHECIDA,
    })

    expect(grupo.structuralHint).toBe(true)
    expect(explainSuspect(grupo)).toContain('genérico')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/web test -- nature-suspects`
Expected: FAIL — `Cannot find module '@/lib/openfinance/nature-suspects'`.

- [ ] **Step 3: Escrever os tipos e as constantes**

Criar `apps/web/lib/openfinance/nature-suspects.ts`:

```ts
import { foldForMatch } from './nature-rules'

/**
 * Detector de despesas que provavelmente não são gasto.
 *
 * Função pura, sem I/O: recebe as candidatas, os cartões conectados e as
 * transferências que já existem na conta, e devolve grupos com o motivo da
 * suspeita. NÃO escreve nada e NÃO reclassifica nada — quem decide é o usuário,
 * pela ação da camada de regras.
 *
 * Ver docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md
 */

export interface SuspectCandidate {
  id: string
  accountId: string
  accountName: string
  description: string
  /** Negativo: são despesas. */
  amountCents: number
  categoryRef: string | null
  polpType: string | null
}

/** Cartão conectado e vinculado, para o sinal (a). */
export interface ConnectedCard {
  /** Rótulo do recurso mais o nome da conta espelho, para maximizar tokens. */
  label: string
  /** Últimos quatro dígitos, quando a Polp os revelou. */
  digits: string | null
}

/** Transação já classificada como transferência, para o sinal (c). */
export interface KnownTransfer {
  accountId: string
  description: string
}

export type SuspectSignal =
  | { kind: 'connected-card'; cardLabel: string }
  | { kind: 'investment-vocabulary'; token: string }
  | { kind: 'polp-contradiction'; transferDescription: string }

export interface SuspectGroup {
  /** Descrição normalizada. É o `match_value` que a regra vai gravar. */
  key: string
  /** Uma descrição crua do grupo, para mostrar na tela. */
  sample: string
  accountId: string
  accountName: string
  count: number
  /** Soma em centavos, negativa. */
  totalCents: number
  transactionIds: string[]
  signals: SuspectSignal[]
  /**
   * O banco mandou rótulo genérico neste grupo. Nunca admite um grupo sozinho:
   * metade da conta corrente cai em `OTHER` ou `OUTROS`, e usar isso como
   * critério encheria o painel de lixo. Serve para o texto do motivo.
   */
  structuralHint: boolean
}

/**
 * Tokens do nome do cartão que não identificam nada.
 *
 * `displayLabel` vem no formato "Cartão · PERSONNALITE MC BLACK · final 1234";
 * sem esta lista, `CARTAO` e `FINAL` casariam com meio extrato.
 */
const GENERIC_CARD_TOKENS = new Set([
  'CARTAO', 'CARD', 'CONTA', 'FINAL', 'MC', 'VISA', 'MASTER', 'MASTERCARD',
  'ELO', 'AMEX', 'CREDITO', 'CREDIT', 'DEBITO', 'BANCO',
])

/** Vocabulário de investimento. Casado por token inteiro, nunca por substring. */
const INVESTMENT_TOKENS = new Set([
  'APLICACAO', 'APLICACOES', 'RESGATE', 'CDB', 'RDB', 'LCI', 'LCA',
  'TESOURO', 'FUNDO', 'FUNDOS', 'POUPANCA', 'PREVIDENCIA', 'DI',
])

/** Expressões que, com um token de cartão, bastam para suspeitar de fatura. */
const BILL_PAYMENT_PHRASES = ['DEBITO AUTOMATICO', 'PAGAMENTO', 'FATURA']

/**
 * Piso para o grupo aparecer: três lançamentos OU mil reais.
 *
 * Sem piso o painel listaria quarenta grupos de trinta reais e ninguém abriria
 * o segundo. O `OU` existe porque um único pagamento de fatura de R$ 50 mil
 * merece a pergunta tanto quanto doze de R$ 100.
 */
const MIN_GROUP_COUNT = 3
const MIN_GROUP_CENTS = 100_000
```

- [ ] **Step 4: Escrever o agrupamento e os sinais**

Continuar o mesmo arquivo:

```ts
/**
 * Chave de agrupamento.
 *
 * A mesma operação repetida todo mês chega com data e número diferentes no meio
 * da descrição ("Débito automático PERS BLACK 12/08 1234"). Agrupar pela
 * descrição crua daria doze grupos de um lançamento cada, e nenhum passaria do
 * piso.
 */
export function groupKey(description: string): string {
  return foldForMatch(description)
    .replace(/\d[\d./-]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensOf(value: string): string[] {
  return foldForMatch(value)
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 0)
}

/**
 * A descrição casa com um cartão conectado?
 *
 * O nome comercial não aparece inteiro na descrição: o banco abrevia
 * "PERSONNALITE" para "PERS". Por isso o casamento é por prefixo de quatro
 * caracteres, nas duas direções.
 *
 * Exige DOIS tokens distintivos, ou um token mais uma expressão de pagamento.
 * Com um token só, "Compra BLACK FRIDAY" viraria suspeita de fatura do
 * "PERSONNALITE MC BLACK" — e um detector que erra assim ensina o usuário a
 * ignorar o alerta.
 */
function matchesConnectedCard(rawDescription: string, card: ConnectedCard): boolean {
  const descTokens = tokensOf(rawDescription)
  const cardTokens = tokensOf(card.label).filter(
    (token) => token.length >= 3 && !GENERIC_CARD_TOKENS.has(token) && !/^\d+$/.test(token),
  )

  let hits = 0
  for (const cardToken of cardTokens) {
    const casou = descTokens.some(
      (descToken) =>
        descToken.length >= 4 &&
        (cardToken.startsWith(descToken) || descToken.startsWith(cardToken.slice(0, 4))),
    )
    if (casou) hits++
  }

  if (card.digits && descTokens.includes(card.digits)) hits++
  if (hits >= 2) return true

  const folded = foldForMatch(rawDescription)
  return hits === 1 && BILL_PAYMENT_PHRASES.some((phrase) => folded.includes(phrase))
}

/** Primeiro token de investimento da chave, ou null. */
function investmentToken(key: string): string | null {
  for (const token of tokensOf(key)) {
    if (INVESTMENT_TOKENS.has(token)) return token
  }
  return null
}

/**
 * A Polp classificou a mesma coisa como transferência em outro lançamento da
 * mesma conta?
 *
 * "Saída APLICACAO CDB DI" virou transferência e "Aplicação CDB DI" virou
 * despesa — a mesma operação, dois rótulos, na mesma conta. É o sinal mais
 * forte daqui e o único que não depende de vocabulário nenhum: é evidência do
 * próprio dado do usuário.
 *
 * Exige dois tokens de três caracteres ou mais em comum. Com um só, "Aluguel"
 * casaria com qualquer transferência que mencionasse aluguel.
 */
function contradictingTransfer(
  accountId: string,
  key: string,
  transfers: KnownTransfer[],
): string | null {
  const keyTokens = new Set(tokensOf(key).filter((token) => token.length >= 3))
  if (keyTokens.size < 2) return null

  for (const transfer of transfers) {
    if (transfer.accountId !== accountId) continue
    const shared = tokensOf(transfer.description).filter((token) => keyTokens.has(token))
    if (shared.length >= 2) return transfer.description
  }

  return null
}

/** O banco mandou rótulo genérico nesta linha? Reforço, nunca critério. */
function isStructural(candidate: SuspectCandidate): boolean {
  return (
    candidate.categoryRef === 'OTHER' ||
    candidate.categoryRef?.startsWith('BANK_FEES_') === true ||
    candidate.polpType === 'OUTROS' ||
    candidate.polpType === 'TARIFA_SERVICOS_AVULSOS'
  )
}
```

- [ ] **Step 5: Escrever a função principal e a explicação**

Continuar o mesmo arquivo:

```ts
export interface DetectInput {
  candidates: SuspectCandidate[]
  cards: ConnectedCard[]
  knownTransfers: KnownTransfer[]
}

export function detectNatureSuspects({
  candidates,
  cards,
  knownTransfers,
}: DetectInput): SuspectGroup[] {
  interface Bucket extends SuspectGroup {
    rawSamples: string[]
  }

  const buckets = new Map<string, Bucket>()

  for (const candidate of candidates) {
    const key = groupKey(candidate.description)
    if (!key) continue

    // \u0000 nunca aparece numa descrição: separador seguro entre conta e chave.
    const bucketKey = `${candidate.accountId}\u0000${key}`
    let bucket = buckets.get(bucketKey)

    if (!bucket) {
      bucket = {
        key,
        sample: candidate.description,
        accountId: candidate.accountId,
        accountName: candidate.accountName,
        count: 0,
        totalCents: 0,
        transactionIds: [],
        signals: [],
        structuralHint: false,
        rawSamples: [],
      }
      buckets.set(bucketKey, bucket)
    }

    bucket.count++
    bucket.totalCents += candidate.amountCents
    bucket.transactionIds.push(candidate.id)
    bucket.rawSamples.push(candidate.description)
    if (isStructural(candidate)) bucket.structuralHint = true
  }

  const groups: SuspectGroup[] = []

  for (const bucket of buckets.values()) {
    if (bucket.count < MIN_GROUP_COUNT && Math.abs(bucket.totalCents) < MIN_GROUP_CENTS) continue

    const signals: SuspectSignal[] = []

    for (const card of cards) {
      if (bucket.rawSamples.some((description) => matchesConnectedCard(description, card))) {
        signals.push({ kind: 'connected-card', cardLabel: card.label })
        break
      }
    }

    const token = investmentToken(bucket.key)
    if (token) signals.push({ kind: 'investment-vocabulary', token })

    const transferDescription = contradictingTransfer(bucket.accountId, bucket.key, knownTransfers)
    if (transferDescription) signals.push({ kind: 'polp-contradiction', transferDescription })

    // Nenhum sinal, nenhuma pergunta. O sinal estrutural não conta aqui.
    if (signals.length === 0) continue

    const { rawSamples: _ignored, ...group } = bucket
    groups.push({ ...group, signals })
  }

  return groups.sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
}

/** O motivo da suspeita, em português, para a tela. */
export function explainSuspect(group: SuspectGroup): string {
  const parts = group.signals.map((signal) => {
    switch (signal.kind) {
      case 'connected-card':
        return `casa com seu cartão ${signal.cardLabel}, que está conectado ao floow`
      case 'investment-vocabulary':
        return `parece movimentação de investimento ("${signal.token}")`
      case 'polp-contradiction':
        return `o banco classificou "${signal.transferDescription}" como transferência, e isto parece a mesma operação`
    }
  })

  if (group.structuralHint) {
    parts.push('e o rótulo que o banco mandou é genérico')
  }

  return parts.join('; ')
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm --filter @floow/web test -- nature-suspects`
Expected: PASS, os 13 testes.

Se o teste do cartão falhar, conferir a lógica de prefixo com um caso isolado antes de mexer nos limiares: `PERS` (4 caracteres) tem de casar com `PERSONNALITE` por `cardToken.startsWith(descToken)`, e `BLACK` com `BLACK`.

- [ ] **Step 7: Conferir o tamanho do arquivo**

Run: `wc -l apps/web/lib/openfinance/nature-suspects.ts`
Expected: abaixo de 300. Se passar de 500, dividir os sinais em `nature-signals.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/openfinance/nature-suspects.ts apps/web/__tests__/openfinance/nature-suspects.test.ts
git commit -m "feat(openfinance): detector de despesa que pode nao ser gasto"
```

---

## Task 5: Leitura e ação — `createNatureRule` com backfill

**Files:**
- Create: `apps/web/lib/openfinance/nature-queries.ts`
- Create: `apps/web/lib/openfinance/nature-actions.ts`
- Test: `apps/web/__tests__/openfinance/nature-actions.test.ts`

**Interfaces:**
- Consumes: `detectNatureSuspects`, `SuspectGroup` (Task 4); `natureForDescription`, `NatureRule` (Task 3); `transactionNatureRules` (Task 2)
- Produces:
  - `getNatureSuspects(orgId: string): Promise<SuspectGroup[]>`
  - `createNatureRule(input: { accountId: string; matchValue: string; nature: 'income' | 'expense' | 'transfer' }): Promise<{ reclassified: number }>`

- [ ] **Step 1: Escrever a leitura**

Criar `apps/web/lib/openfinance/nature-queries.ts`:

```ts
import { and, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import { getDb, accounts, openfinanceResources, transactions, transactionNatureRules } from '@floow/db'
import {
  detectNatureSuspects,
  type ConnectedCard,
  type KnownTransfer,
  type SuspectCandidate,
  type SuspectGroup,
} from './nature-suspects'
import { natureForDescription, type NatureRule } from './nature-rules'

/**
 * O que o detector precisa saber, buscado do banco.
 *
 * Sem cache de RSC: o resultado muda a cada confirmação do usuário e a cada
 * sincronização, e servir uma versão de sessenta segundos atrás faria o banner
 * anunciar grupos que o usuário acabou de resolver.
 */

/**
 * Janela do detector. Treze meses cobrem o histórico que o orçamento e o pacing
 * usam; ir além encareceria a consulta sem mudar decisão nenhuma.
 */
const LOOKBACK_MONTHS = 13

/** Tipos de conta onde o problema existe. Cartão não entra: veio limpo. */
const CASH_ACCOUNT_TYPES = ['checking', 'savings'] as const

function lookbackDate(): Date {
  const date = new Date()
  date.setMonth(date.getMonth() - LOOKBACK_MONTHS)
  return date
}

export async function getNatureSuspects(orgId: string): Promise<SuspectGroup[]> {
  const db = getDb()
  const cutoff = lookbackDate()

  const [rows, transferRows, cardRows, ruleRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        accountName: accounts.name,
        description: transactions.description,
        amountCents: transactions.amountCents,
        categoryRef: transactions.categoryRef,
        polpType: transactions.polpType,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.orgId, orgId),
          inArray(accounts.type, [...CASH_ACCOUNT_TYPES]),
          eq(transactions.type, 'expense'),
          // Só dado do Open Finance. Lançamento manual do usuário é decisão
          // dele, e o app não tem o que sugerir sobre ela.
          isNotNull(transactions.externalId),
          isNull(transactions.transferGroupId),
          gte(transactions.date, cutoff),
        ),
      ),

    db
      .select({ accountId: transactions.accountId, description: transactions.description })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.orgId, orgId),
          inArray(accounts.type, [...CASH_ACCOUNT_TYPES]),
          eq(transactions.type, 'transfer'),
          isNotNull(transactions.externalId),
          gte(transactions.date, cutoff),
        ),
      ),

    // O rótulo do recurso e o nome da conta espelho, juntos: o usuário costuma
    // batizar a conta com um pedaço do nome que o banco não mandou.
    db
      .select({
        displayLabel: openfinanceResources.displayLabel,
        digits: openfinanceResources.identificationDigits,
        accountName: accounts.name,
      })
      .from(openfinanceResources)
      .innerJoin(accounts, eq(accounts.id, openfinanceResources.accountId))
      .where(
        and(
          eq(openfinanceResources.orgId, orgId),
          eq(openfinanceResources.resourceType, 'CREDIT_CARD_ACCOUNT'),
        ),
      ),

    db
      .select()
      .from(transactionNatureRules)
      .where(eq(transactionNatureRules.orgId, orgId)),
  ])

  const rules: NatureRule[] = ruleRows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    matchType: row.matchType,
    matchValue: row.matchValue,
    nature: row.nature,
    priority: row.priority,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt,
  }))

  // Grupo que o usuário já respondeu não volta a perguntar — inclusive quando a
  // resposta foi "é despesa mesmo". Um alerta que não se resolve é um alerta que
  // se aprende a ignorar.
  const candidates: SuspectCandidate[] = rows.filter(
    (row) => natureForDescription(row.description, row.accountId, rules) === undefined,
  )

  const cards: ConnectedCard[] = cardRows.map((row) => ({
    label: [row.displayLabel, row.accountName].filter(Boolean).join(' '),
    digits: row.digits,
  }))

  const knownTransfers: KnownTransfer[] = transferRows

  return detectNatureSuspects({ candidates, cards, knownTransfers })
}
```

- [ ] **Step 2: Escrever o teste da ação que falha**

Criar `apps/web/__tests__/openfinance/nature-actions.test.ts`. O mock de `db` segue o padrão de `link-resource.test.ts`: uma cadeia que responde a qualquer método e registra as operações.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

/**
 * A ação de natureza reescreve doze meses de histórico. A coisa que não pode
 * acontecer nunca é mexer no saldo: `type` e `balance_cents` são independentes,
 * e um `UPDATE` na tabela `accounts` aqui significaria que alguém confundiu os
 * dois.
 *
 * As outras duas garantias — não tocar lançamento manual, não tocar perna de
 * transferência pareada — vivem na cláusula WHERE, que este mock não consegue
 * inspecionar. São verificadas contra o banco no Step 6.
 */

interface Op {
  op: 'select' | 'insert' | 'update'
  table: string
}

const ops: Op[] = []
const insertQueue: unknown[][] = []
const updateQueue: unknown[][] = []

function makeChain(result: unknown[]): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning', 'orderBy', 'innerJoin']) {
    chain[m] = () => makeChain(result)
  }
  return chain
}

const mockDb = {
  select: () => {
    ops.push({ op: 'select', table: '?' })
    return makeChain([])
  },
  insert: (t: never) => {
    ops.push({ op: 'insert', table: getTableName(t) })
    return makeChain(insertQueue.shift() ?? [{ id: 'regra-1' }])
  },
  update: (t: never) => {
    ops.push({ op: 'update', table: getTableName(t) })
    return makeChain(updateQueue.shift() ?? [{ id: 'tx-1' }])
  },
}

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => mockDb }
})

vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: () => {},
  revalidateSnapshotData: () => {},
}))
vi.mock('@/lib/cache-tags', () => ({ invalidateTag: () => {}, accountsTag: () => 'accounts' }))

beforeEach(() => {
  ops.length = 0
  insertQueue.length = 0
  updateQueue.length = 0
})

describe('createNatureRule', () => {
  it('nunca toca a tabela accounts: natureza não move saldo', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    await createNatureRule({
      accountId: 'conta-1',
      matchValue: 'DEBITO AUTOMATICO PERS BLACK',
      nature: 'transfer',
    })

    expect(ops.filter((o) => o.table === 'accounts')).toEqual([])
  })

  it('grava a regra e devolve quantas linhas reclassificou', async () => {
    updateQueue.push([{ id: 'tx-1' }, { id: 'tx-2' }, { id: 'tx-3' }])
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    const result = await createNatureRule({
      accountId: 'conta-1',
      matchValue: 'APLICACAO CDB DI',
      nature: 'transfer',
    })

    expect(ops.some((o) => o.op === 'insert' && o.table === 'transaction_nature_rules')).toBe(true)
    expect(result.reclassified).toBe(3)
  })

  it('rejeita match_value vazio: casaria com o extrato inteiro', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    await expect(
      createNatureRule({ accountId: 'conta-1', matchValue: '   ', nature: 'transfer' }),
    ).rejects.toThrow()
  })

  it('rejeita natureza fora do enum', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    await expect(
      createNatureRule({ accountId: 'conta-1', matchValue: 'X', nature: 'outra' as never }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `pnpm --filter @floow/web test -- nature-actions`
Expected: FAIL — `Cannot find module '@/lib/openfinance/nature-actions'`.

- [ ] **Step 4: Escrever a ação**

Criar `apps/web/lib/openfinance/nature-actions.ts`:

```ts
'use server'

import { z } from 'zod'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { getDb, transactions, transactionNatureRules } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { foldForMatch } from './nature-rules'

/**
 * O usuário confirma a natureza de um grupo, e a confirmação vale para trás.
 *
 * Mudar natureza NÃO toca `amount_cents` nem `balance_cents`: o sinal já está
 * correto desde a ingestão (débito é negativo) e a agregação de despesa filtra
 * por `type`. É isso que torna seguro reescrever doze meses de histórico.
 *
 * `updateTransaction` NÃO pode ser reusada aqui. Ela recalcula
 * `newSignedAmount = type === 'income' ? +v : -v` (finance/actions.ts:729). Um
 * resgate de CDB é transferência de valor POSITIVO; passar por ali o tornaria
 * negativo e o saldo quebraria em silêncio.
 */

const inputSchema = z.object({
  accountId: z.string().uuid(),
  /** Descrição normalizada do grupo. Vazio casaria com o extrato inteiro. */
  matchValue: z.string().trim().min(2),
  nature: z.enum(['income', 'expense', 'transfer']),
})

export type CreateNatureRuleInput = z.infer<typeof inputSchema>

export async function createNatureRule(
  raw: CreateNatureRuleInput,
): Promise<{ reclassified: number }> {
  const input = inputSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()

  const matchValue = foldForMatch(input.matchValue)
  if (matchValue.length < 2) {
    throw new Error('O texto da regra é curto demais para identificar um lançamento.')
  }

  await db.insert(transactionNatureRules).values({
    orgId,
    accountId: input.accountId,
    matchType: 'contains',
    matchValue,
    nature: input.nature,
  })

  // A comparação repete `foldForMatch` em SQL: sem acento, sem caixa, sem
  // espaço duplo. `unaccent` não está instalado no projeto, então o
  // `translate` faz o trabalho para as vogais que aparecem em português.
  const foldedDescription = sql`
    btrim(regexp_replace(
      upper(translate(${transactions.description},
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
      '\\s+', ' ', 'g'))
  `

  const reclassified = await db
    .update(transactions)
    .set({ type: input.nature, updatedAt: new Date() })
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, input.accountId),
        // As duas cercas: só dado do Open Finance, e nunca perna de
        // transferência pareada — mexer numa perna sem a outra desequilibra.
        isNotNull(transactions.externalId),
        isNull(transactions.transferGroupId),
        sql`${foldedDescription} LIKE ${'%' + matchValue + '%'}`,
      ),
    )
    .returning({ id: transactions.id })

  revalidateTransactionData(orgId)
  // `revalidateAccountData` não existe: `revalidate.ts` só exporta transação,
  // categoria e snapshot. A tag de contas é invalidada direto, como
  // `resource-actions.ts` já faz.
  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)

  return { reclassified: reclassified.length }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm --filter @floow/web test -- nature-actions`
Expected: PASS, os quatro testes.

- [ ] **Step 6: Conferir contra o banco de verdade**

Três verificações em SQL, com um `org_id` real. As duas últimas cobrem as cercas que o mock da Step 2 não consegue inspecionar — a cláusula WHERE é uma árvore de objetos do Drizzle, não texto.

**(1) O `translate` mais `LIKE` casa de fato:**

```sql
SELECT count(*)
FROM transactions t
WHERE t.org_id = '<org_id>'
  AND t.external_id IS NOT NULL
  AND t.transfer_group_id IS NULL
  AND btrim(regexp_replace(
        upper(translate(t.description,
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
        '\s+', ' ', 'g'))
      LIKE '%APLICACAO CDB DI%';
```

Expected: 14, o número de `Aplicação CDB DI` do documento de estado. Se der zero, o `translate` está errado antes de a interface existir — corrigir agora, não depois.

**(2) Lançamento manual fica de fora.** Criar um à mão pela interface, com uma descrição que case com o padrão, e conferir que o filtro não o alcança:

```sql
SELECT id, description, external_id
FROM transactions
WHERE org_id = '<org_id>' AND external_id IS NULL
  AND description ILIKE '%CDB%';
```

Depois de confirmar o grupo pela interface (Task 6), rodar de novo: essas linhas têm de continuar com `type = 'expense'`.

**(3) Perna de transferência pareada fica de fora.** Criar uma transferência entre duas contas pela interface, com descrição que case, e conferir que `transfer_group_id` a protege:

```sql
SELECT id, type, transfer_group_id FROM transactions
WHERE org_id = '<org_id>' AND transfer_group_id IS NOT NULL
  AND description ILIKE '%CDB%';
```

Expected: as duas pernas intactas depois da reclassificação.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/openfinance/nature-queries.ts apps/web/lib/openfinance/nature-actions.ts apps/web/__tests__/openfinance/nature-actions.test.ts
git commit -m "feat(openfinance): confirmar natureza de um grupo e reclassificar o historico"
```

---

## Task 6: Banner e painel de revisão

**Files:**
- Create: `apps/web/components/openfinance/nature-suspects-banner.tsx`
- Create: `apps/web/components/openfinance/nature-review-panel.tsx`
- Modify: `apps/web/app/(app)/transactions/page.tsx`

**Interfaces:**
- Consumes: `getNatureSuspects` (Task 5), `createNatureRule` (Task 5), `explainSuspect` e `SuspectGroup` (Task 4)
- Produces: `<NatureSuspectsBanner groups={SuspectGroup[]} />`

- [ ] **Step 1: Escrever o painel**

Criar `apps/web/components/openfinance/nature-review-panel.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { formatBRL } from '@floow/core-finance'
import { createNatureRule } from '@/lib/openfinance/nature-actions'
import { explainSuspect, type SuspectGroup } from '@/lib/openfinance/nature-suspects'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Onde o usuário decide se um grupo de despesa é gasto de verdade.
 *
 * Os DOIS botões criam regra. "É despesa mesmo" não conserta nada e silencia o
 * grupo para sempre — sem esse caminho o alerta reaparece a cada sincronização,
 * e um alerta que não se resolve é um alerta que se aprende a ignorar.
 */

interface Props {
  open: boolean
  onClose: () => void
  groups: SuspectGroup[]
}

export function NatureReviewPanel({ open, onClose, groups }: Props) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  async function decide(group: SuspectGroup, nature: 'expense' | 'transfer') {
    setPendingKey(group.key)
    try {
      const { reclassified } = await createNatureRule({
        accountId: group.accountId,
        matchValue: group.key,
        nature,
      })
      setResolved((prev) => new Set(prev).add(group.key))
      toast(
        nature === 'transfer'
          ? `${reclassified} lançamentos deixaram de contar como despesa`
          : 'Grupo confirmado como despesa',
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar', 'error')
    } finally {
      setPendingKey(null)
    }
  }

  const pending = groups.filter((group) => !resolved.has(group.key))

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="w-[min(92vw,640px)] max-h-[80vh] overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900">Estes lançamentos são gasto?</h2>
        <p className="mt-1 text-sm text-gray-600">
          O banco classificou como despesa, mas o padrão sugere outra coisa. Só você pode confirmar.
        </p>

        {pending.length === 0 ? (
          <p className="mt-6 text-sm text-gray-600">Nada mais para revisar por aqui.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {pending.map((group) => (
              <li key={`${group.accountId}-${group.key}`} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">{group.sample}</p>
                  <p className="shrink-0 text-sm font-semibold text-red-600">
                    {formatBRL(group.totalCents)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {group.count} lançamentos · {group.accountName}
                </p>
                <p className="mt-2 text-xs text-gray-600">{explainSuspect(group)}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={pendingKey !== null}
                    onClick={() => decide(group, 'transfer')}
                  >
                    É transferência
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pendingKey !== null}
                    onClick={() => decide(group, 'expense')}
                  >
                    É despesa mesmo
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </dialog>
  )
}
```

- [ ] **Step 2: Escrever o banner**

Criar `apps/web/components/openfinance/nature-suspects-banner.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@floow/core-finance'
import type { SuspectGroup } from '@/lib/openfinance/nature-suspects'
import { NatureReviewPanel } from './nature-review-panel'

/**
 * O total em reais no banner é o ponto: "2 grupos para revisar" não move
 * ninguém, "R$ 231.640 de despesa que pode não ser gasto" move.
 */
export function NatureSuspectsBanner({ groups }: { groups: SuspectGroup[] }) {
  const [open, setOpen] = useState(false)
  if (groups.length === 0) return null

  // Módulo: a soma vem negativa (são despesas), e "R$ -231.640 de despesa"
  // faz o leitor parar para interpretar um sinal que não acrescenta nada.
  const total = Math.abs(groups.reduce((sum, group) => sum + group.totalCents, 0))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <span>
          <strong>{formatBRL(total)}</strong> em {groups.length}{' '}
          {groups.length === 1 ? 'grupo' : 'grupos'} de despesa que pode não ser gasto
        </span>
        <span className="ml-auto shrink-0 font-medium underline">revisar</span>
      </button>

      <NatureReviewPanel open={open} onClose={() => setOpen(false)} groups={groups} />
    </>
  )
}
```

- [ ] **Step 3: Ligar na página**

Em `apps/web/app/(app)/transactions/page.tsx`:

Acrescentar aos imports:

```ts
import { getNatureSuspects } from '@/lib/openfinance/nature-queries'
import { NatureSuspectsBanner } from '@/components/openfinance/nature-suspects-banner'
```

Acrescentar `getNatureSuspects(orgId)` ao `Promise.all` que já busca as outras quatro coisas:

```ts
  const [
    { transactions, totalCount, startingBalance },
    accounts,
    categories,
    categoryOrder,
    natureSuspects,
  ] = await Promise.all([
    getTransactionsWithCount(orgId, queryOpts),
    getAccounts(orgId),
    getCategories(orgId),
    getCategoryUsageOrder(orgId),
    getNatureSuspects(orgId),
  ])
```

No JSX, imediatamente depois de `<PageHeader …/>` e antes de `<TransactionFilters …/>`:

```tsx
      <NatureSuspectsBanner groups={natureSuspects} />
```

- [ ] **Step 4: Rodar o app e conferir com dado real**

Run: `pnpm --filter @floow/web dev`

Abrir `http://localhost:3000/transactions`. Esperado: o banner aparece com dois grupos — o débito automático do cartão e a aplicação de CDB — somando aproximadamente R$ 231 mil. Abrir o painel e conferir que o motivo de cada grupo nomeia o cartão e a contradição.

**Não confirmar nada ainda** — a confirmação é irreversível pela interface. Conferir primeiro no SQL Editor que os grupos correspondem:

```sql
SELECT t.description, count(*), (sum(t.amount_cents)/100.0) AS soma
FROM transactions t JOIN accounts a ON a.id = t.account_id
WHERE a.type = 'checking' AND t.type = 'expense' AND t.external_id IS NOT NULL
GROUP BY t.description
ORDER BY sum(t.amount_cents) ASC LIMIT 10;
```

- [ ] **Step 5: Confirmar um grupo e verificar que o saldo não mudou**

Antes, anotar o saldo:

```sql
SELECT id, name, balance_cents FROM accounts WHERE type = 'checking';
```

Confirmar "É transferência" no grupo do cartão pela interface, e conferir:

```sql
-- Mesma consulta de antes: balance_cents tem de estar IDÊNTICO.
SELECT id, name, balance_cents FROM accounts WHERE type = 'checking';

-- E as 9 linhas tem de estar como transferência.
SELECT type, count(*) FROM transactions
WHERE description ILIKE '%PERS BLACK%' GROUP BY type;
```

Expected: `balance_cents` inalterado, e as nove linhas com `type = 'transfer'`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/openfinance/nature-suspects-banner.tsx apps/web/components/openfinance/nature-review-panel.tsx "apps/web/app/(app)/transactions/page.tsx"
git commit -m "feat(openfinance): banner e painel para confirmar natureza de um grupo"
```

---

## Task 7: Atalho de natureza na linha do extrato

**Files:**
- Modify: `apps/web/components/finance/transaction-display-row.tsx`
- Modify: `apps/web/components/finance/transaction-list.tsx`
- Create: `apps/web/components/openfinance/nature-shortcut-dialog.tsx`

**Interfaces:**
- Consumes: `createNatureRule` (Task 5)
- Produces: `onSetNature` em `RowActions`, e `<NatureShortcutDialog />`

- [ ] **Step 1: Escrever o diálogo do atalho**

Criar `apps/web/components/openfinance/nature-shortcut-dialog.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createNatureRule } from '@/lib/openfinance/nature-actions'
import { groupKey } from '@/lib/openfinance/nature-suspects'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * "Isto não é despesa" a partir de uma linha do extrato.
 *
 * O caminho é o mesmo do painel de revisão: cria regra e reclassifica o
 * histórico daquela conta. A diferença é o ponto de partida — aqui o usuário
 * viu uma linha específica e reconheceu o padrão, em vez de ter sido alertado.
 */

interface Props {
  target: { accountId: string; description: string } | null
  onClose: () => void
}

export function NatureShortcutDialog({ target, onClose }: Props) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [nature, setNature] = useState<'transfer' | 'income'>('transfer')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (target && !el.open) el.showModal()
    if (!target && el.open) el.close()
  }, [target])

  // Sem retorno antecipado: o `<dialog>` precisa existir no DOM para o efeito
  // acima poder abri-lo quando `target` chegar.
  const key = target ? groupKey(target.description) : ''

  async function confirm() {
    if (!target) return
    setLoading(true)
    try {
      const { reclassified } = await createNatureRule({
        accountId: target.accountId,
        matchValue: key,
        nature,
      })
      toast(`${reclassified} lançamentos reclassificados`)
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="w-[min(92vw,480px)] p-6">
        <h2 className="text-lg font-semibold text-gray-900">Reclassificar lançamentos</h2>
        <p className="mt-2 text-sm text-gray-600">
          Todos os lançamentos desta conta cuja descrição contenha{' '}
          <strong className="font-medium text-gray-900">{key}</strong> passam a valer como:
        </p>

        <select
          value={nature}
          onChange={(e) => setNature(e.target.value as 'transfer' | 'income')}
          className="mt-3 h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
        >
          <option value="transfer">Transferência — dinheiro que só mudou de lugar</option>
          <option value="income">Receita — dinheiro que entrou</option>
        </select>

        <p className="mt-3 text-xs text-gray-500">
          O saldo da conta não muda: o valor de cada lançamento continua o mesmo. O que muda é
          deixarem de contar como gasto no orçamento.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={confirm} disabled={loading}>
            {loading ? 'Salvando...' : 'Reclassificar'}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
```

- [ ] **Step 2: Adicionar a ação na linha**

Em `apps/web/components/finance/transaction-display-row.tsx`, acrescentar à interface `RowActions`:

```ts
  onSetNature: (tx: TransactionRowData) => void
```

Nos dois componentes (`TransactionMobileCard` e `TransactionDesktopRow`), na área de botões, ao lado do botão de editar. Só aparece em linha de despesa vinda do Open Finance — lançamento manual é decisão do usuário, e linha pareada não pode ser tocada:

```tsx
          {tx.externalId && tx.type === 'expense' && !tx.transferGroupId && (
            <button
              type="button"
              title="Não é despesa"
              onClick={() => actions.onSetNature(tx)}
              className="rounded p-1 text-gray-400 hover:text-blue-600"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          )}
```

Acrescentar `ArrowLeftRight` ao import de `lucide-react` que já existe no topo do arquivo.

- [ ] **Step 3: Ligar na lista**

Em `apps/web/components/finance/transaction-list.tsx`:

```ts
import { NatureShortcutDialog } from '@/components/openfinance/nature-shortcut-dialog'
```

Novo estado, junto de `ruleShortcut`:

```ts
  const [natureTarget, setNatureTarget] = useState<{ accountId: string; description: string } | null>(null)
```

Acrescentar ao objeto de ações que é passado às linhas:

```ts
    onSetNature: (tx: TransactionRowData) =>
      setNatureTarget({ accountId: tx.accountId, description: tx.description }),
```

E o diálogo no JSX, ao lado do `<CreateRuleDialog …/>` que já está lá:

```tsx
      <NatureShortcutDialog target={natureTarget} onClose={() => setNatureTarget(null)} />
```

- [ ] **Step 4: Typecheck, lint e suíte**

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm lint`
Expected: PASS

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Conferir o tamanho dos arquivos tocados**

Run: `wc -l apps/web/components/finance/transaction-list.tsx apps/web/components/finance/transaction-display-row.tsx apps/web/components/openfinance/*.tsx apps/web/lib/openfinance/*.ts`
Expected: nenhum acima de 500. Se `transaction-list.tsx` passar, extrair o bloco de seleção em massa para arquivo próprio.

- [ ] **Step 6: Conferir no app**

Run: `pnpm --filter @floow/web dev`

Em `/transactions`, numa linha de despesa importada, acionar o ícone de reclassificar, confirmar como transferência, e verificar que o toast informa a contagem e que a linha muda de cor (azul de transferência).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/openfinance/nature-shortcut-dialog.tsx apps/web/components/finance/transaction-display-row.tsx apps/web/components/finance/transaction-list.tsx
git commit -m "feat(openfinance): reclassificar natureza a partir da linha do extrato"
```

---

## Task 8: Build de produção e fechamento

**Files:**
- Modify: `docs/superpowers/plans/2026-09-03-openfinance-estado-e-proximos-passos.md`

**Interfaces:**
- Consumes: tudo
- Produces: nada de código

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: PASS. Server actions em módulo `'use server'` importado por componente cliente é o ponto de falha mais provável — se o build reclamar, conferir que `nature-actions.ts` tem `'use server'` na primeira linha e que nada mais além de funções `async` é exportado dali. `nature-suspects.ts` **não** leva `'use server'`: é módulo puro importado pelos dois lados.

- [ ] **Step 2: Atualizar o documento de estado**

Em `docs/superpowers/plans/2026-09-03-openfinance-estado-e-proximos-passos.md`, substituir a seção 2 ("O problema aberto") por um parágrafo curto registrando que a camada de reclassificação existe, com o caminho dos módulos, e mover a seção 7 ("Por onde recomeçar") para as decisões que continuam abertas: pareamento com `transfer_group_id` (#2), conta Itaú duplicada (#1), saldo inicial (#3) e cartões órfãos (#4).

- [ ] **Step 3: Commit e merge**

```bash
git add docs/superpowers/plans/2026-09-03-openfinance-estado-e-proximos-passos.md
git commit -m "docs(openfinance): registra a camada de reclassificacao de natureza"
git checkout master && git merge --no-ff -
git push
```

---

## Ordem e paralelismo

Task 1 e Task 2 são independentes e podem ir em paralelo. Task 3 depende das duas. Task 4 depende de Task 3 (usa `foldForMatch`). Task 5 depende de 2, 3 e 4. Task 6 e Task 7 dependem de 5, e são independentes entre si. Task 8 é a última.
