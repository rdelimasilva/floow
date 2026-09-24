# Parcelas do cartão como eventos futuros — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada parcela de compra no cartão vira lançamento na data da sua fatura, as parcelas que a Polp não mandou viram previsão que a real ocupa sozinha, e a Meta de Gastos mostra as parcelas a vencer do mês.

**Architecture:** Regras puras em `packages/core-finance/src/openfinance/parcelas.ts` (data da parcela, dia de vencimento, planejamento das faltantes). O sync (`apps/web/lib/openfinance`) usa essas regras: grava `purchase_date`, ocupa previsão quando a real chega e completa as faltantes ao fim de cada cartão. A Meta de Gastos ganha uma consulta de parcelas a vencer, somada por categoria e mostrada na linha.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres (Supabase), Next.js (App Router), Vitest, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-09-24-parcelas-do-cartao-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md). `apps/web/lib/openfinance/sync.ts` está em 495: a Task 4 extrai `persistPage` antes de qualquer mudança nele.
- Texto de interface em pt-BR ("tela", "você").
- Valor nunca passa por ponto flutuante: centavos inteiros (`amount_cents`), despesa negativa.
- Datas de competência são strings `AAAA-MM-DD` no core; no banco, `date` gravado como `new Date(\`${d}T12:00:00Z\`)` (padrão do sync).
- Previsão de parcela nunca entra no saldo: sem `external_id`, sem `recurring_template_id`, `balance_applied = false`.
- Valor e tipo de lançamento já gravado nunca mudam no update do sync; a data só muda se `balance_applied = false`.
- Commit só na branch `feat/parcelas-cartao`; checar `git branch --show-current` antes de cada commit e nunca usar `git add -A` (há outras sessões no mesmo diretório).
- Migração SQL: o usuário aplica abrindo o arquivo no editor e copiando dele (colar do terminal trunca linhas).

## Review Focus

1. Compra parcelada em cartão cuja fatura ainda não fechou (`bill_post_date` sentinela) → data vem de `bill_forecast_month` + dia de vencimento do cartão, nunca ano 1 nem a data da compra.
2. Dia de vencimento 31 num mês de 30 dias (ou fevereiro) → data cai no último dia do mês, sem estourar para o mês seguinte.
3. Duas compras diferentes no mesmo dia, mesmo total de parcelas, valores diferentes (ex.: R$ 50 e R$ 280, ambas 6x) → dois grupos distintos, previsões separadas.
4. Parcela real chega depois de a previsão já ter sido criada → ocupa a linha da previsão (um lançamento só), e o saldo recebe o valor uma única vez se a data já passou.
5. Sync roda duas vezes seguidas → nenhuma previsão nova, nenhum saldo mexido.

Cada item tem teste na task que é dona do código (Tasks 1, 1, 1, 5 e 6).

---

### Task 1: Regras puras das parcelas (core-finance)

**Files:**
- Create: `packages/core-finance/src/openfinance/parcelas.ts`
- Modify: `packages/core-finance/src/index.ts` (exportar o módulo)
- Test: `packages/core-finance/src/__tests__/openfinance/parcelas.test.ts`

**Interfaces:**
- Produces:
  - `dataDaParcela(input: { billPostDate: string | null; billForecastMonth: string | null; purchaseDate: string }, diaDeVencimento: number | null): string`
  - `diaDeVencimentoMaisComum(billPostDates: string[]): number | null`
  - `somarMeses(data: string, meses: number): string` (mantém o dia, prende no último dia do mês)
  - `interface ParcelaConhecida { purchaseDate: string; installmentNumber: number; installmentTotal: number; amountCents: number; date: string; description: string; categoryId: string | null }`
  - `interface ParcelaPlanejada { purchaseDate: string; installmentNumber: number; installmentTotal: number; amountCents: number; date: string; description: string; categoryId: string | null }`
  - `planejarParcelasFaltantes(conhecidas: ParcelaConhecida[]): ParcelaPlanejada[]`
  - `descricaoSemNumeroDaParcela(descricao: string): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// packages/core-finance/src/__tests__/openfinance/parcelas.test.ts
import { describe, expect, it } from 'vitest'
import {
  dataDaParcela,
  descricaoSemNumeroDaParcela,
  diaDeVencimentoMaisComum,
  planejarParcelasFaltantes,
  somarMeses,
  type ParcelaConhecida,
} from '../../openfinance/parcelas'

describe('dataDaParcela', () => {
  it('usa o vencimento da fatura quando existe', () => {
    expect(dataDaParcela({ billPostDate: '2026-12-16', billForecastMonth: '2026-12', purchaseDate: '2026-09-12' }, 16)).toBe('2026-12-16')
  })

  it('sem fatura fechada, usa o mês previsto com o dia de vencimento do cartão', () => {
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: '2027-03', purchaseDate: '2026-09-12' }, 16)).toBe('2027-03-16')
  })

  it('sem dia de vencimento conhecido, usa o dia 1 do mês previsto', () => {
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: '2027-03', purchaseDate: '2026-09-12' }, null)).toBe('2027-03-01')
  })

  it('dia 31 em mês de 30 dias cai no último dia do mês', () => {
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: '2027-04', purchaseDate: '2026-09-12' }, 31)).toBe('2027-04-30')
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: '2027-02', purchaseDate: '2026-09-12' }, 31)).toBe('2027-02-28')
  })

  it('sem fatura e sem mês previsto, fica na data da compra', () => {
    expect(dataDaParcela({ billPostDate: null, billForecastMonth: null, purchaseDate: '2026-09-12' }, 16)).toBe('2026-09-12')
  })
})

describe('diaDeVencimentoMaisComum', () => {
  it('ignora o dia deslocado por fim de semana', () => {
    expect(diaDeVencimentoMaisComum(['2026-10-16', '2026-11-16', '2027-01-18', '2026-12-16'])).toBe(16)
  })

  it('sem datas, null', () => {
    expect(diaDeVencimentoMaisComum([])).toBeNull()
  })
})

describe('somarMeses', () => {
  it('mantém o dia', () => {
    expect(somarMeses('2026-09-16', 3)).toBe('2026-12-16')
  })
  it('vira o ano', () => {
    expect(somarMeses('2026-11-16', 3)).toBe('2027-02-16')
  })
  it('prende no último dia do mês', () => {
    expect(somarMeses('2027-01-31', 1)).toBe('2027-02-28')
  })
})

describe('descricaoSemNumeroDaParcela', () => {
  it('tira o sufixo NN/NN', () => {
    expect(descricaoSemNumeroDaParcela('AIRBNB * HMR5PP9B902/06')).toBe('AIRBNB * HMR5PP9B9')
    expect(descricaoSemNumeroDaParcela('ITAUSHOP 02/10')).toBe('ITAUSHOP')
  })
  it('sem sufixo, devolve igual', () => {
    expect(descricaoSemNumeroDaParcela('Diroma Clubes')).toBe('Diroma Clubes')
  })
})

function parcela(over: Partial<ParcelaConhecida>): ParcelaConhecida {
  return {
    purchaseDate: '2026-07-27',
    installmentNumber: 1,
    installmentTotal: 6,
    amountCents: -45920,
    date: '2026-08-16',
    description: 'AIRBNB * HMR5PP9B901/06',
    categoryId: 'cat-viagem',
    ...over,
  }
}

describe('planejarParcelasFaltantes', () => {
  it('cria as parcelas depois da última conhecida, mês a mês', () => {
    const planejadas = planejarParcelasFaltantes([
      parcela({}),
      parcela({ installmentNumber: 2, amountCents: -45916, date: '2026-09-16', description: 'AIRBNB * HMR5PP9B902/06' }),
    ])
    expect(planejadas.map((p) => [p.installmentNumber, p.date, p.amountCents])).toEqual([
      [3, '2026-10-16', -45916],
      [4, '2026-11-16', -45916],
      [5, '2026-12-16', -45916],
      [6, '2027-01-16', -45916],
    ])
    expect(planejadas[0].description).toBe('AIRBNB * HMR5PP9B9')
    expect(planejadas[0].categoryId).toBe('cat-viagem')
    expect(planejadas[0].purchaseDate).toBe('2026-07-27')
  })

  it('grupo completo não gera nada', () => {
    const todas = Array.from({ length: 6 }, (_, i) => parcela({ installmentNumber: i + 1 }))
    expect(planejarParcelasFaltantes(todas)).toEqual([])
  })

  it('não recria número que já existe, mesmo fora de ordem', () => {
    const planejadas = planejarParcelasFaltantes([
      parcela({ installmentNumber: 1 }),
      parcela({ installmentNumber: 4, date: '2026-11-16' }),
    ])
    expect(planejadas.map((p) => p.installmentNumber)).toEqual([5, 6])
  })

  it('compras no mesmo dia com valores diferentes são grupos distintos', () => {
    const planejadas = planejarParcelasFaltantes([
      parcela({ amountCents: -5000, installmentTotal: 2, description: 'LOJA A 01/02' }),
      parcela({ amountCents: -28000, installmentTotal: 2, description: 'LOJA B 01/02' }),
    ])
    expect(planejadas.map((p) => p.amountCents).sort()).toEqual([-28000, -5000])
  })

  it('parcela 1 com centavos a mais fica no mesmo grupo (tolerância de 1%)', () => {
    const planejadas = planejarParcelasFaltantes([
      parcela({ installmentTotal: 3, amountCents: -28025 }),
      parcela({ installmentTotal: 3, installmentNumber: 2, amountCents: -28023, date: '2026-09-16' }),
    ])
    expect(planejadas).toHaveLength(1)
    expect(planejadas[0].installmentNumber).toBe(3)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/openfinance/parcelas.test.ts`
