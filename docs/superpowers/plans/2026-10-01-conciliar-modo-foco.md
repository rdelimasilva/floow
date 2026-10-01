# Conciliar em modo foco — Implementation Plan (parte 1: dados e ações)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Este plano tem três arquivos, em ordem: este (Tasks 1–4), `2026-10-01-conciliar-modo-foco-parte-1b.md` (Tasks 5–7) e `2026-10-01-conciliar-modo-foco-parte-2.md` (Tasks 8–11).

**Goal:** Trocar as três seções de `/transactions/conciliar` por uma fila de lançamentos do banco, um por vez, em que cada card mostra os parecidos já lançados para vincular, o repetido e a classificação sugerida.

**Architecture:** Funções puras (`candidatos.ts`, `fila.ts`) decidem candidatas, quem entra e a ordem; `fila-db.ts` lê tudo numa transação RLS reaproveitando as consultas existentes (extraídas para receber `db`); actions novas (`vincular-actions.ts`) gravam reconferindo elegibilidade. A tela (parte 2) é um cliente que consome `ItemDaFila[]`.

**Tech Stack:** Next.js (App Router, server actions), Drizzle + Postgres (Supabase, RLS via `withUserDb`), Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-01-conciliar-modo-foco-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md).
- Textos de tela em pt-BR ("tela", "você"); identificadores seguem o idioma do código vizinho (português).
- Toda leitura de usuário via `withUserDb`/`withUserDbFor`; toda escrita filtra `org_id` (`getDb()` ignora RLS).
- Server action que recusa devolve `{ error: string }` ou flag `false`, nunca lança mensagem que o usuário precise ler (o Next a oculta em prod; ver `lib/mensagem-de-erro.ts`).
- Janela de candidatos: ±10 dias (`JANELA_BUSCA_DIAS`). Teto de valor: 20% do valor do lançamento. Até 3 candidatas. Mesmo sinal de `amountCents` (valores são assinados).
- Lançamento "do banco" = `origem = 'extrato'`. Previsão aberta = `balance_applied = false`, `matched_transaction_id is null`, `is_ignored = false`, `origem <> 'extrato'`.
- Candidatas só para lançamentos do banco dos últimos 90 dias (`JANELA_FILA_DIAS = 90`); repetidos e classificação pendente não têm limite de data.
- Lote da tela: 50 itens (`LOTE_DA_FILA = 50`).
- Trabalhar na branch `conciliar-modo-foco` (criar a partir de `master` antes da Task 1); merge em `master` + push só na Task 11, com o ok do usuário.
- Testes: `cd apps/web && npx vitest run <arquivo>`. Commits só com `git add <arquivos>` (nunca `-A`; há sessões concorrentes) e checando `git branch --show-current` antes.

## Review Focus

1. Previsão que é candidata de dois lançamentos: vincular o primeiro e depois tentar o segundo → a action devolve `efetivada: false`, sem estourar `idx_transactions_matched_unique` (teste na Task 6).
2. Lançamento com classificação pendente que recebe "Não é nenhum" → continua na fila (estado B), não some (teste na Task 5).
3. Contador da faixa de Transações igual ao total da fila, inclusive com lançamento que tem repetido E classificação pendente (contado uma vez) (teste na Task 5).
4. Vincular realizado pendente a previsão de recorrência → realizado sai de `pending` com a categoria da previsão; vincular a previsão de transferência (`aguardaExtrato`) segue `aplicarEfeitoDaAbsorcao` (teste na Task 6).
5. Atalho de teclado com foco no seletor de categoria ou na busca não dispara ação (teste na parte 2, Task 9).

---

### Task 1: Coluna `vinculo_revisado_em`

**Files:**
- Create: `supabase/migrations/00072_vinculo_revisado.sql`
- Modify: `packages/db/src/schema/finance.ts` (bloco `transactions`, depois de `aguardaExtrato`)
- Test: `packages/db/src/__tests__/finance-schema.test.ts`

