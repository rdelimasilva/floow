# Sugestão de categorias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Analisar 12 meses de gastos e sugerir categorias novas (gasto mal classificado e categoria grande sem meta), com aceite que cria categoria + regra, recategoriza o histórico e abre a criação de meta.

**Architecture:** Motor puro em `packages/core-finance/src/category-suggestions/`. Tabela `category_suggestions` guarda status (recusada nunca volta). Um job por org (`runCategorySuggestionsForOrg`, com deps injetadas, no molde de `pacing-email-job`) é chamado por uma rota agendada semanal e por um botão na tela de metas. O aceite é uma função com `db.transaction`, chamada por server action fina.

**Tech Stack:** Next.js (app router, server actions), Drizzle ORM, Supabase Postgres (RLS), Vitest + Testing Library, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md).
- Texto de interface em pt-BR ("tela", "você").
- `orgId` sempre via `getOrgId()`; nunca decodificar JWT na mão.
- Nada de item novo no menu lateral: tudo dentro de `/budgets/spending`.
- Limites: 6 lançamentos em 3 meses, ou R$ 300 com ≥ 2 lançamentos; split exige ≥ 10% do total e ≥ 2 grupos; no máximo 10 sugestões; janela de 12 meses.
- Filtro de gasto idêntico ao de `getSpendingByCategory`: `type='expense'`, `reviewState='confirmed'`, `isIgnored=false`, `somenteRealizado`, `effectiveAffectsCashFlow`.
- Rota agendada exporta `GET` (a Vercel dispara com GET) e autentica com `isAuthorizedService`.
- Commits: nunca `git add -A`; conferir `git branch --show-current` = `feat/sugestao-categorias` antes de cada commit (outra sessão pode trocar a branch).
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. Lançamento classificado à mão numa categoria específica não pode ser movido pelo aceite. Teste na Task 5.
2. Uma sugestão aceita ou recusada não pode voltar como pendente na rodada seguinte. Teste na Task 4.
3. Uma descrição só com palavras genéricas ("PIX ENVIADO 123") não pode virar grupo nem regra. Teste na Task 1.
4. Nome sugerido igual a categoria existente (com outra caixa ou acento) não aparece, e o aceite com nome duplicado não grava nada. Testes nas Tasks 2 e 5.
5. A regra criada precisa casar com a descrição crua: um `match_value` que não é substring nunca dispara. Teste na Task 1.

---

### Task 1: Chave do estabelecimento e termo da regra

**Files:**
- Create: `packages/core-finance/src/category-suggestions/merchant-key.ts`
- Test: `packages/core-finance/src/__tests__/merchant-key.test.ts`

**Interfaces:**
- Produces: `normalizeMerchant(description: string): string`, `ruleTermFor(key: string, descriptions: string[]): string | null`, `normalizeCategoryName(name: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeMerchant, ruleTermFor, normalizeCategoryName } from '../category-suggestions/merchant-key'

describe('normalizeMerchant', () => {
  it('fica com o primeiro token quando ele tem 5+ letras', () => {
    expect(normalizeMerchant('IFOOD *RESTAURANTE XYZ')).toBe('ifood')
    expect(normalizeMerchant('Ifood Mercado 123')).toBe('ifood')
  })
  it('fica com dois tokens quando o primeiro é curto', () => {
    expect(normalizeMerchant('UBER *TRIP SAO PAULO BR')).toBe('uber trip')
  })
  it('descarta prefixo de adquirente, dígitos e acento', () => {
    expect(normalizeMerchant('PAG*Padaria São João 0001')).toBe('padaria')
    expect(normalizeMerchant('MP *NETFLIX 12/03')).toBe('netflix')
  })
  it('descrição só com palavras genéricas vira vazio', () => {
    expect(normalizeMerchant('PIX ENVIADO 123456')).toBe('')
    expect(normalizeMerchant('Pagamento de boleto')).toBe('')
    expect(normalizeMerchant('')).toBe('')
  })
  it('pix para pessoa vira o nome da pessoa', () => {
    expect(normalizeMerchant('PIX ENVIADO JOAO SILVA')).toBe('joao silva')
  })
})

describe('ruleTermFor', () => {
  it('usa a chave quando ela é substring de todas as descrições', () => {
    expect(ruleTermFor('ifood', ['IFOOD *REST A', 'Ifood Mercado'])).toBe('ifood')
  })
  it('cai para o primeiro token quando a chave não é substring', () => {
    expect(ruleTermFor('uber trip', ['UBER *TRIP SP', 'UBER *TRIP RJ'])).toBe('uber')
  })
  it('devolve null quando nada casa com todas', () => {
    expect(ruleTermFor('padaria', ['PAG*Padaria', 'Padaría Central'])).toBeNull()
  })
  it('recusa termo com menos de 3 letras', () => {
    expect(ruleTermFor('ab cd', ['AB*CD loja'])).toBeNull()
  })
})

describe('normalizeCategoryName', () => {
  it('ignora caixa, acento e espaços', () => {
    expect(normalizeCategoryName('  Saúde ')).toBe(normalizeCategoryName('saude'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/merchant-key.test.ts`
Expected: FAIL, "Cannot find module '../category-suggestions/merchant-key'"

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Chave de agrupamento por estabelecimento, a partir da descrição do lançamento.
 * Ver docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md.
 */

/** Prefixos de adquirente/subadquirente que antecedem o nome real. */
const PREFIXOS = new Set(['pag', 'pg', 'mp', 'ec', 'ifd'])

/** Palavras que aparecem em qualquer lançamento e não identificam ninguém. */
const GENERICAS = new Set([
  'pix', 'ted', 'doc', 'tef', 'compra', 'pagamento', 'pagto', 'pgto', 'enviado', 'enviada',
  'recebido', 'recebida', 'transferencia', 'debito', 'credito', 'cartao', 'parcela', 'boleto',
  'de', 'da', 'do', 'das', 'dos', 'em', 'para', 'com', 'br', 'ltda', 'sa', 'me', 'eireli', 'www',
])

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function tokens(description: string): string[] {
  return semAcento(description)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !/\d/.test(t) && !PREFIXOS.has(t) && !GENERICAS.has(t))
}

export function normalizeMerchant(description: string): string {
  const t = tokens(description)
  if (t.length === 0) return ''
  if (t[0].length >= 5 || t.length === 1) return t[0]
  return `${t[0]} ${t[1]}`
}

/**
 * Termo para `category_rules` (match `contains` sobre a descrição crua em
 * minúsculas). Precisa ser substring de todas as descrições do grupo, senão a
 * regra nunca dispara.
 */
export function ruleTermFor(key: string, descriptions: string[]): string | null {
  const lower = descriptions.map((d) => d.toLowerCase())
  const casaComTodas = (term: string) => term.length >= 3 && lower.every((d) => d.includes(term))
  if (casaComTodas(key)) return key
  const primeiro = key.split(' ')[0]
  if (casaComTodas(primeiro)) return primeiro
  return null
}