Expected: FAIL — `Cannot find module '../../openfinance/parcelas'`

- [ ] **Step 3: Implementar**

```ts
// packages/core-finance/src/openfinance/parcelas.ts
/**
 * Regras das parcelas de compra no cartão.
 *
 * A Polp manda cada parcela como uma transação, com a data da COMPRA em
 * todas. Gravar assim punha as dez parcelas de uma compra 10x no mês da
 * compra, e todas dentro do saldo. Cada parcela vale no vencimento da fatura
 * em que cai; as que a Polp ainda não mandou viram previsão.
 */

/** Tolerância entre parcelas da mesma compra: a primeira costuma levar os centavos do arredondamento. */
const TOLERANCIA_DO_GRUPO = 0.01

const SUFIXO_DE_PARCELA = /\s*\d{1,2}\/\d{1,2}\s*$/

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

function montarData(ano: number, mes: number, dia: number): string {
  const d = Math.min(dia, ultimoDiaDoMes(ano, mes))
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function somarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const total = ano * 12 + (mes - 1) + meses
  return montarData(Math.floor(total / 12), (total % 12) + 1, dia)
}

export function dataDaParcela(
  input: { billPostDate: string | null; billForecastMonth: string | null; purchaseDate: string },
  diaDeVencimento: number | null,
): string {
  if (input.billPostDate) return input.billPostDate
  if (!input.billForecastMonth) return input.purchaseDate
  const [ano, mes] = input.billForecastMonth.split('-').map(Number)
  return montarData(ano, mes, diaDeVencimento ?? 1)
}

/**
 * O dia que mais se repete entre os vencimentos já conhecidos. Moda, não o
 * último: vencimento que cai no fim de semana anda para segunda (16 → 18) e
 * não representa o cartão.
 */
export function diaDeVencimentoMaisComum(billPostDates: string[]): number | null {
  const contagem = new Map<number, number>()
  for (const d of billPostDates) {
    const dia = Number(d.slice(8, 10))
    contagem.set(dia, (contagem.get(dia) ?? 0) + 1)
  }
  let melhor: number | null = null
  let vezes = 0
  for (const [dia, n] of contagem) {
    if (n > vezes || (n === vezes && melhor !== null && dia < melhor)) {
      melhor = dia
      vezes = n
    }
  }
  return melhor
}

export function descricaoSemNumeroDaParcela(descricao: string): string {
  return descricao.replace(SUFIXO_DE_PARCELA, '').trim() || descricao
}

export interface ParcelaConhecida {
  purchaseDate: string
  installmentNumber: number
  installmentTotal: number
  amountCents: number
  date: string
  description: string
  categoryId: string | null
}

export type ParcelaPlanejada = ParcelaConhecida

function mesmoValor(a: number, b: number): boolean {
  const maior = Math.max(Math.abs(a), Math.abs(b))
  return maior === 0 || Math.abs(a - b) / maior <= TOLERANCIA_DO_GRUPO
}

/**
 * Agrupa por compra (data da compra + total de parcelas + valor ±1%) e
 * devolve as parcelas que faltam depois da maior conhecida. Recebe reais e
 * previsões já gravadas juntas: número que existe em qualquer uma delas não
 * é planejado de novo, e é isso que torna o sync idempotente.
 */
export function planejarParcelasFaltantes(conhecidas: ParcelaConhecida[]): ParcelaPlanejada[] {
  const grupos: ParcelaConhecida[][] = []
  for (const p of conhecidas) {
    const grupo = grupos.find(
      (g) =>
        g[0].purchaseDate === p.purchaseDate &&
        g[0].installmentTotal === p.installmentTotal &&
        mesmoValor(g[0].amountCents, p.amountCents),
    )
    if (grupo) grupo.push(p)
    else grupos.push([p])
  }

  const planejadas: ParcelaPlanejada[] = []
  for (const grupo of grupos) {
    const ultima = grupo.reduce((a, b) => (b.installmentNumber > a.installmentNumber ? b : a))
    const existentes = new Set(grupo.map((p) => p.installmentNumber))
    for (let n = ultima.installmentNumber + 1; n <= ultima.installmentTotal; n++) {
      if (existentes.has(n)) continue
      planejadas.push({
        purchaseDate: ultima.purchaseDate,
        installmentNumber: n,
        installmentTotal: ultima.installmentTotal,
        amountCents: ultima.amountCents,
        date: somarMeses(ultima.date, n - ultima.installmentNumber),
        description: descricaoSemNumeroDaParcela(ultima.description),
        categoryId: ultima.categoryId,
      })
    }
  }
  return planejadas
}
```

Em `packages/core-finance/src/index.ts`, logo após `export * from './openfinance/duplicata'`:

```ts
export * from './openfinance/parcelas'
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/openfinance/parcelas.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # deve ser feat/parcelas-cartao
git add packages/core-finance/src/openfinance/parcelas.ts packages/core-finance/src/index.ts packages/core-finance/src/__tests__/openfinance/parcelas.test.ts
git commit -m "feat(parcelas): regras puras de data e parcelas faltantes"
```

---

### Task 2: normalize grava data da fatura e data da compra

**Files:**
- Modify: `packages/core-finance/src/openfinance/normalize.ts` (interface `NormalizedPolpTransaction` ~linha 49-54; `normalizeAccountTransaction` ~241; `normalizeCardTransaction` ~249-278)
- Test: `packages/core-finance/src/__tests__/openfinance/normalize.test.ts`