**Interfaces:** Produces `transactions.vinculoRevisadoEm: timestamp | null` (coluna `vinculo_revisado_em`).

- [ ] **Step 1: Teste falhando** — acrescentar ao fim de `finance-schema.test.ts`:

```ts
describe('transactions.vinculo_revisado_em', () => {
  it('existe, é timestamptz e aceita nulo', () => {
    const col = (transactions as any).vinculoRevisadoEm
    expect(col.name).toBe('vinculo_revisado_em')
    expect(col.notNull).toBe(false)
  })
})
```
(Use os imports já existentes no arquivo; se `transactions` não estiver importado, importe de `../schema/finance`.)

- [ ] **Step 2:** `cd packages/db && npx vitest run src/__tests__/finance-schema.test.ts` → FAIL (`col` undefined).
- [ ] **Step 3: Implementar** — em `finance.ts`, logo após `aguardaExtrato`:

```ts
    /**
     * Quando o usuário disse "não é nenhum" na tela Conciliar: este lançamento
     * do banco não cumpre previsão nenhuma. Tira o item da fila por candidatas
     * (spec 2026-10-01 §5.2); classificação e repetido continuam valendo.
     */
    vinculoRevisadoEm: timestamp('vinculo_revisado_em', { withTimezone: true }),
```

`00072_vinculo_revisado.sql`:

```sql
-- =============================================================================
-- vinculo_revisado_em
-- -----------------------------------------------------------------------------
-- "Não é nenhum" na tela Conciliar: o lançamento do banco foi revisado e não
-- cumpre previsão nenhuma. Nulo = nunca revisado. Aplicar ANTES do deploy (o
-- código novo lê a coluna). Rollback: o código antigo ignora a coluna.
-- Idempotente.
-- Ver docs/superpowers/specs/2026-10-01-conciliar-modo-foco-design.md §6
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS vinculo_revisado_em timestamptz;
```

- [ ] **Step 4:** rodar o teste → PASS. Rodar também `npx vitest run src/__tests__/schema.test.ts` (confere migrations × schema) → PASS.
- [ ] **Step 5: Commit** — `git add supabase/migrations/00072_vinculo_revisado.sql packages/db/src/schema/finance.ts packages/db/src/__tests__/finance-schema.test.ts && git commit -m "feat(conciliar): coluna vinculo_revisado_em"`

---

### Task 2: Consultas existentes aceitam `db`

Extrair o corpo de três consultas para funções que recebem `db: RlsTx`, mantendo as atuais como wrappers. Sem mudança de comportamento; a fila (Task 5) chama as versões com `db` dentro de uma transação só.

**Files:**
- Modify: `apps/web/lib/finance/duplicata-queries.ts`, `apps/web/lib/finance/forecast-match-queries.ts`, `apps/web/lib/openfinance/counterparty-queries.ts`
- Test: os testes existentes delas (`npx vitest run __tests__/finance __tests__/openfinance`)

**Interfaces — Produces:**
- `lerDuplicatasPendentes(db: RlsTx, orgId: string): Promise<DuplicataPendente[]>`
- `lerPropostasPendentes(db: RlsTx, orgId: string): Promise<PropostaPendente[]>`
- `lerGruposPendentes(db: RlsTx, orgId: string): Promise<PendingGroup[]>`
- `export function condicaoDePropostaAprovavel` (hoje privada em `forecast-match-queries.ts`)

- [ ] **Step 1:** Em cada arquivo, mover o corpo do callback de `withUserDb` para a função nova e deixar o wrapper assim (exemplo de duplicatas; repetir o padrão nos outros dois):