export function normalizeCategoryName(name: string): string {
  return semAcento(name).toLowerCase().trim().replace(/\s+/g, ' ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/merchant-key.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # feat/sugestao-categorias
git add packages/core-finance/src/category-suggestions/merchant-key.ts packages/core-finance/src/__tests__/merchant-key.test.ts
git commit -m "feat(sugestoes): chave de estabelecimento e termo da regra"
```

---

### Task 2: Motor de sugestões

**Files:**
- Create: `packages/core-finance/src/category-suggestions/suggest.ts`
- Create: `packages/core-finance/src/category-suggestions/index.ts`
- Modify: `packages/core-finance/src/index.ts` (adicionar export)
- Test: `packages/core-finance/src/__tests__/category-suggestions.test.ts`

**Interfaces:**
- Consumes: `normalizeMerchant`, `ruleTermFor`, `normalizeCategoryName` (Task 1)
- Produces (exportados de `@floow/core-finance`):

```ts
export type SuggestionKind = 'uncategorized' | 'split'
export interface SuggestionTransaction { id: string; description: string; amountCents: number; date: string; categoryId: string | null }
export interface SuggestionCategory { id: string; name: string; parentId: string | null; polpRef: string | null }
export interface SuggestCategoriesInput {
  transactions: SuggestionTransaction[]   // só despesas da janela; amountCents negativo = saída
  categories: SuggestionCategory[]
  categoriesWithGoal: Set<string>
  excludedFingerprints: Set<string>
}
export interface CategorySuggestion {
  kind: SuggestionKind; fingerprint: string; suggestedName: string
  parentCategoryId: string | null; sourceCategoryIds: string[]
  merchantKey: string; matchValue: string | null
  txCount: number; totalCents: number; monthlyAvgCents: number
}
export const SUGGESTION_LIMITS: { minCount: 6; minMonths: 3; minTotalCents: 30000; minCountForTotal: 2; splitMinShare: 0.1; splitMinGroups: 2; maxSuggestions: 10; windowMonths: 12 }
export function isGenericCategory(c: SuggestionCategory): boolean
export function suggestCategories(input: SuggestCategoriesInput): CategorySuggestion[]
export { normalizeMerchant, ruleTermFor, normalizeCategoryName }
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import {
  suggestCategories, isGenericCategory, type SuggestionTransaction, type SuggestionCategory,
} from '../category-suggestions'

const CATS: SuggestionCategory[] = [
  { id: 'outros', name: 'Outros', parentId: null, polpRef: 'OTHER' },
  { id: 'outros-serv', name: 'Outros serviços gerais', parentId: 'serv', polpRef: 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES' },
  { id: 'alim', name: 'Alimentação', parentId: null, polpRef: null },
  { id: 'casa', name: 'Casa', parentId: null, polpRef: null },
]

let seq = 0
function tx(description: string, reais: number, month: number, categoryId: string | null): SuggestionTransaction {
  const mm = String(month).padStart(2, '0')
  return { id: `t${seq++}`, description, amountCents: -reais * 100, date: `2026-${mm}-10`, categoryId }
}
/** n lançamentos, um por mês a partir de janeiro. */
function serie(description: string, reais: number, n: number, categoryId: string | null) {
  return Array.from({ length: n }, (_, i) => tx(description, reais, (i % 12) + 1, categoryId))
}
const base = { categories: CATS, categoriesWithGoal: new Set<string>(), excludedFingerprints: new Set<string>() }

describe('isGenericCategory', () => {
  it('Outros raiz e filhas "Outros ..." são genéricas', () => {
    expect(isGenericCategory(CATS[0])).toBe(true)
    expect(isGenericCategory(CATS[1])).toBe(true)
    expect(isGenericCategory(CATS[2])).toBe(false)
  })
})

describe('suggestCategories — tipo A', () => {
  it('sugere grupo recorrente sem categoria', () => {
    const r = suggestCategories({ ...base, transactions: serie('IFOOD *REST', 40, 6, null) })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      kind: 'uncategorized', suggestedName: 'Ifood', merchantKey: 'ifood', matchValue: 'ifood',
      parentCategoryId: null, sourceCategoryIds: [], txCount: 6, totalCents: 24000, monthlyAvgCents: 2000,
      fingerprint: 'uncategorized:root:ifood',
    })
  })
  it('junta "Sem categoria" e "Outros" no mesmo grupo e guarda a origem', () => {
    const txs = [...serie('IFOOD *A', 40, 3, null), ...serie('IFOOD *B', 40, 3, 'outros')]
    const [s] = suggestCategories({ ...base, transactions: txs })
    expect(s.txCount).toBe(6)
    expect(s.sourceCategoryIds).toEqual(['outros'])
  })
  it('6 lançamentos em só 2 meses não bastam', () => {
    const txs = [...Array(3)].flatMap(() => [tx('Padaria Pao', 10, 1, null), tx('Padaria Pao', 10, 2, null)])
    expect(suggestCategories({ ...base, transactions: txs })).toEqual([])
  })
  it('R$ 300 com 2 lançamentos basta; compra única grande não', () => {
    expect(suggestCategories({ ...base, transactions: [tx('KABUM LOJA', 2000, 1, null)] })).toEqual([])
    expect(suggestCategories({ ...base, transactions: [tx('KABUM LOJA', 200, 1, null), tx('KABUM LOJA', 200, 5, null)] })).toHaveLength(1)
  })
  it('ignora lançamento já em categoria específica', () => {
    expect(suggestCategories({ ...base, transactions: serie('IFOOD', 40, 6, 'alim') })).toEqual([])
  })
  it('ignora descrição genérica', () => {
    expect(suggestCategories({ ...base, transactions: serie('PIX ENVIADO 123', 400, 6, null) })).toEqual([])
  })
})

describe('suggestCategories — tipo B', () => {
  const grande = [...serie('IFOOD *X', 50, 6, 'alim'), ...serie('PADARIA BELA', 30, 6, 'alim')]
  const pequeno = serie('LEROY MERLIN', 10, 1, 'casa')

  it('divide categoria grande sem meta em subcategorias', () => {
    const r = suggestCategories({ ...base, transactions: [...grande, ...pequeno] })
    expect(r.map((s) => s.fingerprint).sort()).toEqual(['split:alim:ifood', 'split:alim:padaria'])
    expect(r[0]).toMatchObject({ kind: 'split', parentCategoryId: 'alim', sourceCategoryIds: ['alim'] })
  })
  it('categoria com meta não é dividida', () => {
    expect(suggestCategories({ ...base, categoriesWithGoal: new Set(['alim']), transactions: grande })).toEqual([])
  })
  it('um único grupo qualificado não justifica dividir', () => {
    expect(suggestCategories({ ...base, transactions: serie('IFOOD *X', 50, 6, 'alim') })).toEqual([])
  })
  it('categoria abaixo de 10% do total não é dividida', () => {
    const outra = serie('ALUGUEL IMOVEL', 5000, 12, 'casa')
    expect(suggestCategories({ ...base, transactions: [...grande, ...outra] }).filter((s) => s.parentCategoryId === 'alim')).toEqual([])
  })
})

describe('suggestCategories — filtros finais', () => {
  it('não sugere nome que já existe (caixa/acento)', () => {
    const cats = [...CATS, { id: 'x', name: 'IFÓOD', parentId: null, polpRef: null }]
    expect(suggestCategories({ ...base, categories: cats, transactions: serie('IFOOD', 40, 6, null) })).toEqual([])
  })
  it('fingerprint excluído não volta', () => {
    const excl = new Set(['uncategorized:root:ifood'])
    expect(suggestCategories({ ...base, excludedFingerprints: excl, transactions: serie('IFOOD', 40, 6, null) })).toEqual([])
  })
  it('ordena por total e corta em 10', () => {
    const nomes = ['alfaaa', 'betaaa', 'gamaaa', 'deltaa', 'epsilo', 'zetaaa', 'etaaaa', 'tetaaa', 'iotaaa', 'kapaaa', 'lambda', 'musica']
    const txs = nomes.flatMap((n, i) => serie(n.toUpperCase(), 10 + i, 6, null))
    const r = suggestCategories({ ...base, transactions: txs })
    expect(r).toHaveLength(10)
    expect(r[0].merchantKey).toBe('musica')
    expect(r.map((s) => s.totalCents)).toEqual([...r.map((s) => s.totalCents)].sort((a, b) => b - a))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/category-suggestions.test.ts`
Expected: FAIL, "Cannot find module '../category-suggestions'"

- [ ] **Step 3: Write minimal implementation**

`packages/core-finance/src/category-suggestions/suggest.ts`:

```ts
/**
 * Sugestão de categorias a partir dos gastos de 12 meses. Função pura.
 * Ver docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md.
 */
import { normalizeCategoryName, normalizeMerchant, ruleTermFor } from './merchant-key'

export type SuggestionKind = 'uncategorized' | 'split'

export interface SuggestionTransaction {
  id: string
  description: string
  /** Negativo = saída, como em `transactions.amount_cents`. */
  amountCents: number
  /** YYYY-MM-DD */
  date: string
  categoryId: string | null
}

export interface SuggestionCategory {
  id: string
  name: string
  parentId: string | null
  polpRef: string | null
}

export interface SuggestCategoriesInput {
  transactions: SuggestionTransaction[]
  categories: SuggestionCategory[]
  categoriesWithGoal: Set<string>
  /** Fingerprints recusados ou já aceitos: nunca voltam. */
  excludedFingerprints: Set<string>
}

export interface CategorySuggestion {
  kind: SuggestionKind
  fingerprint: string
  suggestedName: string
  parentCategoryId: string | null
  sourceCategoryIds: string[]
  merchantKey: string
  matchValue: string | null
  txCount: number
  totalCents: number
  monthlyAvgCents: number
}

export const SUGGESTION_LIMITS = {
  minCount: 6,
  minMonths: 3,
  minTotalCents: 30_000,
  minCountForTotal: 2,
  splitMinShare: 0.1,
  splitMinGroups: 2,
  maxSuggestions: 10,
  windowMonths: 12,
} as const

export function isGenericCategory(c: SuggestionCategory): boolean {
  const nome = normalizeCategoryName(c.name)
  return c.polpRef === 'OTHER' || nome === 'outros' || nome.startsWith('outros ')
}

interface Grupo {
  key: string
  txs: SuggestionTransaction[]
  totalCents: number
  meses: Set<string>
}

function agrupar(txs: SuggestionTransaction[]): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const t of txs) {
    const key = normalizeMerchant(t.description)
    if (!key) continue
    const g = grupos.get(key) ?? { key, txs: [], totalCents: 0, meses: new Set<string>() }
    g.txs.push(t)
    g.totalCents += -t.amountCents
    g.meses.add(t.date.slice(0, 7))
    grupos.set(key, g)
  }
  return [...grupos.values()]
}

function qualifica(g: Grupo): boolean {
  const L = SUGGESTION_LIMITS
  const recorrente = g.txs.length >= L.minCount && g.meses.size >= L.minMonths
  const relevante = g.totalCents >= L.minTotalCents && g.txs.length >= L.minCountForTotal
  return recorrente || relevante
}

function titleCase(key: string): string {
  return key.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function montar(kind: SuggestionKind, g: Grupo, parentId: string | null, sources: string[]): CategorySuggestion {
  return {
    kind,
    fingerprint: `${kind}:${parentId ?? 'root'}:${g.key}`,
    suggestedName: titleCase(g.key),
    parentCategoryId: parentId,
    sourceCategoryIds: sources,
    merchantKey: g.key,
    matchValue: ruleTermFor(g.key, g.txs.map((t) => t.description)),
    txCount: g.txs.length,
    totalCents: g.totalCents,
    monthlyAvgCents: Math.round(g.totalCents / SUGGESTION_LIMITS.windowMonths),
  }
}

export function suggestCategories(input: SuggestCategoriesInput): CategorySuggestion[] {
  const L = SUGGESTION_LIMITS
  const porId = new Map(input.categories.map((c) => [c.id, c]))
  const nomesExistentes = new Set(input.categories.map((c) => normalizeCategoryName(c.name)))
  const generica = (id: string | null) => id === null || (porId.has(id) && isGenericCategory(porId.get(id)!))

  const saida: CategorySuggestion[] = []

  // Tipo A: gasto em "Sem categoria" / genérica
  for (const g of agrupar(input.transactions.filter((t) => generica(t.categoryId)))) {
    if (!qualifica(g)) continue
    const origens = [...new Set(g.txs.map((t) => t.categoryId).filter((id): id is string => id !== null))]
    saida.push(montar('uncategorized', g, null, origens))
  }

  // Tipo B: categoria específica grande, sem meta, com 2+ grupos relevantes
  const totalGeral = input.transactions.reduce((s, t) => s + -t.amountCents, 0)
  const porCategoria = new Map<string, SuggestionTransaction[]>()
  for (const t of input.transactions) {
    if (generica(t.categoryId) || !porId.has(t.categoryId!)) continue
    const lista = porCategoria.get(t.categoryId!) ?? []
    lista.push(t)
    porCategoria.set(t.categoryId!, lista)
  }
  for (const [catId, txs] of porCategoria) {
    if (input.categoriesWithGoal.has(catId) || totalGeral <= 0) continue
    const gasto = txs.reduce((s, t) => s + -t.amountCents, 0)
    if (gasto / totalGeral < L.splitMinShare) continue
    const grupos = agrupar(txs).filter(qualifica)
    if (grupos.length < L.splitMinGroups) continue
    for (const g of grupos) saida.push(montar('split', g, catId, [catId]))
  }

  return saida
    .filter((s) => !input.excludedFingerprints.has(s.fingerprint))
    .filter((s) => !nomesExistentes.has(normalizeCategoryName(s.suggestedName)))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, L.maxSuggestions)
}
```

`packages/core-finance/src/category-suggestions/index.ts`:

```ts
export * from './merchant-key'
export * from './suggest'
```

Em `packages/core-finance/src/index.ts`, depois de `export * from './budget-pacing'`:

```ts
export * from './category-suggestions'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @floow/core-finance exec vitest run src/__tests__/category-suggestions.test.ts src/__tests__/merchant-key.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/core-finance/src/category-suggestions packages/core-finance/src/index.ts packages/core-finance/src/__tests__/category-suggestions.test.ts
git commit -m "feat(sugestoes): motor de sugestao de categorias"
```

---

### Task 3: Tabela `category_suggestions`

**Files:**
- Create: `supabase/migrations/00058_category_suggestions.sql`
- Create: `packages/db/src/schema/category-suggestions.ts`
- Modify: `packages/db/src/index.ts` (adicionar `export * from './schema/category-suggestions'` depois de `./schema/automation`)
- Test: `apps/web/__tests__/finance/sugestoes-de-categoria-migration.test.ts`

**Interfaces:**
- Produces: `categorySuggestions` (Drizzle), tipos `CategorySuggestionRow`, `NewCategorySuggestionRow`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/00058_category_suggestions.sql'),
  'utf8',
)

describe('migration 00058 category_suggestions', () => {
  it('uma sugestão por fingerprint por org', () => {
    expect(sql).toMatch(/UNIQUE\s*\(\s*org_id\s*,\s*fingerprint\s*\)/)
  })
  it('RLS ligado com as quatro políticas por get_user_org_ids', () => {
    expect(sql).toMatch(/ALTER TABLE public\.category_suggestions ENABLE ROW LEVEL SECURITY/)
    for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toMatch(new RegExp(`FOR ${op} TO authenticated`))
    }
    expect(sql.match(/get_user_org_ids\(\)/g)?.length).toBeGreaterThanOrEqual(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run __tests__/finance/sugestoes-de-categoria-migration.test.ts`
Expected: FAIL, ENOENT no arquivo da migration

- [ ] **Step 3: Write the migration and schema**

`supabase/migrations/00058_category_suggestions.sql`:

```sql
-- supabase/migrations/00058_category_suggestions.sql
-- =============================================================================
-- Sugestões de categoria a partir dos gastos de 12 meses
-- -----------------------------------------------------------------------------
-- Uma rotina semanal (e um botão na tela de metas) agrupa os gastos por
-- estabelecimento e sugere categorias novas. A tabela guarda o status para
-- que uma sugestão recusada nunca volte. Ver
-- docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.category_suggestions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('uncategorized', 'split')),
  fingerprint         text NOT NULL,
  suggested_name      text NOT NULL,
  parent_category_id  uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  -- De onde os lançamentos saem no aceite. No tipo 'uncategorized' os sem
  -- categoria (NULL) entram sempre, além destes ids.
  source_category_ids uuid[] NOT NULL DEFAULT '{}',
  merchant_key        text NOT NULL,
  -- Termo da regra `contains`; NULL = o aceite só recategoriza o histórico.
  match_value         text,
  tx_count            integer NOT NULL,
  total_cents         bigint NOT NULL,
  monthly_avg_cents   bigint NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_category_suggestions_org_status
  ON public.category_suggestions(org_id, status);

ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;

-- Padrão da 00026: a chave no JWT é o ARRAY `org_ids`.
CREATE POLICY "category_suggestions: members can select"
  ON public.category_suggestions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_suggestions: members can insert"
  ON public.category_suggestions FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_suggestions: members can update"
  ON public.category_suggestions FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_suggestions: members can delete"
  ON public.category_suggestions FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
```

`packages/db/src/schema/category-suggestions.ts`:

```ts
import { pgTable, uuid, text, integer, bigint, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { orgs } from './auth'
import { categories } from './finance'

/** Tabela criada na migration 00058_category_suggestions.sql. */
export const categorySuggestions = pgTable(
  'category_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<'uncategorized' | 'split'>(),
    fingerprint: text('fingerprint').notNull(),
    suggestedName: text('suggested_name').notNull(),
    parentCategoryId: uuid('parent_category_id').references(() => categories.id, { onDelete: 'cascade' }),
    sourceCategoryIds: uuid('source_category_ids').array().notNull().default(sql`'{}'`),
    merchantKey: text('merchant_key').notNull(),
    matchValue: text('match_value'),
    txCount: integer('tx_count').notNull(),
    totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
    monthlyAvgCents: bigint('monthly_avg_cents', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('pending').$type<'pending' | 'accepted' | 'dismissed'>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqOrgFingerprint: unique('category_suggestions_org_id_fingerprint_key').on(table.orgId, table.fingerprint),
    idxOrgStatus: index('idx_category_suggestions_org_status').on(table.orgId, table.status),
  }),
)

export type CategorySuggestionRow = typeof categorySuggestions.$inferSelect
export type NewCategorySuggestionRow = typeof categorySuggestions.$inferInsert
```

- [ ] **Step 4: Run test and typecheck**

Run: `pnpm --filter web exec vitest run __tests__/finance/sugestoes-de-categoria-migration.test.ts && pnpm --filter @floow/db typecheck`
Expected: PASS e typecheck sem erro

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add supabase/migrations/00058_category_suggestions.sql packages/db/src/schema/category-suggestions.ts packages/db/src/index.ts apps/web/__tests__/finance/sugestoes-de-categoria-migration.test.ts
git commit -m "feat(sugestoes): tabela category_suggestions com RLS"
```

---

### Task 4: Job por org (sincronização + deps reais)

**Files:**
- Create: `apps/web/lib/finance/category-suggestions/job.ts`
- Create: `apps/web/lib/finance/category-suggestions/deps.ts`
- Create: `apps/web/lib/finance/category-suggestions/janela.ts`
- Test: `apps/web/__tests__/finance/sugestoes-de-categoria-job.test.ts`

**Interfaces:**
- Consumes: `suggestCategories`, `SuggestCategoriesInput`, `CategorySuggestion` (Task 2); `categorySuggestions` (Task 3)
- Produces:

```ts
export interface ExistingSuggestion { id: string; fingerprint: string; status: 'pending' | 'accepted' | 'dismissed' }
export interface SuggestionSyncPlan { inserts: CategorySuggestion[]; updates: { id: string; suggestion: CategorySuggestion }[]; deleteIds: string[] }
export function planSuggestionSync(existing: ExistingSuggestion[], fresh: CategorySuggestion[]): SuggestionSyncPlan
export interface CategorySuggestionDeps {
  loadInput(orgId: string): Promise<Omit<SuggestCategoriesInput, 'excludedFingerprints'>>
  loadExisting(orgId: string): Promise<ExistingSuggestion[]>
  apply(orgId: string, plan: SuggestionSyncPlan): Promise<void>
}
export async function runCategorySuggestionsForOrg(orgId: string, deps: CategorySuggestionDeps): Promise<{ pending: number }>
export function defaultCategorySuggestionDeps(): CategorySuggestionDeps   // deps.ts
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import type { CategorySuggestion } from '@floow/core-finance'
import {
  planSuggestionSync, runCategorySuggestionsForOrg, type CategorySuggestionDeps,
} from '@/lib/finance/category-suggestions/job'

function sug(fingerprint: string, over: Partial<CategorySuggestion> = {}): CategorySuggestion {
  return {
    kind: 'uncategorized', fingerprint, suggestedName: 'X', parentCategoryId: null, sourceCategoryIds: [],
    merchantKey: 'x', matchValue: 'x', txCount: 6, totalCents: 1000, monthlyAvgCents: 83, ...over,
  }
}

describe('planSuggestionSync', () => {
  it('insere novas, atualiza pendentes, apaga pendentes que sumiram', () => {
    const plan = planSuggestionSync(
      [
        { id: '1', fingerprint: 'a', status: 'pending' },
        { id: '2', fingerprint: 'b', status: 'pending' },
      ],
      [sug('a', { txCount: 9 }), sug('c')],
    )
    expect(plan.inserts.map((s) => s.fingerprint)).toEqual(['c'])
    expect(plan.updates).toEqual([{ id: '1', suggestion: sug('a', { txCount: 9 }) }])
    expect(plan.deleteIds).toEqual(['2'])
  })
  it('não toca em aceitas nem recusadas, mesmo que o motor as devolva', () => {
    const plan = planSuggestionSync(
      [
        { id: '1', fingerprint: 'a', status: 'accepted' },
        { id: '2', fingerprint: 'b', status: 'dismissed' },
      ],
      [sug('a'), sug('b')],
    )
    expect(plan).toEqual({ inserts: [], updates: [], deleteIds: [] })
  })
})

describe('runCategorySuggestionsForOrg', () => {
  it('passa aceitas e recusadas como excluídas para o motor', async () => {
    const txs = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`, description: 'IFOOD', amountCents: -4000, date: `2026-0${i + 1}-10`, categoryId: null,
    }))
    const apply = vi.fn(async () => {})
    const deps: CategorySuggestionDeps = {
      loadInput: async () => ({ transactions: txs, categories: [], categoriesWithGoal: new Set() }),
      loadExisting: async () => [{ id: '9', fingerprint: 'uncategorized:root:ifood', status: 'dismissed' }],
      apply,
    }
    const r = await runCategorySuggestionsForOrg('org-1', deps)
    expect(r.pending).toBe(0)
    expect(apply).toHaveBeenCalledWith('org-1', { inserts: [], updates: [], deleteIds: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run __tests__/finance/sugestoes-de-categoria-job.test.ts`
Expected: FAIL, "Cannot find module '@/lib/finance/category-suggestions/job'"

- [ ] **Step 3: Write the job**

`apps/web/lib/finance/category-suggestions/job.ts`:

```ts
/**
 * Sugestões de categoria, por org. Chamado pela rota semanal e pelo botão da
 * tela de metas. Deps injetadas para ser testável sem banco (mesmo molde de
 * notifications/pacing-email-job.ts).
 */
import {
  suggestCategories,
  type CategorySuggestion,
  type SuggestCategoriesInput,
} from '@floow/core-finance'

export interface ExistingSuggestion {
  id: string
  fingerprint: string
  status: 'pending' | 'accepted' | 'dismissed'
}

export interface SuggestionSyncPlan {
  inserts: CategorySuggestion[]
  updates: { id: string; suggestion: CategorySuggestion }[]
  deleteIds: string[]
}

export interface CategorySuggestionDeps {
  loadInput(orgId: string): Promise<Omit<SuggestCategoriesInput, 'excludedFingerprints'>>
  loadExisting(orgId: string): Promise<ExistingSuggestion[]>
  apply(orgId: string, plan: SuggestionSyncPlan): Promise<void>
}

export function planSuggestionSync(existing: ExistingSuggestion[], fresh: CategorySuggestion[]): SuggestionSyncPlan {
  const porFingerprint = new Map(existing.map((e) => [e.fingerprint, e]))
  const frescas = new Set(fresh.map((s) => s.fingerprint))
  const plan: SuggestionSyncPlan = { inserts: [], updates: [], deleteIds: [] }

  for (const s of fresh) {
    const atual = porFingerprint.get(s.fingerprint)
    if (!atual) plan.inserts.push(s)
    else if (atual.status === 'pending') plan.updates.push({ id: atual.id, suggestion: s })
  }
  // Pendente que o motor não devolve mais: o dado mudou, a sugestão perdeu sentido.
  for (const e of existing) {
    if (e.status === 'pending' && !frescas.has(e.fingerprint)) plan.deleteIds.push(e.id)
  }
  return plan
}

export async function runCategorySuggestionsForOrg(
  orgId: string,
  deps: CategorySuggestionDeps,
): Promise<{ pending: number }> {
  const [input, existing] = await Promise.all([deps.loadInput(orgId), deps.loadExisting(orgId)])
  const excludedFingerprints = new Set(existing.filter((e) => e.status !== 'pending').map((e) => e.fingerprint))
  const fresh = suggestCategories({ ...input, excludedFingerprints })
  await deps.apply(orgId, planSuggestionSync(existing, fresh))
  return { pending: fresh.length }
}
```

`apps/web/lib/finance/category-suggestions/janela.ts` (sem imports: o aceite e as deps usam, e o teste do aceite não pode puxar o banco real):

```ts
/** Hoje em São Paulo, YYYY-MM-DD: o servidor roda em UTC. */
export function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Primeiro dia do mês, 12 meses atrás (janela da análise). */
export function inicioDaJanela(hoje: string): string {
  const [y, m] = hoje.split('-').map(Number)
  const d = new Date(y, m - 1 - 11, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
```

`apps/web/lib/finance/category-suggestions/deps.ts`:

```ts
/**
 * Implementação real (Drizzle) das deps do job de sugestões. Separada do job
 * para ele ser testável sem banco.
 */
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { getDb, categorySuggestions, transactions } from '@floow/db'
import type { CategorySuggestion } from '@floow/core-finance'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'
import { somenteRealizado } from '@/lib/finance/realized-spending'
import { getCategories } from '@/lib/finance/queries'
import { getSpendingPlanForMonth } from '@/lib/finance/recurring-budget-queries'
import type { CategorySuggestionDeps, ExistingSuggestion } from './job'

import { hojeSP, inicioDaJanela } from './janela'

function valores(orgId: string, s: CategorySuggestion) {
  return {
    orgId,
    kind: s.kind,
    fingerprint: s.fingerprint,
    suggestedName: s.suggestedName,
    parentCategoryId: s.parentCategoryId,
    sourceCategoryIds: s.sourceCategoryIds,
    merchantKey: s.merchantKey,
    matchValue: s.matchValue,
    txCount: s.txCount,
    totalCents: s.totalCents,
    monthlyAvgCents: s.monthlyAvgCents,
  }
}

export function defaultCategorySuggestionDeps(): CategorySuggestionDeps {
  const db = getDb()
  return {
    async loadInput(orgId) {
      const hoje = hojeSP()
      const [y, m] = hoje.split('-').map(Number)
      const [txs, cats, plano] = await Promise.all([
        db
          .select({
            id: transactions.id,
            description: transactions.description,
            amountCents: transactions.amountCents,
            date: transactions.date,
            categoryId: transactions.categoryId,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.orgId, orgId),
              eq(transactions.type, 'expense'),
              eq(transactions.reviewState, 'confirmed'),
              eq(transactions.isIgnored, false),
              somenteRealizado,
              effectiveAffectsCashFlow,
              gte(transactions.date, inicioDaJanela(hoje)),
              lte(transactions.date, hoje),
            ),
          ),
        getCategories(orgId),
        getSpendingPlanForMonth(orgId, new Date(y, m - 1, 1), new Date(y, m, 0)),
      ])
      return {
        transactions: txs.map((t) => ({ ...t, date: String(t.date).slice(0, 10) })),
        categories: cats
          .filter((c) => c.type === 'expense')
          .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, polpRef: c.polpRef })),
        categoriesWithGoal: new Set(plano.map((l) => l.categoryId).filter((id): id is string => !!id)),
      }
    },

    async loadExisting(orgId) {
      return db
        .select({ id: categorySuggestions.id, fingerprint: categorySuggestions.fingerprint, status: categorySuggestions.status })
        .from(categorySuggestions)
        .where(eq(categorySuggestions.orgId, orgId)) as Promise<ExistingSuggestion[]>
    },

    async apply(orgId, plan) {
      await db.transaction(async (tx) => {
        if (plan.inserts.length > 0) {
          await tx.insert(categorySuggestions).values(plan.inserts.map((s) => valores(orgId, s))).onConflictDoNothing()
        }
        for (const { id, suggestion } of plan.updates) {
          await tx
            .update(categorySuggestions)
            .set({ ...valores(orgId, suggestion), updatedAt: new Date() })
            .where(and(eq(categorySuggestions.id, id), eq(categorySuggestions.status, 'pending')))
        }
        if (plan.deleteIds.length > 0) {
          await tx
            .delete(categorySuggestions)
            .where(and(inArray(categorySuggestions.id, plan.deleteIds), eq(categorySuggestions.status, 'pending')))
        }
      })
    },
  }
}
```

Nota: `getCategories` já esconde as categorias de sistema que a org ocultou. Confirme que ele e `getSpendingPlanForMonth` são exportados de onde o import aponta (`grep -n "export.*getCategories" apps/web/lib/finance/queries.ts`); se `getCategories` só existir em `queries-categories.ts`, importe de lá.

- [ ] **Step 4: Run test and typecheck**

Run: `pnpm --filter web exec vitest run __tests__/finance/sugestoes-de-categoria-job.test.ts && pnpm --filter web typecheck`
Expected: PASS e typecheck sem erro

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/category-suggestions/job.ts apps/web/lib/finance/category-suggestions/deps.ts apps/web/lib/finance/category-suggestions/janela.ts apps/web/__tests__/finance/sugestoes-de-categoria-job.test.ts
git commit -m "feat(sugestoes): job por org com sincronizacao das sugestoes"
```

---

### Task 5: Aceitar, recusar e analisar

**Files:**
- Create: `apps/web/lib/finance/category-name.ts` (move `assertNameIsFree` para cá)
- Modify: `apps/web/lib/finance/category-actions.ts` (importar `assertNameIsFree` de `./category-name` e apagar a cópia local, linhas ~284-293)
- Create: `apps/web/lib/finance/category-suggestions/accept.ts`
- Create: `apps/web/lib/finance/category-suggestion-actions.ts`
- Test: `apps/web/__tests__/finance/sugestoes-de-categoria-aceite.test.ts`

**Interfaces:**
- Consumes: `normalizeMerchant` (Task 1), `categorySuggestions` (Task 3), `runCategorySuggestionsForOrg`, `defaultCategorySuggestionDeps` (Task 4)
- Produces:

```ts
// category-name.ts
export async function assertNameIsFree(db: Db, orgId: string, name: string, exceptId?: string): Promise<void>
// accept.ts
export interface AcceptInput { suggestionId: string; name: string; parentCategoryId: string | null }
export interface AcceptResult { categoryId: string; name: string; monthlyAvgCents: number; moved: number }
export async function aceitarSugestao(db: Db, orgId: string, input: AcceptInput, hoje: string): Promise<AcceptResult>
// category-suggestion-actions.ts ('use server')
export async function acceptCategorySuggestion(input: AcceptInput): Promise<AcceptResult>
export async function dismissCategorySuggestion(id: string): Promise<void>
export async function analyzeCategorySuggestions(): Promise<{ pending: number }>
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { aceitarSugestao } from '@/lib/finance/category-suggestions/accept'

interface Op { op: 'select' | 'insert' | 'update'; table: string; payload?: unknown }
const ops: Op[] = []
const selectQueue: unknown[][] = []
const insertQueue: unknown[][] = []

function chain(result: unknown[], op?: Op): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning', 'orderBy']) {
    c[m] = (arg?: unknown) => {
      if (op && (m === 'values' || m === 'set')) op.payload = arg
      return chain(result, op)
    }
  }
  return c
}
const tx = {
  select: () => { ops.push({ op: 'select', table: '?' }); return chain(selectQueue.shift() ?? []) },
  insert: (t: any) => { const op: Op = { op: 'insert', table: t[Symbol.for('drizzle:Name')] }; ops.push(op); return chain(insertQueue.shift() ?? [], op) },
  update: (t: any) => { const op: Op = { op: 'update', table: t[Symbol.for('drizzle:Name')] }; ops.push(op); return chain([], op) },
}
const db: any = { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }

const SUG = {
  id: 's1', kind: 'uncategorized', merchantKey: 'ifood', matchValue: 'ifood',
  sourceCategoryIds: ['outros'], monthlyAvgCents: 2000, status: 'pending',
}

beforeEach(() => { ops.length = 0; selectQueue.length = 0; insertQueue.length = 0 })

describe('aceitarSugestao', () => {
  it('cria categoria e regra, move só os lançamentos do grupo que estão na origem', async () => {
    selectQueue.push(
      [SUG],   // sugestão
      [],      // nome livre
      [        // candidatos (já filtrados por origem na query)
        { id: 't1', description: 'IFOOD *REST' },
        { id: 't2', description: 'UBER TRIP' },
      ],
    )
    insertQueue.push([{ id: 'nova' }], [])
    const r = await aceitarSugestao(db, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: null }, '2026-09-24')

    expect(r).toEqual({ categoryId: 'nova', name: 'Delivery', monthlyAvgCents: 2000, moved: 1 })
    const inserts = ops.filter((o) => o.op === 'insert').map((o) => o.table)
    expect(inserts).toEqual(['categories', 'category_rules'])
    expect(ops.find((o) => o.table === 'category_rules')?.payload).toMatchObject({ matchType: 'contains', matchValue: 'ifood', categoryId: 'nova' })
    const updates = ops.filter((o) => o.op === 'update')
    expect(updates.map((o) => o.table)).toEqual(['transactions', 'category_suggestions'])
    expect(updates[0].payload).toEqual({ categoryId: 'nova' })
    expect(updates[1].payload).toMatchObject({ status: 'accepted' })
  })

  it('sem match_value não cria regra', async () => {
    selectQueue.push([{ ...SUG, matchValue: null }], [], [])
    insertQueue.push([{ id: 'nova' }])
    await aceitarSugestao(db, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: null }, '2026-09-24')
    expect(ops.filter((o) => o.op === 'insert').map((o) => o.table)).toEqual(['categories'])
  })

  it('nome já existente aborta antes de gravar', async () => {
    selectQueue.push([SUG], [{ id: 'outra' }])
    await expect(
      aceitarSugestao(db, 'org-1', { suggestionId: 's1', name: 'Mercado', parentCategoryId: null }, '2026-09-24'),
    ).rejects.toThrow('Já existe uma categoria com esse nome')
    expect(ops.some((o) => o.op !== 'select')).toBe(false)
  })

  it('sugestão que não está pendente é recusada', async () => {
    selectQueue.push([])
    await expect(
      aceitarSugestao(db, 'org-1', { suggestionId: 's1', name: 'X', parentCategoryId: null }, '2026-09-24'),
    ).rejects.toThrow('Sugestão não encontrada')
  })
})
```

Se `t[Symbol.for('drizzle:Name')]` não devolver o nome da tabela nesta versão do Drizzle, use `getTableName(t)` de `drizzle-orm`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run __tests__/finance/sugestoes-de-categoria-aceite.test.ts`
Expected: FAIL, "Cannot find module '@/lib/finance/category-suggestions/accept'"

- [ ] **Step 3: Write the implementation**

`apps/web/lib/finance/category-name.ts` (conteúdo movido de `category-actions.ts`, sem mudança de comportamento; fora do arquivo `'use server'` para não virar endpoint):

```ts
import { and, eq, ilike, isNull, or } from 'drizzle-orm'
import { categories, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>

export async function assertNameIsFree(db: Pick<Db, 'select'>, orgId: string, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(ilike(categories.name, name), or(eq(categories.orgId, orgId), isNull(categories.orgId))))

  if (rows.some((row) => row.id !== exceptId)) {
    throw new Error('Já existe uma categoria com esse nome')
  }
}
```

Em `category-actions.ts`: adicionar `import { assertNameIsFree } from './category-name'` e remover a função local `assertNameIsFree`. Rodar `pnpm --filter web exec vitest run __tests__/finance/category-actions.test.ts` para confirmar que nada mudou.

`apps/web/lib/finance/category-suggestions/accept.ts`:

```ts
/**
 * Aceite de uma sugestão de categoria, numa transação só: cria a categoria,
 * a regra, move o histórico e marca a sugestão. Só move lançamentos que estão
 * na categoria de origem da sugestão (ou sem categoria, no tipo A): o que o
 * usuário classificou à mão em outra categoria fica onde está.
 */
import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { categories, categoryRules, categorySuggestions, transactions, type getDb } from '@floow/db'
import { normalizeMerchant } from '@floow/core-finance'
import { assertNameIsFree } from '../category-name'
import { inicioDaJanela } from './janela'

type Db = ReturnType<typeof getDb>

export interface AcceptInput {
  suggestionId: string
  name: string
  parentCategoryId: string | null
}

export interface AcceptResult {
  categoryId: string
  name: string
  monthlyAvgCents: number
  moved: number
}

export async function aceitarSugestao(db: Db, orgId: string, input: AcceptInput, hoje: string): Promise<AcceptResult> {
  const name = input.name.trim()
  if (!name) throw new Error('Informe um nome')

  return db.transaction(async (tx) => {
    const [sug] = await tx
      .select()
      .from(categorySuggestions)
      .where(
        and(
          eq(categorySuggestions.id, input.suggestionId),
          eq(categorySuggestions.orgId, orgId),
          eq(categorySuggestions.status, 'pending'),
        ),
      )
      .limit(1)
    if (!sug) throw new Error('Sugestão não encontrada')

    await assertNameIsFree(tx, orgId, name)

    let color: string | null = null
    let icon: string | null = null
    if (input.parentCategoryId) {
      const [mae] = await tx
        .select({ color: categories.color, icon: categories.icon })
        .from(categories)
        .where(
          and(
            eq(categories.id, input.parentCategoryId),
            or(eq(categories.orgId, orgId), isNull(categories.orgId)),
          ),
        )
        .limit(1)
      if (!mae) throw new Error('Categoria mãe não encontrada')
      color = mae.color
      icon = mae.icon
    }

    const [criada] = await tx
      .insert(categories)
      .values({ orgId, name, type: 'expense', color, icon, parentId: input.parentCategoryId })
      .returning({ id: categories.id })

    if (sug.matchValue) {
      await tx.insert(categoryRules).values({
        orgId,
        categoryId: criada.id,
        matchType: 'contains',
        matchValue: sug.matchValue,
      })
    }

    const origem = sug.sourceCategoryIds.length > 0 ? inArray(transactions.categoryId, sug.sourceCategoryIds) : undefined
    const semCategoria = sug.kind === 'uncategorized' ? isNull(transactions.categoryId) : undefined
    const candidatos = await tx
      .select({ id: transactions.id, description: transactions.description })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.type, 'expense'),
          gte(transactions.date, inicioDaJanela(hoje)),
          or(origem, semCategoria),
        ),
      )

    const ids = candidatos.filter((c) => normalizeMerchant(c.description) === sug.merchantKey).map((c) => c.id)
    if (ids.length > 0) {
      await tx
        .update(transactions)
        .set({ categoryId: criada.id })
        .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, ids)))
    }

    await tx
      .update(categorySuggestions)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(categorySuggestions.id, sug.id))

    return { categoryId: criada.id, name, monthlyAvgCents: sug.monthlyAvgCents, moved: ids.length }
  })
}
```

Nota: `or(undefined, undefined)` nunca acontece: o tipo A sempre tem `semCategoria` e o tipo B sempre tem uma origem.

`apps/web/lib/finance/category-suggestion-actions.ts`:

```ts
'use server'

/**
 * Server actions das sugestões de categoria (card na tela de metas).
 * A lógica mora em category-suggestions/; aqui só org, cache e revalidação.
 */
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb, categorySuggestions } from '@floow/db'
import { getOrgId } from './queries'
import { revalidateCategoryData, revalidateTransactionData } from './revalidate'
import { aceitarSugestao, type AcceptInput, type AcceptResult } from './category-suggestions/accept'
import { runCategorySuggestionsForOrg } from './category-suggestions/job'
import { defaultCategorySuggestionDeps } from './category-suggestions/deps'
import { hojeSP } from './category-suggestions/janela'

export async function acceptCategorySuggestion(input: AcceptInput): Promise<AcceptResult> {
  const orgId = await getOrgId()
  const result = await aceitarSugestao(getDb(), orgId, input, hojeSP())
  revalidateCategoryData(orgId)
  revalidateTransactionData(orgId)
  revalidatePath('/budgets/spending')
  return result
}

export async function dismissCategorySuggestion(id: string): Promise<void> {
  const orgId = await getOrgId()
  await getDb()
    .update(categorySuggestions)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(and(eq(categorySuggestions.id, id), eq(categorySuggestions.orgId, orgId), eq(categorySuggestions.status, 'pending')))
  revalidatePath('/budgets/spending')
}

export async function analyzeCategorySuggestions(): Promise<{ pending: number }> {
  const orgId = await getOrgId()
  const r = await runCategorySuggestionsForOrg(orgId, defaultCategorySuggestionDeps())
  revalidatePath('/budgets/spending')
  return r
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter web exec vitest run __tests__/finance/sugestoes-de-categoria-aceite.test.ts __tests__/finance/category-actions.test.ts __tests__/finance/escopo-de-org-nas-actions.test.ts && pnpm --filter web typecheck`
Expected: PASS. Se `escopo-de-org-nas-actions.test.ts` varrer arquivos `*-actions.ts` exigindo `orgId` em todo `where`, o novo arquivo já cumpre isso.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/category-name.ts apps/web/lib/finance/category-actions.ts apps/web/lib/finance/category-suggestions/accept.ts apps/web/lib/finance/category-suggestion-actions.ts apps/web/__tests__/finance/sugestoes-de-categoria-aceite.test.ts
git commit -m "feat(sugestoes): aceitar, recusar e analisar sugestoes"
```

---

### Task 6: Rota agendada semanal

**Files:**
- Create: `apps/web/app/api/category-suggestions/run-weekly/route.ts`
- Modify: `vercel.json` (novo item em `crons`)
- Modify: `apps/web/middleware.ts` (liberar a rota em `PUBLIC_ROUTE_PREFIXES`)
- Test: `apps/web/__tests__/finance/sugestoes-de-categoria-rota.test.ts` (o `__tests__/auth/cron-routes-get.test.ts` existente cobre o GET automaticamente)

**Interfaces:**
- Consumes: `runCategorySuggestionsForOrg`, `defaultCategorySuggestionDeps` (Task 4), `isAuthorizedService`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const run = vi.fn(async () => ({ pending: 1 }))
vi.mock('@/lib/finance/category-suggestions/job', () => ({ runCategorySuggestionsForOrg: run }))
vi.mock('@/lib/finance/category-suggestions/deps', () => ({ defaultCategorySuggestionDeps: () => ({}) }))
vi.mock('@floow/db', () => ({
  transactions: { orgId: 'org_id', date: 'date' },
  getDb: () => ({
    selectDistinct: () => ({ from: () => ({ where: async () => [{ orgId: 'a' }, { orgId: 'b' }] }) }),
  }),
}))

const { GET } = await import('@/app/api/category-suggestions/run-weekly/route')

beforeEach(() => {
  run.mockClear()
  process.env.CRON_SECRET = 'segredo'
})

describe('rota semanal de sugestões', () => {
  it('401 sem o segredo', async () => {
    const res = await GET(new Request('http://x/api/category-suggestions/run-weekly'))
    expect(res.status).toBe(401)
    expect(run).not.toHaveBeenCalled()
  })
  it('roda para cada org ativa; falha de uma não derruba a outra', async () => {
    run.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(new Request('http://x', { headers: { authorization: 'Bearer segredo' } }))
    expect(res.status).toBe(200)
    expect(run).toHaveBeenCalledTimes(2)
    expect(await res.json()).toMatchObject({ ok: true, orgs: 2, failed: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run __tests__/finance/sugestoes-de-categoria-rota.test.ts`
Expected: FAIL, módulo da rota não encontrado

- [ ] **Step 3: Write the route and config**

`apps/web/app/api/category-suggestions/run-weekly/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getDb, transactions } from '@floow/db'
import { gte } from 'drizzle-orm'
import { isAuthorizedService } from '@/lib/auth/service-auth'
import { runCategorySuggestionsForOrg } from '@/lib/finance/category-suggestions/job'
import { defaultCategorySuggestionDeps } from '@/lib/finance/category-suggestions/deps'

/** Sugestões de categoria, toda segunda. Ver docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md. */
export async function POST(request: Request) {
  const authorized = isAuthorizedService(request.headers.get('authorization'), [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
  ])
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getDb()
    const trintaDias = new Date()
    trintaDias.setDate(trintaDias.getDate() - 30)
    const orgs = await db
      .selectDistinct({ orgId: transactions.orgId })
      .from(transactions)
      .where(gte(transactions.date, trintaDias))

    const deps = defaultCategorySuggestionDeps()
    let pending = 0
    let failed = 0
    for (let i = 0; i < orgs.length; i += 10) {
      const lote = orgs.slice(i, i + 10)
      const results = await Promise.all(
        lote.map((row) =>
          runCategorySuggestionsForOrg(row.orgId, deps).catch((err) => {
            console.error(`[sugestoes] falhou para org=${row.orgId}:`, err)
            return null
          }),
        ),
      )
      for (const r of results) {
        if (r) pending += r.pending
        else failed++
      }
    }
    return NextResponse.json({ ok: true, orgs: orgs.length, pending, failed })
  } catch (err) {
    console.error('[sugestoes] rodada semanal falhou:', err)
    return NextResponse.json({ error: 'Weekly run failed' }, { status: 500 })
  }
}

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
```

Em `vercel.json`, dentro de `crons`, adicionar:

```json
{
  "path": "/api/category-suggestions/run-weekly",
  "schedule": "0 10 * * 1"
}
```

Em `apps/web/middleware.ts`, dentro de `PUBLIC_ROUTE_PREFIXES`, depois da linha de `/api/openfinance/import-transactions`:

```ts
  '/api/category-suggestions/run-weekly', // Cron semanal — usa CRON_SECRET / SERVICE_ROLE_KEY
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run __tests__/finance/sugestoes-de-categoria-rota.test.ts __tests__/auth/cron-routes-get.test.ts`
Expected: PASS (o teste de GET agora inclui a rota nova)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/app/api/category-suggestions/run-weekly/route.ts vercel.json apps/web/middleware.ts apps/web/__tests__/finance/sugestoes-de-categoria-rota.test.ts
git commit -m "feat(sugestoes): rota semanal agendada"
```

---

### Task 7: Card na tela de metas e diálogo pré-preenchido

**Files:**
- Modify: `apps/web/components/finance/budget-entry-dialog.tsx` (props `initialCategoryId`, `initialAmountCents`)
- Create: `apps/web/components/finance/category-suggestions-card.tsx`
- Create: `apps/web/components/finance/accept-suggestion-dialog.tsx`
- Create: `apps/web/lib/finance/category-suggestion-queries.ts`
- Modify: `apps/web/app/(app)/budgets/spending/page.tsx`
- Modify: `apps/web/app/(app)/budgets/spending/client.tsx`
- Test: `apps/web/__tests__/finance/card-de-sugestoes.test.tsx`

**Interfaces:**
- Consumes: `acceptCategorySuggestion`, `dismissCategorySuggestion`, `analyzeCategorySuggestions`, `AcceptResult` (Task 5)
- Produces:

```ts
// category-suggestion-queries.ts
export interface PendingSuggestion { id: string; kind: 'uncategorized' | 'split'; suggestedName: string; parentCategoryId: string | null; txCount: number; totalCents: number; monthlyAvgCents: number }
export async function getPendingCategorySuggestions(orgId: string): Promise<PendingSuggestion[]>
// category-suggestions-card.tsx
export function CategorySuggestionsCard(props: { suggestions: PendingSuggestion[]; parentOptions: { id: string; name: string }[]; onAccepted(result: AcceptResult): void }): JSX.Element
```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

const acceptCategorySuggestion = vi.fn(async () => ({ categoryId: 'nova', name: 'Delivery', monthlyAvgCents: 10300, moved: 38 }))
const dismissCategorySuggestion = vi.fn(async () => {})
const analyzeCategorySuggestions = vi.fn(async () => ({ pending: 0 }))
vi.mock('@/lib/finance/category-suggestion-actions', () => ({
  acceptCategorySuggestion, dismissCategorySuggestion, analyzeCategorySuggestions,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { CategorySuggestionsCard } = await import('@/components/finance/category-suggestions-card')
const { ToastProvider } = await import('@/components/ui/toast')

const SUGS = [{
  id: 's1', kind: 'uncategorized' as const, suggestedName: 'Ifood', parentCategoryId: null,
  txCount: 38, totalCents: 124000, monthlyAvgCents: 10300,
}]

function renderCard(suggestions = SUGS, onAccepted = vi.fn()) {
  render(
    <ToastProvider>
      <CategorySuggestionsCard suggestions={suggestions} parentOptions={[{ id: 'alim', name: 'Alimentação' }]} onAccepted={onAccepted} />
    </ToastProvider>,
  )
  return onAccepted
}

beforeEach(() => { vi.clearAllMocks() })

describe('CategorySuggestionsCard', () => {
  it('mostra a sugestão com números', () => {
    renderCard()
    expect(screen.getByText('Ifood')).toBeTruthy()
    expect(screen.getByText(/38 lançamentos/)).toBeTruthy()
  })
  it('recusar chama a action com o id', async () => {
    renderCard()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Recusar' })) })
    expect(dismissCategorySuggestion).toHaveBeenCalledWith('s1')
  })
  it('aceitar com nome editado chama a action e devolve o resultado', async () => {
    const onAccepted = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    fireEvent.change(screen.getByLabelText('Nome da categoria'), { target: { value: 'Delivery' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar categoria' })) })
    expect(acceptCategorySuggestion).toHaveBeenCalledWith({ suggestionId: 's1', name: 'Delivery', parentCategoryId: null })
    expect(onAccepted).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'nova', monthlyAvgCents: 10300 }))
  })
  it('sem sugestões mostra estado vazio e o botão de analisar', async () => {
    renderCard([])
    expect(screen.getByText(/Nenhuma sugestão/)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analisar meus gastos' })) })
    expect(analyzeCategorySuggestions).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run __tests__/finance/card-de-sugestoes.test.tsx`
Expected: FAIL, módulo do card não encontrado

- [ ] **Step 3: Write the query, dialog and card**

`apps/web/lib/finance/category-suggestion-queries.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm'
import { getDb, categorySuggestions } from '@floow/db'

export interface PendingSuggestion {
  id: string
  kind: 'uncategorized' | 'split'
  suggestedName: string
  parentCategoryId: string | null
  txCount: number
  totalCents: number
  monthlyAvgCents: number
}

/** Sem cache: a lista muda a cada aceite/recusa e é pequena (≤ 10). */
export async function getPendingCategorySuggestions(orgId: string): Promise<PendingSuggestion[]> {
  return getDb()
    .select({
      id: categorySuggestions.id,
      kind: categorySuggestions.kind,
      suggestedName: categorySuggestions.suggestedName,
      parentCategoryId: categorySuggestions.parentCategoryId,
      txCount: categorySuggestions.txCount,
      totalCents: categorySuggestions.totalCents,
      monthlyAvgCents: categorySuggestions.monthlyAvgCents,
    })
    .from(categorySuggestions)
    .where(and(eq(categorySuggestions.orgId, orgId), eq(categorySuggestions.status, 'pending')))
    .orderBy(desc(categorySuggestions.totalCents))
}
```

`apps/web/components/finance/accept-suggestion-dialog.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PendingSuggestion } from '@/lib/finance/category-suggestion-queries'

interface Props {
  suggestion: PendingSuggestion | null
  parentOptions: { id: string; name: string }[]
  loading: boolean
  onClose: () => void
  onConfirm: (name: string, parentCategoryId: string | null) => void
}

export function AcceptSuggestionDialog({ suggestion, parentOptions, loading, onClose, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')

  useEffect(() => {
    if (!suggestion) return
    setName(suggestion.suggestedName)
    setParentId(suggestion.parentCategoryId ?? '')
  }, [suggestion])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (suggestion && !el.open) el.showModal()
    if (!suggestion && el.open) el.close()
  }, [suggestion])

  return (
    <dialog ref={ref} onClose={onClose} className="rounded-lg p-0 backdrop:bg-black/40">
      <form
        className="w-[min(92vw,420px)] space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onConfirm(name.trim(), parentId || null)
        }}
      >
        <h2 className="text-base font-semibold">Criar categoria sugerida</h2>
        <label className="block space-y-1 text-sm">
          <span>Nome da categoria</span>
          <input
            aria-label="Nome da categoria"
            className="w-full rounded-md border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Categoria mãe</span>
          <select className="w-full rounded-md border px-3 py-2" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Nenhuma (categoria principal)</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Os lançamentos dos últimos 12 meses desse estabelecimento vão para a categoria nova, e os próximos entram nela automaticamente.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={loading || !name.trim()}>Criar categoria</Button>
        </div>
      </form>
    </dialog>
  )
}
```

`apps/web/components/finance/category-suggestions-card.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { formatBRL } from '@floow/core-finance/src/balance'
import {
  acceptCategorySuggestion,
  analyzeCategorySuggestions,
  dismissCategorySuggestion,
} from '@/lib/finance/category-suggestion-actions'
import type { PendingSuggestion } from '@/lib/finance/category-suggestion-queries'
import type { AcceptResult } from '@/lib/finance/category-suggestions/accept'
import { AcceptSuggestionDialog } from './accept-suggestion-dialog'

interface Props {
  suggestions: PendingSuggestion[]
  parentOptions: { id: string; name: string }[]
  onAccepted: (result: AcceptResult) => void
}

export function CategorySuggestionsCard({ suggestions, parentOptions, onAccepted }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [accepting, setAccepting] = useState<PendingSuggestion | null>(null)
  const parentName = (id: string | null) => parentOptions.find((p) => p.id === id)?.name

  async function analisar() {
    setBusy(true)
    try {
      const r = await analyzeCategorySuggestions()
      toast(r.pending > 0 ? `${r.pending} sugestão(ões) encontrada(s)` : 'Nenhuma sugestão nova')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao analisar', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function recusar(id: string) {
    setBusy(true)
    try {
      await dismissCategorySuggestion(id)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao recusar', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmar(name: string, parentCategoryId: string | null) {
    if (!accepting) return
    setBusy(true)
    try {
      const r = await acceptCategorySuggestion({ suggestionId: accepting.id, name, parentCategoryId })
      toast(`Categoria "${r.name}" criada · ${r.moved} lançamento(s) movido(s)`)
      setAccepting(null)
      onAccepted(r)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao criar categoria', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Sugestões de categoria</CardTitle>
        <Button variant="ghost" size="sm" onClick={analisar} disabled={busy}>Analisar meus gastos</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma sugestão no momento.</p>
        )}
        {suggestions.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <p className="font-medium">{s.suggestedName}</p>
              <p className="text-xs text-muted-foreground">
                {s.txCount} lançamentos · {formatBRL(s.totalCents)} em 12 meses · ~{formatBRL(s.monthlyAvgCents)}/mês
                {s.kind === 'split' && parentName(s.parentCategoryId) ? ` · dentro de ${parentName(s.parentCategoryId)}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => recusar(s.id)} disabled={busy}>Recusar</Button>
              <Button variant="primary" size="sm" onClick={() => setAccepting(s)} disabled={busy}>Aceitar</Button>
            </div>
          </div>
        ))}
      </CardContent>
      <AcceptSuggestionDialog
        suggestion={accepting}
        parentOptions={parentOptions}
        loading={busy}
        onClose={() => setAccepting(null)}
        onConfirm={confirmar}
      />
    </Card>
  )
}
```

Confirme que `formatBRL` recebe centavos (`grep -n "export function formatBRL" -A5 packages/core-finance/src/balance.ts`); se receber reais, passe `s.totalCents / 100`. Confirme também que `Button` aceita `variant="ghost"` (`grep -n "variant" apps/web/components/ui/button.tsx`); se não aceitar, use a variante secundária que existir lá.

- [ ] **Step 4: Run the card test**

Run: `pnpm --filter web exec vitest run __tests__/finance/card-de-sugestoes.test.tsx`
Expected: PASS

- [ ] **Step 5: Diálogo de meta pré-preenchido: teste**

Adicionar em `apps/web/__tests__/finance/dialogo-nova-meta-gasto.test.tsx`, no fim do `describe` existente (usa `CATEGORIAS`, `ToastProvider` e `BudgetEntryDialog` já importados no arquivo):

```tsx
  it('abre pré-preenchido com categoria e valor quando vem de uma sugestão', () => {
    render(
      <ToastProvider>
        <BudgetEntryDialog
          type="spending"
          open
          onClose={vi.fn()}
          availableCategories={CATEGORIAS}
          onCategoryCreated={vi.fn()}
          initialCategoryId="cat-1"
          initialAmountCents={10300}
        />
      </ToastProvider>,
    )
    expect((screen.getByDisplayValue('103,00') as HTMLInputElement).value).toBe('103,00')
    expect((screen.getByDisplayValue('Mercado') as HTMLSelectElement).value).toBe('cat-1')
  })
