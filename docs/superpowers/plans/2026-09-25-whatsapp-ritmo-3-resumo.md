# Ritmo no WhatsApp — Parte 3: Resumo

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 4: Resumo orçado × realizado (`format.ts` + `pacing-summary.ts`)

**Files:**
- Create: `apps/web/lib/notifications/format.ts`
- Create: `apps/web/lib/notifications/pacing-summary.ts`
- Modify: `apps/web/lib/notifications/pacing-email.ts` (passa a importar `brl` e `MESES` de `format.ts` e apaga as cópias locais)
- Test: `apps/web/__tests__/notifications/pacing-summary.test.ts`

**Interfaces:**
- Consumes: `BudgetPacingAnalyzerInput` de `@floow/core-finance`.
- Produces:
  - `format.ts`: `brl(cents: number): string`, `MESES: readonly string[]`, `oneLine(s: string): string`
  - `pacing-summary.ts`:
    ```ts
    export interface PacingSummary {
      orgName: string
      monthName: string        // 'setembro'
      day: number              // total.daysElapsed
      daysInMonth: number
      plannedCents: number
      expectedCents: number    // round(planned × day ÷ daysInMonth)
      spentCents: number
      pctOfExpected: number    // round(spent ÷ expected × 100); 0 se expected = 0
      projectedCents: number
      projectedDiffCents: number // projected − planned (>0 estoura, <0 sobra)
      flagged: string          // uma linha: 'Mercado estourado · Lazer em risco'
      pacingUrl: string
    }
    buildPacingSummary(input: BudgetPacingAnalyzerInput, orgName: string, pacingUrl: string): PacingSummary
    projectionPhrase(diffCents: number): string
    summaryLines(s: PacingSummary): string[]
    ```

As variáveis de template da Meta não aceitam quebra de linha, tab nem mais de 4 espaços seguidos. Por isso tudo o que vira variável passa por `oneLine`.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest'
import type { BudgetPacingAnalyzerInput } from '@floow/core-finance'
import { buildPacingSummary, projectionPhrase, summaryLines } from '@/lib/notifications/pacing-summary'
import { oneLine } from '@/lib/notifications/format'

type Cat = BudgetPacingAnalyzerInput['pacing']['byCategory'][number]

function input(over: Partial<BudgetPacingAnalyzerInput['pacing']['total']> = {}, cats: Cat[] = []) {
  return {
    month: '2026-09',
    categoryNames: { m: 'Mercado', l: 'Lazer', t: 'Transporte\n<b>' },
    pacing: {
      series: [],
      total: {
        plannedCents: 800000, spentCents: 712000, unbudgetedCents: 0, projectedCents: 854000,
        confidence: 'normal', daysElapsed: 25, daysInMonth: 30, ...over,
      },
      byCategory: cats,
    },
  } as BudgetPacingAnalyzerInput
}

const cat = (categoryId: string, status: Cat['status']): Cat =>
  ({ categoryId, status, plannedCents: 1, spentCents: 1, projectedCents: 1 }) as Cat

describe('buildPacingSummary', () => {
  it('calcula esperado até hoje, % e diferença da projeção', () => {
    const s = buildPacingSummary(input(), 'Pessoal', 'https://app/budgets/pacing')
    expect(s).toMatchObject({
      orgName: 'Pessoal', monthName: 'setembro', day: 25, daysInMonth: 30,
      plannedCents: 800000, expectedCents: 666667, spentCents: 712000,
      pctOfExpected: 107, projectedCents: 854000, projectedDiffCents: 54000,
    })
  })

  it('lista estourado antes de risco, numa linha só', () => {
    const s = buildPacingSummary(
      input({}, [cat('l', 'risco'), cat('m', 'estourado'), cat('t', 'ok')]),
      'Pessoal', 'u',
    )
    expect(s.flagged).toBe('Mercado estourado · Lazer em risco')
  })

  it('risco com projeção pouco confiável não entra (mesma regra do alerta)', () => {
    const s = buildPacingSummary(input({ confidence: 'low' }, [cat('l', 'risco')]), 'P', 'u')
    expect(s.flagged).toBe('Nenhuma categoria em risco')
  })

  it('nome de categoria com quebra de linha vira uma linha', () => {
    const s = buildPacingSummary(input({}, [cat('t', 'estourado')]), 'P', 'u')
    expect(s.flagged).toBe('Transporte <b> estourado')
    expect(s.flagged).not.toMatch(/\n/)
  })

  it('sem esperado (orçado zero) não divide por zero', () => {
    const s = buildPacingSummary(input({ plannedCents: 0 }), 'P', 'u')
    expect(s.expectedCents).toBe(0)
    expect(s.pctOfExpected).toBe(0)
  })
})

describe('projectionPhrase', () => {
  it('estoura', () => expect(projectionPhrase(54000)).toBe('estoura em R$ 540,00'))
  it('sobra', () => expect(projectionPhrase(-46000)).toBe('sobra R$ 460,00'))
  it('bate', () => expect(projectionPhrase(0)).toBe('fecha no orçado'))
})