```ts
import type { RlsTx } from '@floow/db'

export async function getDuplicatasPendentes(orgId: string): Promise<DuplicataPendente[]> {
  return withUserDb((db) => lerDuplicatasPendentes(db, orgId))
}

/** O corpo de `getDuplicatasPendentes`, para quem já está numa transação RLS (a fila). */
export async function lerDuplicatasPendentes(db: RlsTx, orgId: string): Promise<DuplicataPendente[]> {
  const manter = alias(transactions, 'manter')
  // ...corpo atual, sem alteração...
}
```
`getPropostasPendentes` → `lerPropostasPendentes`; `getPendingCounterpartyGroups` → `lerGruposPendentes`. Em `forecast-match-queries.ts`, trocar `function condicaoDePropostaAprovavel` por `export function condicaoDePropostaAprovavel`.

- [ ] **Step 2:** `cd apps/web && npx vitest run __tests__/finance __tests__/openfinance` → PASS (mesmo resultado de antes; anote falhas pré-existentes rodando o mesmo comando em `git stash` se algo falhar).
- [ ] **Step 3:** `npx tsc --noEmit -p .` → sem erros novos.
- [ ] **Step 4: Commit** — `git add` dos três arquivos; `git commit -m "refactor(conciliar): consultas das filas aceitam db da transação"`

---

### Task 3: Candidatas (função pura)

**Files:**
- Create: `apps/web/lib/finance/conciliacao/candidatos.ts`
- Test: `apps/web/__tests__/finance/candidatos-de-vinculo.test.ts`

**Interfaces — Produces:**

```ts
export const TETO_DIFERENCA_RELATIVA = 0.2
export const MAX_CANDIDATAS = 3
export interface LancamentoDoBanco { id: string; accountId: string; date: string; amountCents: number }
export interface PrevisaoAberta {
  id: string; accountId: string; contaNome: string; date: string; amountCents: number
  description: string; categoriaNome: string | null
}
export interface Candidata extends PrevisaoAberta {
  diasDeDiferenca: number; diferencaCents: number; outraConta: boolean; propostaId: string | null
}
export function escolherCandidatas(
  lancamento: LancamentoDoBanco,
  previsoes: PrevisaoAberta[],
  opcoes?: { proposta?: { id: string; previsaoId: string } | null; recusadas?: Set<string> },
): Candidata[]
```

- [ ] **Step 1: Testes falhando:**

```ts
import { describe, it, expect } from 'vitest'
import { escolherCandidatas, type PrevisaoAberta } from '@/lib/finance/conciliacao/candidatos'

const LANC = { id: 'r1', accountId: 'itau', date: '2026-09-12', amountCents: -150000 }
const prev = (p: Partial<PrevisaoAberta>): PrevisaoAberta => ({
  id: 'p', accountId: 'itau', contaNome: 'Itaú CC', date: '2026-09-10', amountCents: -150000,
  description: 'Aluguel', categoriaNome: 'Aluguel', ...p,
})

describe('escolherCandidatas', () => {
  it('ordena por diferença de valor e depois de dias, até 3', () => {
    const r = escolherCandidatas(LANC, [
      prev({ id: 'a', amountCents: -148000 }),
      prev({ id: 'b', date: '2026-09-15' }),
      prev({ id: 'c' }),
      prev({ id: 'd', amountCents: -140000 }),
    ])
    expect(r.map((c) => c.id)).toEqual(['c', 'b', 'a'])
    expect(r[0]).toMatchObject({ diasDeDiferenca: 2, diferencaCents: 0, outraConta: false, propostaId: null })
  })
  it('fora da janela de 10 dias, de outro sinal ou acima de 20% não entra', () => {
    const r = escolherCandidatas(LANC, [
      prev({ id: 'longe', date: '2026-08-31' }),
      prev({ id: 'sinal', amountCents: 150000 }),
      prev({ id: 'caro', amountCents: -181000 }),
      prev({ id: 'limite', amountCents: -180000, date: '2026-09-22' }),
    ])
    expect(r.map((c) => c.id)).toEqual(['limite'])
  })
  it('só a mesma conta', () => {
    expect(escolherCandidatas(LANC, [prev({ accountId: 'nubank' })])).toEqual([])
  })
  it('par recusado não volta', () => {
    expect(escolherCandidatas(LANC, [prev({ id: 'x' })], { recusadas: new Set(['x']) })).toEqual([])
  })
  it('proposta pendente vira a candidata 1 mesmo pior pontuada', () => {
    const r = escolherCandidatas(LANC, [prev({ id: 'igual' }), prev({ id: 'prop', amountCents: -145000 })], {
      proposta: { id: 'fmp-1', previsaoId: 'prop' },
    })
    expect(r.map((c) => c.id)).toEqual(['prop', 'igual'])
    expect(r[0].propostaId).toBe('fmp-1')
  })
})
```