**Interfaces:**
- Consumes: `dataDaParcela` (Task 1)
- Produces: `NormalizedPolpTransaction.purchaseDate: string | null` — preenchido só em parcela de cartão (`installmentTotal > 1`). Nesse caso `date` já é `dataDaParcela(..., null)`; o sync (Task 5) recalcula quando `billPostDate` é null.

- [ ] **Step 1: Testes que falham** — acrescentar ao fim de `normalize.test.ts` (usa o helper `cardTx` do arquivo):

```ts
describe('normalizeCardTransaction — parcelas', () => {
  it('parcela usa o vencimento da fatura como data e guarda a data da compra', () => {
    const n = normalizeCardTransaction(cardTx({
      transaction_date_time: '2026-09-12T10:00:00-03:00',
      bill_post_date: '2026-12-16',
      bill_forecast_date: '2026-12',
      charge_identificator: 3,
      charge_number: 10,
    }))
    expect(n.date).toBe('2026-12-16')
    expect(n.purchaseDate).toBe('2026-09-12')
  })

  it('parcela sem fatura fechada cai no dia 1 do mês previsto (o sync refina o dia)', () => {
    const n = normalizeCardTransaction(cardTx({
      transaction_date_time: '2026-09-12T10:00:00-03:00',
      bill_post_date: '0001-01-01',
      bill_forecast_date: '2027-03',
      charge_identificator: 7,
      charge_number: 10,
    }))
    expect(n.date).toBe('2027-03-01')
    expect(n.purchaseDate).toBe('2026-09-12')
  })

  it('compra à vista continua na data da compra, sem purchaseDate', () => {
    const n = normalizeCardTransaction(cardTx({
      transaction_date_time: '2026-09-12T10:00:00-03:00',
      bill_post_date: '2026-10-16',
      charge_identificator: 1,
      charge_number: 1,
    }))
    expect(n.date).toBe('2026-09-12')
    expect(n.purchaseDate).toBeNull()
  })
})

it('transação de conta não tem purchaseDate', () => {
  expect(normalizeAccountTransaction(accountTx()).purchaseDate).toBeNull()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/openfinance/normalize.test.ts`
Expected: FAIL — `purchaseDate` undefined / data da compra no lugar da fatura.

- [ ] **Step 3: Implementar**

Na interface, logo depois de `installmentTotal: number | null`:

```ts
  /**
   * Data da compra, só em parcela de cartão. Em parcela, `date` é o
   * vencimento da fatura em que ela cai — senão as dez parcelas de uma
   * compra 10x contariam no mês da compra.
   */
  purchaseDate: string | null
```

Em `normalizeAccountTransaction`, depois de `installmentTotal: null,`:

```ts
    purchaseDate: null,
```

Em `normalizeCardTransaction`, substituir o corpo a partir de `return {` por:

```ts
  const competencia = toCompetenceDate(tx.transaction_date_time)
  const billPostDate = billPostDateOrNull(tx.bill_post_date)
  const billForecastMonth = forecastMonthOrNull(tx.bill_forecast_date)
  const parcelas = installments(tx.charge_identificator, tx.charge_number)
  const ehParcela = parcelas.installmentTotal !== null

  return {
    externalId: tx.id,
    date: ehParcela
      ? dataDaParcela({ billPostDate, billForecastMonth, purchaseDate: competencia }, null)
      : competencia,
    amountCents,
    type,
    natureConfirmed,
    counterpartyTaxId: digitsOnly(tx.counterparty?.tax_id),
    counterpartyName: tx.counterparty?.alias ?? tx.counterparty?.name ?? null,
    description: describe(tx.transaction_name, tx.counterparty),
    categoryRef,
    polpType: null,
    payeeMcc: tx.payee_mcc ?? null,
    billPostDate,
    billForecastMonth,
    ...parcelas,
    purchaseDate: ehParcela ? competencia : null,
    settlement: 'settled',
    foreign,
  }
```

E no topo do arquivo: `import { dataDaParcela } from './parcelas'`.

- [ ] **Step 4: Rodar a suíte do core inteira**

Run: `pnpm --filter @floow/core-finance exec vitest run`
Expected: PASS. Se algum teste antigo de parcela esperava `date` = data da compra, atualizar a expectativa para a data da fatura (é a mudança pedida) e registrar no commit.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/core-finance/src/openfinance/normalize.ts packages/core-finance/src/__tests__/openfinance/normalize.test.ts
git commit -m "feat(openfinance): parcela do cartao na data da fatura, com data da compra"
```

---

### Task 3: Colunas novas e correção das parcelas já importadas

**Files:**
- Modify: `packages/db/src/schema/finance.ts` (bloco `transactions`, após `installmentTotal`, ~linha 173; índices ~linha 225)
- Create: `supabase/migrations/00054_parcelas_do_cartao.sql`

**Interfaces:**
- Produces: colunas `transactions.purchaseDate` (`purchase_date date null`) e `transactions.isInstallmentForecast` (`is_installment_forecast boolean not null default false`); índice `idx_transactions_installment_key`.

- [ ] **Step 1: Schema Drizzle** — depois de `installmentTotal: integer('installment_total'),`:

```ts
    /**
     * Data da compra, só em parcela de cartão vinda do Open Finance. A `date`
     * da parcela é o vencimento da fatura; esta coluna junta as parcelas da
     * mesma compra e casa a previsão com a real.
     */
    purchaseDate: date('purchase_date', { mode: 'date' }),
    /**
     * Parcela prevista pelo floow porque a Polp ainda não a mandou. Nunca
     * entra no saldo; a parcela real ocupa esta linha quando chega.
     */
    isInstallmentForecast: boolean('is_installment_forecast').notNull().default(false),
```

E nos índices, depois de `idxTransactionsCounterpartyId`:

```ts
    idxTransactionsInstallmentKey: index('idx_transactions_installment_key').on(
      table.accountId,
      table.purchaseDate,
      table.installmentTotal,
      table.installmentNumber,
    ),
```

- [ ] **Step 2: Migração**

```sql
-- supabase/migrations/00054_parcelas_do_cartao.sql
-- =============================================================================
-- Parcelas do cartão como eventos futuros
-- -----------------------------------------------------------------------------
-- A Polp manda cada parcela como uma transação, todas com a data da compra.
-- A importação gravava assim e com balance_applied = true: as 10 parcelas de
-- uma compra 10x contavam no mês da compra e já estavam no saldo do cartão.
--
-- Daqui em diante a parcela vale no vencimento da fatura (bill_post_date) e a
-- data da compra fica em purchase_date. Este arquivo cria as colunas e corrige
-- o que já entrou: data vira o vencimento, e a parcela que ficou no futuro
-- sai do saldo e volta a balance_applied = false — applyDueBankTransactions a
-- aplica de novo quando o dia chegar.
-- =============================================================================

BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN purchase_date date,
  ADD COLUMN is_installment_forecast boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transactions.purchase_date IS
  'Data da compra de parcela de cartao; a date da parcela e o vencimento da fatura.';
COMMENT ON COLUMN public.transactions.is_installment_forecast IS
  'Parcela prevista pelo floow porque o banco ainda nao a mandou. Nunca entra no saldo.';

CREATE INDEX idx_transactions_installment_key
  ON public.transactions (account_id, purchase_date, installment_total, installment_number);