describe('summaryLines', () => {
  it('monta o texto do resumo', () => {
    const s = buildPacingSummary(input({}, [cat('m', 'estourado')]), 'Pessoal', 'https://app/budgets/pacing')
    expect(summaryLines(s)).toEqual([
      'floow · Pessoal — ritmo de setembro (dia 25 de 30)',
      'Orçado no mês: R$ 8.000,00',
      'Esperado até hoje: R$ 6.666,67',
      'Realizado até hoje: R$ 7.120,00 (107% do esperado)',
      'Projeção do mês: R$ 8.540,00 — estoura em R$ 540,00',
      'Mercado estourado',
      'Ver detalhes: https://app/budgets/pacing',
    ])
  })
})

describe('oneLine', () => {
  it('colapsa espaços, tabs e quebras', () => {
    expect(oneLine('  a\n\tb     c ')).toBe('a b c')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/pacing-summary.test.ts`
Expected: FAIL (módulos não existem)

- [ ] **Step 3: Criar `format.ts`**

```ts
/** Formatação compartilhada pelas mensagens de ritmo (e-mail e WhatsApp). */

/** R$ 1.234,56 com espaço comum (o Intl usa espaço não separável). */
export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

/**
 * Uma linha só. Variável de template do WhatsApp recusa quebra de linha, tab e
 * mais de 4 espaços seguidos — e nome de categoria é texto livre do usuário.
 */
export const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
```

- [ ] **Step 4: Criar `pacing-summary.ts`**

```ts
/**
 * Resumo do ritmo do mês: orçado × esperado até hoje × realizado × projeção.
 * Função pura; os canais só formatam o que sai daqui.
 */
import type { BudgetPacingAnalyzerInput } from '@floow/core-finance'
import { brl, MESES, oneLine } from './format'

export interface PacingSummary {
  orgName: string
  monthName: string
  day: number
  daysInMonth: number
  plannedCents: number
  expectedCents: number
  spentCents: number
  pctOfExpected: number
  projectedCents: number
  /** projetado − orçado: positivo estoura, negativo sobra. */
  projectedDiffCents: number
  /** Categorias em risco/estouradas, numa linha só. */
  flagged: string
  pacingUrl: string
}

export function buildPacingSummary(
  input: BudgetPacingAnalyzerInput,
  orgName: string,
  pacingUrl: string,
): PacingSummary {
  const { total, byCategory } = input.pacing
  const expectedCents =
    total.daysInMonth > 0 ? Math.round((total.plannedCents * total.daysElapsed) / total.daysInMonth) : 0
  const nameOf = (id: string) => oneLine(input.categoryNames[id] ?? 'Categoria sem nome')

  // Mesma regra do alerta (pacing-alerts.ts): estourado sempre, risco só com
  // projeção confiável. Senão o resumo do dia 3 acusaria risco em tudo.
  const estourados = byCategory.filter((c) => c.status === 'estourado')
  const emRisco =
    total.confidence === 'normal' ? byCategory.filter((c) => c.status === 'risco') : []
  const partes = [
    ...estourados.map((c) => `${nameOf(c.categoryId)} estourado`),
    ...emRisco.map((c) => `${nameOf(c.categoryId)} em risco`),
  ]

  const [, m] = input.month.split('-').map(Number)
  return {
    orgName: oneLine(orgName),
    monthName: MESES[m - 1],
    day: total.daysElapsed,
    daysInMonth: total.daysInMonth,
    plannedCents: total.plannedCents,
    expectedCents,
    spentCents: total.spentCents,
    pctOfExpected: expectedCents > 0 ? Math.round((total.spentCents / expectedCents) * 100) : 0,
    projectedCents: total.projectedCents,
    projectedDiffCents: total.projectedCents - total.plannedCents,
    flagged: partes.length > 0 ? partes.join(' · ') : 'Nenhuma categoria em risco',
    pacingUrl,
  }
}

export function projectionPhrase(diffCents: number): string {
  if (diffCents > 0) return `estoura em ${brl(diffCents)}`
  if (diffCents < 0) return `sobra ${brl(-diffCents)}`
  return 'fecha no orçado'
}

/** Texto do resumo, uma linha por item (e-mail em texto puro e testes). */
export function summaryLines(s: PacingSummary): string[] {
  return [
    `floow · ${s.orgName} — ritmo de ${s.monthName} (dia ${s.day} de ${s.daysInMonth})`,
    `Orçado no mês: ${brl(s.plannedCents)}`,
    `Esperado até hoje: ${brl(s.expectedCents)}`,
    `Realizado até hoje: ${brl(s.spentCents)} (${s.pctOfExpected}% do esperado)`,
    `Projeção do mês: ${brl(s.projectedCents)} — ${projectionPhrase(s.projectedDiffCents)}`,
    s.flagged,
    `Ver detalhes: ${s.pacingUrl}`,
  ]
}
```

- [ ] **Step 5: Tirar as cópias de `pacing-email.ts`**

Em `apps/web/lib/notifications/pacing-email.ts`, apague as definições locais de `brl` e `MESES` e adicione no topo:

```ts
import { brl, MESES } from './format'
```

- [ ] **Step 6: Rodar os testes de notificação**

Run: `pnpm --filter @floow/web test -- __tests__/notifications`
Expected: PASS em tudo, inclusive `pacing-email.test.ts` (que confirma que `brl` continua igual).

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add apps/web/lib/notifications/format.ts apps/web/lib/notifications/pacing-summary.ts apps/web/lib/notifications/pacing-email.ts apps/web/__tests__/notifications/pacing-summary.test.ts
git commit -m "feat(notificacoes): resumo orçado x realizado até o dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