- [ ] **Step 2:** `npx vitest run __tests__/finance/candidatos-de-vinculo.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar:**

```ts
import { JANELA_BUSCA_DIAS } from '@/lib/finance/forecast-match-db'

/**
 * Quais previsões abertas parecem ser este lançamento do banco. Pura: a
 * consulta mora em `fila-db.ts`. Spec 2026-10-01 §4.
 *
 * Mesma conta, mesmo sinal, ±10 dias, até 20% de diferença. Ordem: valor,
 * depois dias. A proposta que o sync gravou (se houver) é a candidata 1: é o
 * palpite que o motor já fez com regras de descrição que esta pontuação não tem.
 */
export const TETO_DIFERENCA_RELATIVA = 0.2
export const MAX_CANDIDATAS = 3
const DIA_EM_MS = 24 * 60 * 60 * 1000

// (interfaces da seção Interfaces acima)

const dia = (iso: string) => Date.parse(iso.slice(0, 10))

export function escolherCandidatas(
  lancamento: LancamentoDoBanco,
  previsoes: PrevisaoAberta[],
  opcoes: { proposta?: { id: string; previsaoId: string } | null; recusadas?: Set<string> } = {},
): Candidata[] {
  const teto = Math.abs(lancamento.amountCents) * TETO_DIFERENCA_RELATIVA
  const elegiveis = previsoes
    .filter((p) => p.accountId === lancamento.accountId)
    .filter((p) => Math.sign(p.amountCents) === Math.sign(lancamento.amountCents))
    .filter((p) => !opcoes.recusadas?.has(p.id))
    .map((p) => ({
      ...p,
      diasDeDiferenca: Math.round(Math.abs(dia(p.date) - dia(lancamento.date)) / DIA_EM_MS),
      diferencaCents: Math.abs(p.amountCents - lancamento.amountCents),
      outraConta: false,
      propostaId: opcoes.proposta?.previsaoId === p.id ? opcoes.proposta.id : null,
    }))
    .filter((c) => c.diasDeDiferenca <= JANELA_BUSCA_DIAS && c.diferencaCents <= teto)
    .sort((a, b) => a.diferencaCents - b.diferencaCents || a.diasDeDiferenca - b.diasDeDiferenca)

  const daProposta = elegiveis.findIndex((c) => c.propostaId !== null)
  if (daProposta > 0) elegiveis.unshift(...elegiveis.splice(daProposta, 1))
  return elegiveis.slice(0, MAX_CANDIDATAS)
}
```
Em `forecast-match-db.ts`, trocar `const JANELA_BUSCA_DIAS = 10` por `export const JANELA_BUSCA_DIAS = 10`.

- [ ] **Step 4:** teste → PASS.
- [ ] **Step 5: Commit** — `git add apps/web/lib/finance/conciliacao/candidatos.ts apps/web/lib/finance/forecast-match-db.ts apps/web/__tests__/finance/candidatos-de-vinculo.test.ts && git commit -m "feat(conciliar): candidatas de vínculo por valor e data"`

---

### Task 4: Montagem da fila (função pura)

**Files:**
- Create: `apps/web/lib/finance/conciliacao/fila.ts`
- Test: `apps/web/__tests__/finance/fila-do-modo-foco.test.ts`

**Interfaces — Consumes:** `Candidata` (Task 3), `DuplicataPendente`, `PendingGroup`. **Produces:**

```ts
export const LOTE_DA_FILA = 50
export const JANELA_FILA_DIAS = 90
export interface ContaDoItem { id: string; nome: string; tipo: string; instituicao: string | null; agencia: string | null; numero: string | null }
export interface Repetido { propostaId: string; outro: { id: string; date: string; description: string; amountCents: number }; horasEntreEmissoes: number }
export interface Classificacao {
  counterpartyId: string; displayName: string; nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null; suggestionSource: 'historico' | 'claude' | null
  sugestaoContaId: string | null; ehCpfProprio: boolean; outrosNaFila: number
}
export interface ItemDaFila {
  id: string; date: string; description: string; amountCents: number
  cardLastDigits: string | null; importedAt: string | null; conta: ContaDoItem
  candidatas: Candidata[]; repetido: Repetido | null; classificacao: Classificacao | null
}
export interface LancamentoBase extends Omit<ItemDaFila, 'candidatas' | 'repetido' | 'classificacao'> {
  vinculoRevisado: boolean
}
export function montarFila(entrada: {
  lancamentos: Map<string, LancamentoBase>
  candidatas: Map<string, Candidata[]>
  duplicatas: DuplicataPendente[]
  grupos: PendingGroup[]
}): ItemDaFila[]
```

- [ ] **Step 1: Testes falhando** (cobrem §3.1, §3.2 e o item 2/3 do Review Focus):

```ts
import { describe, it, expect } from 'vitest'
import { montarFila, type LancamentoBase } from '@/lib/finance/conciliacao/fila'