-- Estorno primeiro, enquanto purchase_date ainda é NULL e identifica o alvo.
-- Despesa é negativa: subtrair a soma devolve o valor ao saldo.
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
estorno AS (
  SELECT t.account_id, SUM(t.amount_cents) AS soma
  FROM public.transactions t, hoje
  WHERE t.external_id IS NOT NULL
    AND t.installment_total > 1
    AND t.bill_post_date IS NOT NULL
    AND t.purchase_date IS NULL
    AND t.balance_applied
    AND t.bill_post_date > hoje.d
  GROUP BY t.account_id
)
UPDATE public.accounts a
SET balance_cents = a.balance_cents - e.soma
FROM estorno e
WHERE a.id = e.account_id;

UPDATE public.transactions t
SET purchase_date = t.date,
    date = t.bill_post_date,
    balance_applied = CASE
      WHEN t.bill_post_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN false
      ELSE t.balance_applied
    END
WHERE t.external_id IS NOT NULL
  AND t.installment_total > 1
  AND t.bill_post_date IS NOT NULL
  AND t.purchase_date IS NULL;

COMMIT;
```

- [ ] **Step 3: Typecheck do pacote db e do web**

Run: `pnpm --filter @floow/db typecheck && pnpm --filter @floow/web typecheck`
Expected: sem erros.

- [ ] **Step 4: Aplicar e conferir (com o usuário)**

Pedir ao usuário para abrir `supabase/migrations/00054_parcelas_do_cartao.sql` no editor, copiar e rodar no SQL Editor do Supabase. Depois, conferir com o script de consulta (padrão da sessão: `postgres` + `DATABASE_URL` de `apps/web/.env.local`, rodado de `apps/web`):

```sql
select description, date::date, purchase_date, installment_number n, installment_total tot, balance_applied
from transactions
where external_id is not null and installment_total > 1
order by description, installment_number;
```

Expected: ITAUSHOP 03/10 com `date = 2026-12-16`, `purchase_date = 2026-09-12`, `balance_applied = false`; Westwing 1/6 (16/09) segue `true`; nenhuma linha com `purchase_date` null.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/db/src/schema/finance.ts supabase/migrations/00054_parcelas_do_cartao.sql
git commit -m "feat(db): purchase_date e previsao de parcela; corrige parcelas importadas"
```

---

### Task 4: Extrair `persistPage` de `sync.ts` (sem mudar comportamento)

**Files:**
- Create: `apps/web/lib/openfinance/persist-page.ts`
- Modify: `apps/web/lib/openfinance/sync.ts` (remover linhas ~289-495: `sumAppliedDeltasByAccount`, `PersistInput`, `persistPage`)
- Modify: `apps/web/__tests__/openfinance/sync-persist.test.ts` (import)

**Interfaces:**
- Produces: `export async function persistPage(db: Db, input: PersistInput): Promise<{ imported: number; updated: number }>`, `export interface PersistInput`, `export function sumAppliedDeltasByAccount(...)`, `export type Db = ReturnType<typeof getDb>` — todos em `persist-page.ts`. `sync.ts` re-exporta `sumAppliedDeltasByAccount` para não quebrar quem importa de lá.

- [ ] **Step 1: Mover o código** — recortar de `sync.ts` o bloco de `sumAppliedDeltasByAccount` até o fim do arquivo e colar em `persist-page.ts`, com o cabeçalho:

```ts
// apps/web/lib/openfinance/persist-page.ts
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb, accounts, transactions } from '@floow/db'
import { matchCategory, type CategoryRule } from '@floow/core-finance'
import type { ResolvedTransaction } from './resolve-counterparty'
import { isOpenFinanceLinkedAccount, buildTransferLegRow } from './transfer-leg'

/**
 * Gravação de uma página de transações já normalizadas e resolvidas.
 * Saiu de sync.ts, que estava no limite de 500 linhas.
 */
export type Db = ReturnType<typeof getDb>
```

Exportar `PersistInput` e `persistPage` (`export interface`, `export async function`). Em `sync.ts`: `import { persistPage, type Db } from './persist-page'`, remover o `type Db` local, remover imports que ficarem sem uso (`matchCategory`, `CategoryRule` se não usados, `isOpenFinanceLinkedAccount`, `buildTransferLegRow`, `accounts`, `inArray`), e adicionar `export { sumAppliedDeltasByAccount } from './persist-page'`.

- [ ] **Step 2: Rodar os testes de openfinance e o typecheck**

Run: `pnpm --filter @floow/web exec vitest run __tests__/openfinance && pnpm --filter @floow/web typecheck`
Expected: PASS, sem erros. `wc -l apps/web/lib/openfinance/sync.ts` < 300.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/persist-page.ts apps/web/lib/openfinance/sync.ts apps/web/__tests__/openfinance/sync-persist.test.ts
git commit -m "refactor(openfinance): extrai persistPage de sync.ts"
```

---

### Task 5: Sync grava a parcela na data certa e ocupa a previsão

**Files:**
- Create: `apps/web/lib/openfinance/parcelas-previstas.ts`
- Modify: `apps/web/lib/openfinance/persist-page.ts`
- Test: `apps/web/__tests__/openfinance/parcelas-previstas.test.ts`

**Interfaces:**
- Consumes: `dataDaParcela`, `diaDeVencimentoMaisComum` (Task 1); `purchaseDate` (Task 2); colunas (Task 3); `persistPage` (Task 4).
- Produces (em `parcelas-previstas.ts`):
  - `export function dataFinalDaParcela(tx: { date: string; purchaseDate: string | null; billPostDate: string | null; billForecastMonth: string | null }, diaDeVencimento: number | null): string` — pura.
  - `export function camposDaOcupacao(real: { externalId: string; amountCents: number; description: string; date: string; categoryId: string | null }, hoje: Date): { externalId: string; amountCents: number; description: string; date: Date; isInstallmentForecast: false; balanceApplied: boolean; importedAt: Date; categoryId?: string }` — pura.
  - `export async function carregarDiaDeVencimento(db: Db, orgId: string, accountId: string): Promise<number | null>`
  - `export async function acharPrevisao(db: Db, orgId: string, accountId: string, chave: { purchaseDate: string; installmentTotal: number; installmentNumber: number }): Promise<string | null>`

- [ ] **Step 1: Testes das partes puras (falham)**

```ts
// apps/web/__tests__/openfinance/parcelas-previstas.test.ts
import { describe, expect, it } from 'vitest'
import { camposDaOcupacao, dataFinalDaParcela } from '@/lib/openfinance/parcelas-previstas'

describe('dataFinalDaParcela', () => {
  it('à vista: mantém a data', () => {
    expect(dataFinalDaParcela({ date: '2026-09-12', purchaseDate: null, billPostDate: null, billForecastMonth: '2026-10' }, 16)).toBe('2026-09-12')
  })
  it('parcela sem fatura fechada: usa o dia de vencimento do cartão', () => {
    expect(dataFinalDaParcela({ date: '2027-03-01', purchaseDate: '2026-09-12', billPostDate: null, billForecastMonth: '2027-03' }, 16)).toBe('2027-03-16')
  })
  it('parcela com fatura: vencimento da fatura', () => {
    expect(dataFinalDaParcela({ date: '2026-12-16', purchaseDate: '2026-09-12', billPostDate: '2026-12-16', billForecastMonth: '2026-12' }, 10)).toBe('2026-12-16')
  })
})