```

Run: `pnpm --filter web exec vitest run __tests__/finance/dialogo-nova-meta-gasto.test.tsx`
Expected: FAIL (props não existem / campos vazios)

- [ ] **Step 6: Diálogo de meta pré-preenchido: implementação**

Em `apps/web/components/finance/budget-entry-dialog.tsx`, na interface `BudgetEntryDialogProps` adicionar:

```ts
  /** Pré-preenchimento vindo do aceite de uma sugestão de categoria. */
  initialCategoryId?: string
  initialAmountCents?: number
```

Na desestruturação dos props adicionar `initialCategoryId, initialAmountCents,` e trocar o efeito de reset:

```ts
  // Cada abertura começa limpa (ou com o que veio da sugestão aceita)
  useEffect(() => {
    if (!open) return
    setCategoryId(initialCategoryId ?? '')
    setName(defaultName)
    setAmount(initialAmountCents ? (initialAmountCents / 100).toFixed(2).replace('.', ',') : '')
    setStartMonth('')
    setEndMode('indefinite')
    setEndMonth('')
    setShowNewCategory(false)
    setNewCategoryName('')
  }, [open, defaultName, initialCategoryId, initialAmountCents])
```

Run: `pnpm --filter web exec vitest run __tests__/finance/dialogo-nova-meta-gasto.test.tsx`
Expected: PASS (todos, inclusive os antigos)

- [ ] **Step 7: Ligar na tela**

Em `apps/web/app/(app)/budgets/spending/page.tsx`: importar `getPendingCategorySuggestions` de `@/lib/finance/category-suggestion-queries`, acrescentar `getPendingCategorySuggestions(orgId)` ao `Promise.all` (desestruturar como `suggestions`) e passar `suggestions={suggestions}` ao `SpendingClient`.

Em `apps/web/app/(app)/budgets/spending/client.tsx`:

1. Imports:
```ts
import { CategorySuggestionsCard } from '@/components/finance/category-suggestions-card'
import type { PendingSuggestion } from '@/lib/finance/category-suggestion-queries'
import type { AcceptResult } from '@/lib/finance/category-suggestions/accept'
```
2. Em `SpendingClientProps`: `suggestions: PendingSuggestion[]`; desestruturar `suggestions` no componente.
3. Estado, junto dos outros `useState`:
```ts
  const [prefill, setPrefill] = useState<{ categoryId: string; amountCents: number } | null>(null)