const conta = { id: 'itau', nome: 'Itaú CC', tipo: 'checking', instituicao: 'Itaú', agencia: '0123', numero: '4521' }
const base = (id: string, amountCents: number, extra: Partial<LancamentoBase> = {}): LancamentoBase => ({
  id, date: '2026-09-12', description: id, amountCents, cardLastDigits: null, importedAt: null, conta, vinculoRevisado: false, ...extra,
})
const cand = (id: string) => ({ id, accountId: 'itau', contaNome: 'Itaú CC', date: '2026-09-10', amountCents: -1, description: id, categoriaNome: null, diasDeDiferenca: 2, diferencaCents: 0, outraConta: false, propostaId: null })
const grupo = (counterpartyId: string, ids: string[]) => ({
  counterpartyId, displayName: counterpartyId.toUpperCase(), keyType: 'description' as const, count: ids.length, totalCents: 0, ehCpfProprio: false,
  suggestedCategoryId: 'cat-1', suggestionSource: 'historico' as const,
  items: ids.map((id) => ({ id, date: '2026-09-12', description: id, amountCents: -1, accountId: 'itau', type: 'expense' as const, sugestaoContaId: null })),
})
const dup = (duplicataId: string) => ({ id: `d-${duplicataId}`, manter: { id: 'm', date: '2026-09-12', description: 'm', amountCents: -1 }, duplicata: { id: duplicataId, date: '2026-09-12', description: duplicataId, amountCents: -1 }, contaNome: 'Itaú', horasEntreEmissoes: 3 })