describe('camposDaOcupacao', () => {
  const hoje = new Date('2026-10-20T15:00:00Z')

  it('parcela real já vencida ocupa a previsão entrando no saldo', () => {
    const c = camposDaOcupacao({ externalId: 'polp-3', amountCents: -45916, description: 'AIRBNB 03/06', date: '2026-10-16', categoryId: 'cat' }, hoje)
    expect(c.balanceApplied).toBe(true)
    expect(c.isInstallmentForecast).toBe(false)
    expect(c.externalId).toBe('polp-3')
    expect(c.date.toISOString().slice(0, 10)).toBe('2026-10-16')
  })

  it('parcela real futura ocupa a previsão fora do saldo', () => {
    const c = camposDaOcupacao({ externalId: 'polp-4', amountCents: -45916, description: 'AIRBNB 04/06', date: '2026-11-16', categoryId: null }, hoje)
    expect(c.balanceApplied).toBe(false)
    expect('categoryId' in c).toBe(false) // categoria da previsão fica
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/openfinance/parcelas-previstas.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `parcelas-previstas.ts`**

```ts
// apps/web/lib/openfinance/parcelas-previstas.ts
import { and, eq, isNotNull } from 'drizzle-orm'
import { transactions } from '@floow/db'
import { dataDaParcela, diaDeVencimentoMaisComum } from '@floow/core-finance'
import type { Db } from './persist-page'

/**
 * Parcela de cartão: data final e casamento com a previsão.
 *
 * A normalização não vê o banco e, sem fatura fechada, põe a parcela no dia
 * 1 do mês previsto. Aqui o dia vira o vencimento que o cartão já mostrou.
 */
export function dataFinalDaParcela(
  tx: { date: string; purchaseDate: string | null; billPostDate: string | null; billForecastMonth: string | null },
  diaDeVencimento: number | null,
): string {
  if (!tx.purchaseDate || tx.billPostDate) return tx.date
  return dataDaParcela(
    { billPostDate: null, billForecastMonth: tx.billForecastMonth, purchaseDate: tx.purchaseDate },
    diaDeVencimento,
  )
}

/**
 * O que muda na linha da previsão quando a parcela real chega. A categoria
 * só vem se a real trouxer uma — a da previsão pode ter sido escolhida pelo
 * usuário.
 */
export function camposDaOcupacao(
  real: { externalId: string; amountCents: number; description: string; date: string; categoryId: string | null },
  hoje: Date,
) {
  const date = new Date(`${real.date}T12:00:00Z`)
  const fimDeHoje = new Date(hoje)
  fimDeHoje.setHours(23, 59, 59, 999)
  return {
    externalId: real.externalId,
    amountCents: real.amountCents,
    description: real.description,
    date,
    isInstallmentForecast: false as const,
    balanceApplied: date <= fimDeHoje,
    importedAt: new Date(),
    ...(real.categoryId ? { categoryId: real.categoryId } : {}),
  }
}

export async function carregarDiaDeVencimento(db: Db, orgId: string, accountId: string): Promise<number | null> {
  const rows = await db
    .select({ d: transactions.billPostDate })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.accountId, accountId), isNotNull(transactions.billPostDate)))
    .limit(200)
  return diaDeVencimentoMaisComum(rows.map((r) => (r.d as Date).toISOString().slice(0, 10)))
}

export async function acharPrevisao(
  db: Db,
  orgId: string,
  accountId: string,
  chave: { purchaseDate: string; installmentTotal: number; installmentNumber: number },
): Promise<string | null> {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.isInstallmentForecast, true),
        eq(transactions.purchaseDate, new Date(`${chave.purchaseDate}T12:00:00Z`)),
        eq(transactions.installmentTotal, chave.installmentTotal),
        eq(transactions.installmentNumber, chave.installmentNumber),
      ),
    )
    .limit(1)
  return row?.id ?? null
}
```

- [ ] **Step 4: Usar em `persistPage`**

Em `persist-page.ts`:

1. Import: `import { acharPrevisao, camposDaOcupacao, carregarDiaDeVencimento, dataFinalDaParcela } from './parcelas-previstas'`.
2. Logo antes do `for (const tx of input.normalized)`, carregar o dia uma vez por página, só se houver parcela sem fatura:

```ts
  const precisaDoDia = input.normalized.some((t) => t.purchaseDate && !t.billPostDate)
  const diaDeVencimento = precisaDoDia ? await carregarDiaDeVencimento(db, input.orgId, input.accountId) : null
```

3. Dentro do loop, trocar `const date = new Date(\`${tx.date}T12:00:00Z\`)` por:

```ts
    const dataFinal = dataFinalDaParcela(tx, diaDeVencimento)
    const date = new Date(`${dataFinal}T12:00:00Z`)
    const purchaseDate = tx.purchaseDate ? new Date(`${tx.purchaseDate}T12:00:00Z`) : null
```

4. No `.set({...})` do caminho de update, acrescentar (data só muda fora do saldo):

```ts
          purchaseDate,
          date: sql`CASE WHEN ${transactions.balanceApplied} THEN ${transactions.date} ELSE ${dataFinal}::date END`,
```

5. Antes de `const isScheduled = ...` (caminho de insert), ocupar a previsão se houver:

```ts
    if (tx.purchaseDate && tx.installmentTotal && tx.installmentNumber) {
      const previsaoId = await acharPrevisao(db, input.orgId, input.accountId, {
        purchaseDate: tx.purchaseDate,
        installmentTotal: tx.installmentTotal,
        installmentNumber: tx.installmentNumber,
      })
      if (previsaoId) {
        const campos = camposDaOcupacao(
          { externalId: tx.externalId, amountCents: tx.amountCents, description: tx.description, date: dataFinal, categoryId },
          new Date(),
        )
        await db.transaction(async (dbTx) => {
          await dbTx
            .update(transactions)
            .set({ ...campos, billPostDate: tx.billPostDate ? new Date(`${tx.billPostDate}T12:00:00Z`) : null, billForecastMonth: tx.billForecastMonth, categoryRef: tx.categoryRef, payeeMcc: tx.payeeMcc })
            .where(and(eq(transactions.id, previsaoId), eq(transactions.orgId, input.orgId)))
          // A previsão nunca esteve no saldo; a real entra uma vez, se já venceu.
          if (campos.balanceApplied) {
            await dbTx
              .update(accounts)
              .set({ balanceCents: sql`balance_cents + ${tx.amountCents}` })
              .where(eq(accounts.id, input.accountId))
          }
        })
        updated++
        continue
      }
    }
```

6. No objeto de `toInsert.push({...})`, acrescentar `purchaseDate,`.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `pnpm --filter @floow/web exec vitest run __tests__/openfinance && pnpm --filter @floow/web typecheck && wc -l apps/web/lib/openfinance/persist-page.ts`
Expected: PASS; `persist-page.ts` < 500 linhas.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/parcelas-previstas.ts apps/web/lib/openfinance/persist-page.ts apps/web/__tests__/openfinance/parcelas-previstas.test.ts
git commit -m "feat(openfinance): parcela na data da fatura e ocupacao da previsao"
```

---

### Task 6: Completar as parcelas faltantes ao fim do sync do cartão

**Files:**
- Create: `apps/web/lib/openfinance/completar-parcelas.ts`
- Modify: `apps/web/lib/openfinance/sync.ts` (depois do loop de páginas, junto das propostas, ~linha 160)
- Test: `apps/web/__tests__/openfinance/completar-parcelas.test.ts`

**Interfaces:**
- Consumes: `planejarParcelasFaltantes`, `ParcelaConhecida`, `ParcelaPlanejada` (Task 1); colunas (Task 3).
- Produces:
  - `export function linhaDaPrevisao(p: ParcelaPlanejada, ctx: { orgId: string; accountId: string }): typeof transactions.$inferInsert` — pura.
  - `export async function completarParcelas(db: Db, orgId: string, accountId: string): Promise<number>` — devolve quantas previsões criou.

- [ ] **Step 1: Teste da parte pura (falha)**

```ts
// apps/web/__tests__/openfinance/completar-parcelas.test.ts
import { describe, expect, it } from 'vitest'
import { linhaDaPrevisao } from '@/lib/openfinance/completar-parcelas'

describe('linhaDaPrevisao', () => {
  const linha = linhaDaPrevisao(
    { purchaseDate: '2026-07-27', installmentNumber: 3, installmentTotal: 6, amountCents: -45916, date: '2026-10-16', description: 'AIRBNB * HMR5PP9B9', categoryId: 'cat' },
    { orgId: 'org', accountId: 'acc' },
  )

  it('nunca entra no saldo e não parece lançamento do banco', () => {
    expect(linha.balanceApplied).toBe(false)
    expect(linha.externalId).toBeNull()
    expect(linha.recurringTemplateId).toBeNull()
    expect(linha.isInstallmentForecast).toBe(true)
  })

  it('carrega a chave de casamento e o número da parcela na descrição', () => {
    expect(linha.installmentNumber).toBe(3)
    expect(linha.installmentTotal).toBe(6)
    expect((linha.purchaseDate as Date).toISOString().slice(0, 10)).toBe('2026-07-27')
    expect(linha.description).toBe('AIRBNB * HMR5PP9B9 03/06')
    expect(linha.type).toBe('expense')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/openfinance/completar-parcelas.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// apps/web/lib/openfinance/completar-parcelas.ts
import { and, eq, gt, isNotNull } from 'drizzle-orm'
import { transactions } from '@floow/db'
import { planejarParcelasFaltantes, type ParcelaConhecida, type ParcelaPlanejada } from '@floow/core-finance'
import type { Db } from './persist-page'

/**
 * Cria como previsão as parcelas que a Polp ainda não mandou.
 *
 * Compras antigas chegam só com as parcelas já faturadas (Airbnb 6x veio com
 * 1 e 2). Sem isto, os meses seguintes pareceriam livres. A previsão não tem
 * `external_id`, então `applyDueBankTransactions` nunca a põe no saldo; a
 * parcela real a ocupa em `persistPage` quando chega.
 */
function dia(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function linhaDaPrevisao(
  p: ParcelaPlanejada,
  ctx: { orgId: string; accountId: string },
): typeof transactions.$inferInsert {
  const n = String(p.installmentNumber).padStart(2, '0')
  const t = String(p.installmentTotal).padStart(2, '0')
  return {
    orgId: ctx.orgId,
    accountId: ctx.accountId,
    categoryId: p.categoryId,
    type: 'expense',
    amountCents: p.amountCents,
    description: `${p.description} ${n}/${t}`,
    date: new Date(`${p.date}T12:00:00Z`),
    purchaseDate: new Date(`${p.purchaseDate}T12:00:00Z`),
    installmentNumber: p.installmentNumber,
    installmentTotal: p.installmentTotal,
    isInstallmentForecast: true,
    externalId: null,
    recurringTemplateId: null,
    balanceApplied: false,
    isAutoCategorized: p.categoryId !== null,
  }
}

export async function completarParcelas(db: Db, orgId: string, accountId: string): Promise<number> {
  const rows = await db
    .select({
      purchaseDate: transactions.purchaseDate,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      amountCents: transactions.amountCents,
      date: transactions.date,
      description: transactions.description,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        isNotNull(transactions.purchaseDate),
        gt(transactions.installmentTotal, 1),
        isNotNull(transactions.installmentNumber),
      ),
    )

  const conhecidas: ParcelaConhecida[] = rows.map((r) => ({
    purchaseDate: dia(r.purchaseDate as Date),
    installmentNumber: r.installmentNumber as number,
    installmentTotal: r.installmentTotal as number,
    amountCents: r.amountCents,
    date: dia(r.date),
    description: r.description,
    categoryId: r.categoryId,
  }))

  const planejadas = planejarParcelasFaltantes(conhecidas)
  if (planejadas.length === 0) return 0

  const inseridas = await db
    .insert(transactions)
    .values(planejadas.map((p) => linhaDaPrevisao(p, { orgId, accountId })))
    .returning({ id: transactions.id })
  return inseridas.length
}
```

- [ ] **Step 4: Chamar no sync** — em `sync.ts`, `import { completarParcelas } from './completar-parcelas'`, e logo depois do loop `for await (const page of pages ...)` (antes do bloco de `criarPropostasDeConciliacao`):

```ts
    // Previsão das parcelas que a Polp ainda não mandou. Falha aqui não
    // derruba o sync: o dado real já entrou, e a próxima passada completa.
    if (isCard) {
      try {
        await completarParcelas(db, connection.orgId, resource.accountId)
      } catch (error) {
        console.error('[sync] falha ao completar parcelas previstas:', error)
      }
    }
```

- [ ] **Step 5: Rodar testes e typecheck**

Run: `pnpm --filter @floow/web exec vitest run __tests__/openfinance && pnpm --filter @floow/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/completar-parcelas.ts apps/web/lib/openfinance/sync.ts apps/web/__tests__/openfinance/completar-parcelas.test.ts
git commit -m "feat(openfinance): preve as parcelas que o banco ainda nao mandou"
```

---

### Task 7: Parcelas a vencer na Meta de Gastos

Gasto realizado já exclui parcela futura: as quatro consultas usam `somenteRealizado` (`balance_applied = true`), protegido por `__tests__/finance/gasto-so-realizado.test.ts`. Esta task só acrescenta a camada "a vencer" na tela de Meta de Gastos.

**Files:**
- Create: `apps/web/lib/finance/parcelas-a-vencer.ts` (soma pura)
- Create: `apps/web/lib/finance/parcelas-a-vencer-queries.ts` (consulta cacheada)
- Create: `apps/web/app/(app)/budgets/spending/parcelas-na-linha.tsx`
- Modify: `apps/web/app/(app)/budgets/spending/page.tsx`, `apps/web/app/(app)/budgets/spending/client.tsx`
- Test: `apps/web/__tests__/finance/parcelas-a-vencer.test.ts`, `apps/web/__tests__/finance/parcelas-na-linha.test.tsx`

**Interfaces:**
- Produces:
  - `interface ParcelaAVencer { categoryId: string; description: string; installmentNumber: number; installmentTotal: number; amountCents: number }` (valor positivo)
  - `interface ParcelasDaCategoria { totalCents: number; parcelas: ParcelaAVencer[] }`
  - `somarParcelasPorCategoria(rows: ParcelaAVencer[]): Record<string, ParcelasDaCategoria>` (Record, não Map: atravessa a fronteira server→client)
  - `livreDaCategoria(plannedCents: number, gastoCents: number, aVencerCents: number): number`
  - `getParcelasAVencerDoMes(orgId: string, start: Date, end: Date): Promise<Record<string, ParcelasDaCategoria>>`
  - `<ParcelasNaLinha parcelas={ParcelasDaCategoria | undefined} />`

- [ ] **Step 1: Testes (falham)**

```ts
// apps/web/__tests__/finance/parcelas-a-vencer.test.ts
import { describe, expect, it } from 'vitest'
import { livreDaCategoria, somarParcelasPorCategoria } from '@/lib/finance/parcelas-a-vencer'

describe('somarParcelasPorCategoria', () => {
  it('soma por categoria e guarda as parcelas', () => {
    const r = somarParcelasPorCategoria([
      { categoryId: 'casa', description: 'Westwing', installmentNumber: 2, installmentTotal: 6, amountCents: 28023 },
      { categoryId: 'casa', description: 'ITAUSHOP', installmentNumber: 2, installmentTotal: 10, amountCents: 5581 },
      { categoryId: 'viagem', description: 'AIRBNB', installmentNumber: 3, installmentTotal: 6, amountCents: 45916 },
    ])
    expect(r.casa.totalCents).toBe(33604)
    expect(r.casa.parcelas).toHaveLength(2)
    expect(r.viagem.totalCents).toBe(45916)
  })
})

describe('livreDaCategoria', () => {
  it('meta menos gasto menos parcelas a vencer', () => {
    expect(livreDaCategoria(100000, 30000, 28000)).toBe(42000)
  })
  it('fica negativo quando as parcelas passam da meta', () => {
    expect(livreDaCategoria(20000, 0, 28000)).toBe(-8000)
  })
})
```

```tsx
// apps/web/__tests__/finance/parcelas-na-linha.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParcelasNaLinha } from '@/app/(app)/budgets/spending/parcelas-na-linha'

describe('ParcelasNaLinha', () => {
  it('sem parcelas, não renderiza nada', () => {
    const { container } = render(<ParcelasNaLinha parcelas={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mostra o total a vencer e lista as parcelas no title', () => {
    render(<ParcelasNaLinha parcelas={{ totalCents: 28023, parcelas: [{ categoryId: 'casa', description: 'Westwing', installmentNumber: 2, installmentTotal: 6, amountCents: 28023 }] }} />)
    const nota = screen.getByText(/parcelas a vencer/)
    expect(nota.textContent).toContain('280,23')
    expect(nota.getAttribute('title')).toContain('Westwing 2/6')
  })
})
```

(Se o projeto não usar `@testing-library/react`, conferir em `__tests__/finance/recorrente-como-meta-dialogo.test.tsx` o padrão de render e seguir o mesmo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/parcelas-a-vencer.test.ts __tests__/finance/parcelas-na-linha.test.tsx`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar a soma pura**

```ts
// apps/web/lib/finance/parcelas-a-vencer.ts
/**
 * Parcela de cartão que cai no mês e ainda não venceu. Já é certa — o banco
 * cobrou a compra —, mas só vira gasto no vencimento da fatura, quando
 * `applyDueBankTransactions` a aplica. Até lá aparece como "a vencer" na
 * Meta de Gastos, e nunca nos dois lugares.
 */
export interface ParcelaAVencer {
  categoryId: string
  description: string
  installmentNumber: number
  installmentTotal: number
  /** Positivo. */
  amountCents: number
}

export interface ParcelasDaCategoria {
  totalCents: number
  parcelas: ParcelaAVencer[]
}

export function somarParcelasPorCategoria(rows: ParcelaAVencer[]): Record<string, ParcelasDaCategoria> {
  const r: Record<string, ParcelasDaCategoria> = {}
  for (const p of rows) {
    const c = (r[p.categoryId] ??= { totalCents: 0, parcelas: [] })
    c.totalCents += p.amountCents
    c.parcelas.push(p)
  }
  return r
}

/** Quanto ainda cabe na meta: o comprometido com parcelas já não está livre. */
export function livreDaCategoria(plannedCents: number, gastoCents: number, aVencerCents: number): number {
  return plannedCents - gastoCents - aVencerCents
}
```

- [ ] **Step 4: Consulta**

```ts
// apps/web/lib/finance/parcelas-a-vencer-queries.ts
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { and, eq, gt, gte, isNotNull, lte } from 'drizzle-orm'
import { transactions } from '@floow/db'
import { budgetSpendingTag } from '@/lib/cache-tags'
import { requireIdentity } from '@/lib/auth/session'
import { withUserDbFor } from '@/lib/db/rls'
import { somarParcelasPorCategoria, type ParcelasDaCategoria } from './parcelas-a-vencer'

/**
 * Parcelas de cartão do mês que ainda não entraram no gasto: reais de data
 * futura e previsões. `purchase_date` separa parcela de cartão da parcela
 * manual, que não tem data de compra.
 */
export const getParcelasAVencerDoMes = cache(async function getParcelasAVencerDoMes(
  orgId: string,
  start: Date,
  end: Date,
): Promise<Record<string, ParcelasDaCategoria>> {
  const { userId } = await requireIdentity()
  return unstable_cache(
    () =>
      withUserDbFor(userId, async (db) => {
        const rows = await db
          .select({
            categoryId: transactions.categoryId,
            description: transactions.description,
            installmentNumber: transactions.installmentNumber,
            installmentTotal: transactions.installmentTotal,
            amountCents: transactions.amountCents,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.orgId, orgId),
              eq(transactions.type, 'expense'),
              eq(transactions.reviewState, 'confirmed'),
              eq(transactions.isIgnored, false),
              eq(transactions.balanceApplied, false),
              isNotNull(transactions.purchaseDate),
              gt(transactions.installmentTotal, 1),
              isNotNull(transactions.categoryId),
              gte(transactions.date, start),
              lte(transactions.date, end),
            ),
          )
        return somarParcelasPorCategoria(
          rows.map((r) => ({
            categoryId: r.categoryId as string,
            description: r.description,
            installmentNumber: r.installmentNumber ?? 0,
            installmentTotal: r.installmentTotal ?? 0,
            amountCents: Math.abs(r.amountCents),
          })),
        )
      }),
    ['budget-parcelas-a-vencer', orgId, userId, start.toISOString(), end.toISOString()],
    { tags: [budgetSpendingTag(orgId)], revalidate: 300 },
  )()
})
```

- [ ] **Step 5: Componente da linha**

```tsx
// apps/web/app/(app)/budgets/spending/parcelas-na-linha.tsx
import { formatBRL } from '@floow/core-finance'
import type { ParcelasDaCategoria } from '@/lib/finance/parcelas-a-vencer'

/** Nota sob a categoria: parcelas do cartão que vencem neste mês e ainda não viraram gasto. */
export function ParcelasNaLinha({ parcelas }: { parcelas: ParcelasDaCategoria | undefined }) {
  if (!parcelas || parcelas.totalCents === 0) return null
  const nomes = parcelas.parcelas
    .map((p) => `${p.description} ${p.installmentNumber}/${p.installmentTotal} (${formatBRL(p.amountCents)})`)
    .join(', ')
  return (
    <span className="block text-xs font-normal text-gray-500" title={nomes}>
      {formatBRL(parcelas.totalCents)} em parcelas a vencer
    </span>
  )
}
```

- [ ] **Step 6: Ligar na página e no cliente**

`page.tsx`: importar `getParcelasAVencerDoMes` e acrescentar ao `Promise.all`:

```ts
  const [categories, entriesForMonth, allEntries, spending, parcelasAVencer] = await Promise.all([
    getCategories(orgId),
    getSpendingPlanForMonth(orgId, monthDate, monthEnd),
    getAllBudgetEntries(orgId, 'spending'),
    getSpendingByCategory(orgId, monthDate, monthEnd),
    getParcelasAVencerDoMes(orgId, monthDate, monthEnd),
  ])
```

e passar `parcelasAVencer={parcelasAVencer}` ao `<SpendingClient>`.

`client.tsx`:
1. Props: `parcelasAVencer: Record<string, ParcelasDaCategoria>`; importar o tipo, `livreDaCategoria` e `ParcelasNaLinha`.
2. Depois de `totalSpent`:

```ts
  const totalAVencer = entriesForMonth
    .filter((e) => e.categoryId !== null)
    .reduce((sum, e) => sum + (parcelasAVencer[e.categoryId as string]?.totalCents ?? 0), 0)
```

3. Nos dois `map` de linha (mobile ~177 e desktop ~239), trocar `const diff = entry.plannedCents - actual` e `const isOver = actual > entry.plannedCents` por:

```ts
              const aVencer = entry.categoryId ? (parcelasAVencer[entry.categoryId]?.totalCents ?? 0) : 0
              const diff = livreDaCategoria(entry.plannedCents, actual, aVencer)
              const isOver = diff < 0
```

e, logo abaixo de `<RecorrentesNaLinha linha={entry} />` nos dois lugares:

```tsx
                        <ParcelasNaLinha parcelas={entry.categoryId ? parcelasAVencer[entry.categoryId] : undefined} />
```

   Quando `diff < 0` por causa das parcelas, o valor negativo em vermelho é o aviso de que as parcelas passam da meta.
4. No card de Resumo, depois do `BudgetProgressBar`:

```tsx
            {totalAVencer > 0 && (
              <p className="text-sm text-muted-foreground">
                <strong className="text-gray-900">{formatBRL(totalAVencer)}</strong> em parcelas do cartão
                vencem ainda neste mês; livre: {formatBRL(totalPlanned - totalSpent - totalAVencer)}.
              </p>
            )}
```

5. No `tfoot`, a diferença do total passa a usar `totalPlanned - totalSpent - totalAVencer` (e a cor, `< 0`).

- [ ] **Step 7: Rodar testes, typecheck e contar linhas**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance && pnpm --filter @floow/web typecheck && wc -l "apps/web/app/(app)/budgets/spending/client.tsx"`
Expected: PASS; `client.tsx` < 500 linhas.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/parcelas-a-vencer.ts apps/web/lib/finance/parcelas-a-vencer-queries.ts "apps/web/app/(app)/budgets/spending/parcelas-na-linha.tsx" "apps/web/app/(app)/budgets/spending/page.tsx" "apps/web/app/(app)/budgets/spending/client.tsx" apps/web/__tests__/finance/parcelas-a-vencer.test.ts apps/web/__tests__/finance/parcelas-na-linha.test.tsx
git commit -m "feat(metas): parcelas do cartao a vencer na meta de gastos"
```

---

### Task 8: Lista de transações mostra parcela e data da compra

**Files:**
- Modify: `apps/web/lib/finance/queries-transactions.ts` (select ~linha 228)
- Modify: `apps/web/components/finance/transaction-list-types.ts` (~linha 31)
- Modify: `apps/web/components/finance/transaction-display-row.tsx` (mobile ~168, desktop ~247)
- Test: `apps/web/__tests__/finance/selo-de-parcela.test.tsx`

**Interfaces:**
- Produces: `export function textoDaParcela(tx: { installmentNumber?: number | null; installmentTotal?: number | null; purchaseDate?: Date | string | null }): string | null` em `transaction-display-row.tsx` — devolve `"3/6 · compra em 27/07"` ou null.

- [ ] **Step 1: Teste (falha)**

```tsx
// apps/web/__tests__/finance/selo-de-parcela.test.tsx
import { describe, expect, it } from 'vitest'
import { textoDaParcela } from '@/components/finance/transaction-display-row'

describe('textoDaParcela', () => {
  it('parcela de cartão com data da compra', () => {
    expect(textoDaParcela({ installmentNumber: 3, installmentTotal: 6, purchaseDate: '2026-07-27' })).toBe('3/6 · compra em 27/07')
  })
  it('parcela manual, sem data da compra, não ganha selo', () => {
    expect(textoDaParcela({ installmentNumber: 3, installmentTotal: 61, purchaseDate: null })).toBeNull()
  })
  it('à vista, nada', () => {
    expect(textoDaParcela({ installmentNumber: null, installmentTotal: null, purchaseDate: null })).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance/selo-de-parcela.test.tsx`
Expected: FAIL — `textoDaParcela` não exportado.

- [ ] **Step 3: Implementar**

`queries-transactions.ts`, após `installmentTotal: transactions.installmentTotal,`:

```ts
      purchaseDate: transactions.purchaseDate,
```

`transaction-list-types.ts`, após `installmentTotal?: number | null`:

```ts
  /** Data da compra, só em parcela de cartão. */
  purchaseDate?: Date | string | null
```

`transaction-display-row.tsx`, antes de `ForecastBadge`:

```tsx
/**
 * "3/6 · compra em 27/07". A parcela de cartão aparece no mês da fatura, e sem
 * a data da compra o usuário não reconheceria o lançamento.
 */
export function textoDaParcela(tx: {
  installmentNumber?: number | null
  installmentTotal?: number | null
  purchaseDate?: Date | string | null
}): string | null {
  if (!tx.purchaseDate || !tx.installmentNumber || !tx.installmentTotal) return null
  const iso = typeof tx.purchaseDate === 'string' ? tx.purchaseDate : tx.purchaseDate.toISOString()
  const [, mes, dia] = iso.slice(0, 10).split('-')
  return `${tx.installmentNumber}/${tx.installmentTotal} · compra em ${dia}/${mes}`
}

function SeloDeParcela({ tx }: { tx: TransactionRowData }) {
  const texto = textoDaParcela(tx)
  if (!texto) return null
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
      {texto}
    </span>
  )
}
```

Renderizar `<SeloDeParcela tx={tx} />` imediatamente antes de `<ForecastBadge tx={tx} />` no mobile (~183) e no desktop (~251).

- [ ] **Step 4: Testes, typecheck e linhas**

Run: `pnpm --filter @floow/web exec vitest run __tests__/finance && pnpm --filter @floow/web typecheck && wc -l apps/web/components/finance/transaction-display-row.tsx apps/web/lib/finance/queries-transactions.ts`
Expected: PASS; ambos < 500.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/queries-transactions.ts apps/web/components/finance/transaction-list-types.ts apps/web/components/finance/transaction-display-row.tsx apps/web/__tests__/finance/selo-de-parcela.test.tsx
git commit -m "feat(transacoes): selo de parcela com data da compra"
```

---

### Task 9: Verificação ponta a ponta

- [ ] **Step 1: Suíte e build**

Run: `pnpm test && pnpm typecheck && pnpm --filter @floow/web build`
Expected: tudo verde (build roda antes de ir para master — é produção).

- [ ] **Step 2: Sync real** — com a migração aplicada (Task 3), rodar a sincronização da conexão do cartão pelo app (org com dados; ver memória "Três orgs") e consultar:

```sql
select description, date::date, purchase_date, installment_number n, installment_total tot,
       balance_applied ap, is_installment_forecast prev, external_id is not null real
from transactions
where purchase_date is not null
order by purchase_date, installment_total, installment_number;
```

Expected: Airbnb 6x com 1-2 reais e 3-6 `prev = true`, `ap = false`, datas 16/10/2026…16/01/2027; Diroma 5x com 3-5 previstas; ITAUSHOP sem previsão; rodar o sync de novo não muda a contagem de linhas.

- [ ] **Step 3: Saldo** — conferir que `accounts.balance_cents` do cartão não mudou entre as duas rodadas de sync.

- [ ] **Step 4: Tela** — abrir `/budgets/spending?month=2026-10-01` e `/transactions`: a categoria da Westwing mostra "R$ 280,23 em parcelas a vencer" e o livre já descontado; a parcela aparece com "2/6 · compra em 05/09" e selo "previsto".

- [ ] **Step 5: Integração** — seguir a memória "Git flow direto": merge em master e push, só depois do build verde e com o usuário de acordo.