```
4. Handler, antes do `return`:
```ts
  function handleSuggestionAccepted(r: AcceptResult) {
    setCategories((prev) => [...prev, { id: r.categoryId, name: r.name, type: 'expense', color: null, icon: null }])
    setPrefill({ categoryId: r.categoryId, amountCents: r.monthlyAvgCents })
    setShowAdd(true)
  }
```
5. Logo depois de `<MonthNavigator ... />`:
```tsx
      <CategorySuggestionsCard
        suggestions={suggestions}
        parentOptions={categories.filter((c) => c.type === 'expense').map((c) => ({ id: c.id, name: c.name }))}
        onAccepted={handleSuggestionAccepted}
      />
```
6. No `<BudgetEntryDialog>` existente: trocar `onClose={() => setShowAdd(false)}` por `onClose={() => { setShowAdd(false); setPrefill(null) }}` e adicionar `initialCategoryId={prefill?.categoryId}` e `initialAmountCents={prefill?.amountCents}`.

Confirme que `client.tsx` continua abaixo de 500 linhas (`wc -l`).

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm --filter web exec vitest run __tests__/finance && pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add apps/web/components/finance/category-suggestions-card.tsx apps/web/components/finance/accept-suggestion-dialog.tsx apps/web/components/finance/budget-entry-dialog.tsx apps/web/lib/finance/category-suggestion-queries.ts "apps/web/app/(app)/budgets/spending/page.tsx" "apps/web/app/(app)/budgets/spending/client.tsx" apps/web/__tests__/finance/card-de-sugestoes.test.tsx apps/web/__tests__/finance/dialogo-nova-meta-gasto.test.tsx
git commit -m "feat(sugestoes): card de sugestoes na tela de metas"
```

---

### Task 8: Verificação final e migration

- [ ] **Step 1: Suite completa e build**

Run: `pnpm test && pnpm --filter web typecheck && pnpm --filter web build`
Expected: tudo verde. O build é obrigatório: o merge vai direto em master, que é produção.

- [ ] **Step 2: Migration no Supabase**

Não colar SQL pelo terminal (trunca linhas). Abrir `supabase/migrations/00058_category_suggestions.sql` no editor para o usuário copiar para o SQL Editor do Supabase e rodar. Esperar a confirmação dele antes de seguir.

- [ ] **Step 3: Teste real**

Com o app rodando e logado na org que tem dados, abrir `/budgets/spending`, clicar em "Analisar meus gastos", conferir se as sugestões fazem sentido, aceitar uma e checar: a categoria existe, a regra existe em Regras, os lançamentos foram movidos, e o diálogo de meta abriu pré-preenchido. Recusar outra, clicar em analisar de novo e conferir que ela não volta.

- [ ] **Step 4: Ajuste de limites (se preciso)**

Se as sugestões vierem fragmentadas ou demais, ajustar só `SUGGESTION_LIMITS` e as listas de `merchant-key.ts`, com teste para cada caso novo.