describe('montarFila', () => {
  it('sem decisão aberta não entra', () => {
    const fila = montarFila({ lancamentos: new Map([['a', base('a', -100)]]), candidatas: new Map(), duplicatas: [], grupos: [] })
    expect(fila).toEqual([])
  })
  it('candidata entra; revisado sem vínculo só sai se não houver outra decisão', () => {
    const lancamentos = new Map([['a', base('a', -100, { vinculoRevisado: true })], ['b', base('b', -100, { vinculoRevisado: true })], ['c', base('c', -100)]])
    const candidatas = new Map([['a', [cand('p1')]], ['b', [cand('p2')]], ['c', [cand('p3')]]])
    const fila = montarFila({ lancamentos, candidatas, duplicatas: [], grupos: [grupo('net', ['b'])] })
    expect(fila.map((i) => i.id).sort()).toEqual(['b', 'c'])
    expect(fila.find((i) => i.id === 'b')!.candidatas).toEqual([])
  })
  it('repetidos primeiro, depois maior valor absoluto; um item por lançamento', () => {
    const lancamentos = new Map([['peq', base('peq', -100)], ['gde', base('gde', 900000)], ['dup', base('dup', -50)]])
    const fila = montarFila({
      lancamentos, candidatas: new Map([['gde', [cand('p')]]]),
      duplicatas: [dup('dup')], grupos: [grupo('x', ['peq', 'dup'])],
    })
    expect(fila.map((i) => i.id)).toEqual(['dup', 'gde', 'peq'])
    expect(fila[0].repetido?.propostaId).toBe('d-dup')
    expect(fila[0].classificacao).not.toBeNull()
  })
  it('classificação traz sugestão e quantos outros da contraparte estão na fila', () => {
    const lancamentos = new Map([['a', base('a', -1)], ['b', base('b', -1)], ['c', base('c', -1)]])
    const fila = montarFila({ lancamentos, candidatas: new Map(), duplicatas: [], grupos: [grupo('net', ['a', 'b', 'c'])] })
    expect(fila[0].classificacao).toMatchObject({ counterpartyId: 'net', nature: 'expense', categoryId: 'cat-1', outrosNaFila: 2 })
  })
})
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3: Implementar** `fila.ts` (interfaces acima + ):

```ts
/**
 * Quem entra na fila e em que ordem (spec 2026-10-01 §3). Pura; a leitura
 * mora em `fila-db.ts`. Um item por lançamento do banco, com tudo que se
 * decide sobre ele: repetido, candidatas e classificação.
 */
export function montarFila({ lancamentos, candidatas, duplicatas, grupos }: Parametros): ItemDaFila[] {
  const repetidos = new Map(duplicatas.map((d) => [d.duplicata.id, {
    propostaId: d.id, outro: d.manter, horasEntreEmissoes: d.horasEntreEmissoes,
  }]))
  const classificacoes = new Map<string, Classificacao>()
  for (const g of grupos) {
    for (const item of g.items) {
      classificacoes.set(item.id, {
        counterpartyId: g.counterpartyId, displayName: g.displayName,
        nature: item.type ?? 'expense',
        categoryId: item.type === 'transfer' ? null : g.suggestedCategoryId ?? null,
        suggestionSource: g.suggestionSource ?? null,
        sugestaoContaId: item.sugestaoContaId, ehCpfProprio: g.ehCpfProprio,
        outrosNaFila: g.items.length - 1,
      })
    }
  }

  const fila: ItemDaFila[] = []
  for (const [id, { vinculoRevisado, ...l }] of lancamentos) {
    const doItem = vinculoRevisado ? [] : candidatas.get(id) ?? []
    const repetido = repetidos.get(id) ?? null
    const classificacao = classificacoes.get(id) ?? null
    if (!repetido && !classificacao && doItem.length === 0) continue
    fila.push({ ...l, candidatas: doItem, repetido, classificacao })
  }
  return fila.sort(
    (a, b) => Number(!!b.repetido) - Number(!!a.repetido) || Math.abs(b.amountCents) - Math.abs(a.amountCents),
  )
}
```
(`Parametros` é o tipo do argumento declarado na Interface.)

- [ ] **Step 4:** teste → PASS.
- [ ] **Step 5: Commit** — `git add` dos dois arquivos; `git commit -m "feat(conciliar): composição e ordem da fila do modo foco"`

---

Continua na Task 5 em `2026-10-01-conciliar-modo-foco-parte-1b.md`.
