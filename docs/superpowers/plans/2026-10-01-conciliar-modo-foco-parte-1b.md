# Conciliar em modo foco — Implementation Plan (parte 1b: leitura da fila e ações)

> Continuação de `2026-10-01-conciliar-modo-foco.md` (Global Constraints e Review Focus valem aqui). Spec: `docs/superpowers/specs/2026-10-01-conciliar-modo-foco-design.md`.

### Task 5: Leitura da fila e contador

**Files:**
- Create: `apps/web/lib/finance/conciliacao/fila-db.ts`
- Modify: `apps/web/lib/finance/itens-para-conciliar.ts`
- Test: `apps/web/__tests__/finance/itens-para-conciliar.test.ts` (reescrever), `apps/web/__tests__/finance/fila-db.test.ts`

**Interfaces — Consumes:** `lerDuplicatasPendentes`, `lerPropostasPendentes`, `lerGruposPendentes` (Task 2), `escolherCandidatas` (Task 3), `montarFila`, `LOTE_DA_FILA`, `JANELA_FILA_DIAS` (Task 4), `condicaoDeRealizadoSemVinculo` (`forecast-match-db.ts`). **Produces:**

```ts
export async function lerFila(db: RlsTx, orgId: string, hoje?: Date): Promise<ItemDaFila[]>
export async function carregarFila(orgId: string): Promise<{ itens: ItemDaFila[]; total: number }>
export interface ContagemDaFila { repetidos: number; classificar: number; confirmar: number; total: number }
export async function contarFila(orgId: string, userId: string): Promise<ContagemDaFila>
export function contar(fila: ItemDaFila[]): ContagemDaFila
```

- [ ] **Step 1: Teste falhando de `contar`** e do contador (`fila-db.test.ts`):

```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/db/rls', () => ({ withUserDb: vi.fn(), withUserDbFor: vi.fn() }))
vi.mock('@/lib/finance/duplicata-queries', () => ({ lerDuplicatasPendentes: vi.fn() }))
vi.mock('@/lib/finance/forecast-match-queries', () => ({ lerPropostasPendentes: vi.fn() }))
vi.mock('@/lib/openfinance/counterparty-queries', () => ({ lerGruposPendentes: vi.fn() }))
const { contar } = await import('@/lib/finance/conciliacao/fila-db')

const item = (p: Record<string, unknown>) => ({ candidatas: [], repetido: null, classificacao: null, ...p }) as any

describe('contar', () => {
  it('total é de lançamentos distintos; cada tipo conta o seu', () => {
    const c = contar([
      item({ repetido: {}, classificacao: {} }),
      item({ candidatas: [{}] }),
      item({ classificacao: {}, candidatas: [{}] }),
    ])
    expect(c).toEqual({ repetidos: 1, classificar: 2, confirmar: 2, total: 3 })
  })
})
```

Reescrever `itens-para-conciliar.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
const contarFila = vi.fn()
vi.mock('@/lib/finance/conciliacao/fila-db', () => ({ contarFila }))
const { contarItensParaConciliar } = await import('@/lib/finance/itens-para-conciliar')

describe('contarItensParaConciliar', () => {
  it('lê a contagem da fila', async () => {
    contarFila.mockResolvedValue({ repetidos: 1, classificar: 2, confirmar: 1, total: 3 })
    expect(await contarItensParaConciliar('org-1', 'user-1')).toEqual({ repetidos: 1, classificar: 2, confirmar: 1, total: 3 })
  })
  it('sem usuário ou com falha, zero (fail open)', async () => {
    expect((await contarItensParaConciliar('org-1', null)).total).toBe(0)
    contarFila.mockRejectedValue(new Error('x'))
    expect((await contarItensParaConciliar('org-2', 'user-1')).total).toBe(0)
  })
})
```

- [ ] **Step 2:** `npx vitest run __tests__/finance/fila-db.test.ts __tests__/finance/itens-para-conciliar.test.ts` → FAIL.
- [ ] **Step 3: Implementar `fila-db.ts`:**

```ts
import { and, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm'
import { accounts, categories, forecastMatchProposals, openfinanceConnections, openfinanceResources, transactions, type RlsTx } from '@floow/db'
import { withUserDb, withUserDbFor } from '@/lib/db/rls'
import { lerDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { lerPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { lerGruposPendentes } from '@/lib/openfinance/counterparty-queries'
import { condicaoDeRealizadoSemVinculo, JANELA_BUSCA_DIAS } from '@/lib/finance/forecast-match-db'
import { escolherCandidatas, type Candidata } from './candidatos'
import { montarFila, LOTE_DA_FILA, JANELA_FILA_DIAS, type ItemDaFila, type LancamentoBase } from './fila'

/**
 * Lê tudo que a fila do modo foco precisa numa transação RLS só (spec §3, §4).
 * Sequencial de propósito: é uma conexão só.
 */
const DIA_EM_MS = 24 * 60 * 60 * 1000
const iso = (d: Date | string | null) => (d === null ? null : d instanceof Date ? d.toISOString() : String(d))
const diaIso = (d: Date) => d.toISOString().slice(0, 10)

export async function lerFila(db: RlsTx, orgId: string, hoje = new Date()): Promise<ItemDaFila[]> {
  const duplicatas = await lerDuplicatasPendentes(db, orgId)
  const propostas = await lerPropostasPendentes(db, orgId)
  const grupos = await lerGruposPendentes(db, orgId)

  const desde = new Date(hoje.getTime() - JANELA_FILA_DIAS * DIA_EM_MS)
  const recentes = await db
    .select({ id: transactions.id, accountId: transactions.accountId, date: transactions.date, amountCents: transactions.amountCents })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId), eq(transactions.origem, 'extrato'), eq(transactions.isIgnored, false),
      gte(transactions.date, desde), condicaoDeRealizadoSemVinculo(),
    ))

  const previsoes = await db
    .select({
      id: transactions.id, accountId: transactions.accountId, contaNome: accounts.name, date: transactions.date,
      amountCents: transactions.amountCents, description: transactions.description, categoriaNome: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      eq(transactions.orgId, orgId), eq(transactions.balanceApplied, false), isNull(transactions.matchedTransactionId),
      eq(transactions.isIgnored, false), ne(transactions.origem, 'extrato'),
      gte(transactions.date, new Date(desde.getTime() - JANELA_BUSCA_DIAS * DIA_EM_MS)),
      lte(transactions.date, new Date(hoje.getTime() + JANELA_BUSCA_DIAS * DIA_EM_MS)),
    ))
  const abertas = previsoes.map((p) => ({ ...p, date: iso(p.date)! }))

  const recusas = await db
    .select({ previsaoId: forecastMatchProposals.forecastTransactionId, realizadoId: forecastMatchProposals.realizedTransactionId })
    .from(forecastMatchProposals)
    .where(and(eq(forecastMatchProposals.orgId, orgId), eq(forecastMatchProposals.status, 'refused')))
  const recusadasPor = new Map<string, Set<string>>()
  for (const r of recusas) recusadasPor.set(r.realizadoId, (recusadasPor.get(r.realizadoId) ?? new Set()).add(r.previsaoId))
  const propostaPor = new Map(propostas.map((p) => [p.realizado.id, { id: p.id, previsaoId: p.previsao.id }]))

  const candidatas = new Map<string, Candidata[]>()
  for (const r of recentes) {
    const escolhidas = escolherCandidatas({ ...r, date: iso(r.date)! }, abertas, {
      proposta: propostaPor.get(r.id) ?? null, recusadas: recusadasPor.get(r.id),
    })
    if (escolhidas.length > 0) candidatas.set(r.id, escolhidas)
  }

  const ids = [...new Set([
    ...candidatas.keys(), ...duplicatas.map((d) => d.duplicata.id), ...grupos.flatMap((g) => g.items.map((i) => i.id)),
  ])]
  if (ids.length === 0) return []

  const linhas = await db
    .select({
      id: transactions.id, date: transactions.date, description: transactions.description, amountCents: transactions.amountCents,
      cardLastDigits: transactions.cardLastDigits, importedAt: transactions.importedAt, vinculoRevisadoEm: transactions.vinculoRevisadoEm,
      contaId: accounts.id, contaNome: accounts.name, contaTipo: accounts.type, agencia: accounts.branch, numero: accounts.accountNumber,
      instituicao: openfinanceConnections.institutionName,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(openfinanceResources, eq(openfinanceResources.accountId, accounts.id))
    .leftJoin(openfinanceConnections, eq(openfinanceConnections.id, openfinanceResources.connectionId))
    .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, ids)))

  const lancamentos = new Map<string, LancamentoBase>()
  for (const l of linhas) {
    if (lancamentos.has(l.id)) continue // conta com mais de um recurso OF: a primeira linha basta
    lancamentos.set(l.id, {
      id: l.id, date: iso(l.date)!, description: l.description, amountCents: l.amountCents,
      cardLastDigits: l.cardLastDigits, importedAt: iso(l.importedAt), vinculoRevisado: l.vinculoRevisadoEm !== null,
      conta: { id: l.contaId, nome: l.contaNome, tipo: l.contaTipo, instituicao: l.instituicao, agencia: l.agencia, numero: l.numero },
    })
  }
  return montarFila({ lancamentos, candidatas, duplicatas, grupos })
}

export function contar(fila: ItemDaFila[]) {
  return {
    repetidos: fila.filter((i) => i.repetido).length,
    classificar: fila.filter((i) => i.classificacao).length,
    confirmar: fila.filter((i) => i.candidatas.length > 0).length,
    total: fila.length,
  }
}
export type ContagemDaFila = ReturnType<typeof contar>

export async function carregarFila(orgId: string) {
  const fila = await withUserDb((db) => lerFila(db, orgId))
  return { itens: fila.slice(0, LOTE_DA_FILA), total: fila.length }
}

export async function contarFila(orgId: string, userId: string): Promise<ContagemDaFila> {
  return contar(await withUserDbFor(userId, (db) => lerFila(db, orgId)))
}
```

`itens-para-conciliar.ts` — trocar o corpo de `contarItensParaConciliar` (mantendo `cache`, o docblock e a interface):

```ts
import { contarFila } from '@/lib/finance/conciliacao/fila-db'
const ZERO: ItensParaConciliar = { repetidos: 0, classificar: 0, confirmar: 0, total: 0 }
export const contarItensParaConciliar = cache(
  async (orgId: string, userId: string | null): Promise<ItensParaConciliar> =>
    userId === null ? ZERO : contarFila(orgId, userId).catch(() => ZERO),
)
```
Atualizar o docblock: "`total` é de lançamentos distintos na fila do modo foco (spec 2026-10-01 §3.3)".

- [ ] **Step 4:** testes → PASS; `npx vitest run __tests__/finance` → sem regressão nova; `npx tsc --noEmit -p .` limpo.
- [ ] **Step 5: Commit** — `git add` de `fila-db.ts`, `itens-para-conciliar.ts` e os dois testes; `git commit -m "feat(conciliar): leitura da fila e contador por lançamento"`

---

### Task 6: `vincularPrevisao` (e `aprovarProposta` delegando)

**Files:**
- Create: `apps/web/lib/finance/conciliacao/vincular-db.ts`, `apps/web/lib/finance/conciliacao/vincular-actions.ts`
- Modify: `apps/web/lib/finance/forecast-match-actions.ts` (`aprovarProposta`)
- Test: `apps/web/__tests__/finance/vincular-previsao.test.ts`; `__tests__/finance/aprovar-e-recusar-conciliacao.test.ts` deve continuar passando

**Interfaces — Produces:**
- `vincularNoBanco(tx: Db, orgId: string, realizadoId: string, previsaoId: string): Promise<boolean>`
- `'use server' vincularPrevisao(realizadoId: string, previsaoId: string): Promise<{ efetivada: boolean }>`

- [ ] **Step 1: Teste falhando** — copiar o arnês de mock de `aprovar-e-recusar-conciliacao.test.ts` (o `ops`, `selectQueue`, `chain`, `tx` e os `vi.mock` de `@floow/db`, `queries`, `revalidate`; acrescentar `vi.mock('@/lib/finance/conciliacao/absorver', () => ({ aplicarEfeitoDaAbsorcao: vi.fn() }))` e `vi.mock('@/lib/db/rls', () => ({ withUserDb: vi.fn() }))` — a Task 7 faz `vincular-actions.ts` importar o RLS) e escrever:

```ts
const { vincularPrevisao } = await import('@/lib/finance/conciliacao/vincular-actions')
const { aplicarEfeitoDaAbsorcao } = await import('@/lib/finance/conciliacao/absorver')

const PREV = { id: 'prev-1', matchedTransactionId: null, balanceApplied: false, isIgnored: false, aguardaExtrato: false, type: 'expense', categoryId: 'cat-9', origem: 'recorrencia' }
const REAL = { id: 'real-1', matchedTransactionId: null, balanceApplied: true, isIgnored: false, reviewState: 'pending', origem: 'extrato' }

describe('vincularPrevisao', () => {
  it('grava o vínculo, herda a categoria da previsão e decide as propostas', async () => {
    selectQueue.push([PREV, REAL], [])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: true })
    const updates = ops.filter((o) => o.op.startsWith('update'))
    expect(updates[0]).toMatchObject({ op: 'update:transactions', payload: { matchedTransactionId: 'real-1' } })
    expect(updates[1]).toMatchObject({ op: 'update:transactions', payload: { type: 'expense', categoryId: 'cat-9', reviewState: 'confirmed' } })
    expect(updates.filter((o) => o.op === 'update:forecast_match_proposals')).toHaveLength(2)
  })
  it('previsão de transferência que aguarda extrato segue o efeito da absorção', async () => {
    selectQueue.push([{ ...PREV, aguardaExtrato: true, type: 'transfer', categoryId: null }, REAL], [])
    await vincularPrevisao('real-1', 'prev-1')
    expect(aplicarEfeitoDaAbsorcao).toHaveBeenCalled()
  })
  it.each([
    ['previsão já vinculada', [{ ...PREV, matchedTransactionId: 'outro' }, REAL], []],
    ['previsão já no saldo', [{ ...PREV, balanceApplied: true }, REAL], []],
    ['realizado ignorado', [PREV, { ...REAL, isIgnored: true }], []],
    ['realizado já reivindicado por outra previsão', [PREV, REAL], [{ id: 'prev-2' }]],
    ['ponta de outra org (não volta)', [REAL], []],
  ])('%s → efetivada false, nada gravado', async (_, pontas, reivindicado) => {
    selectQueue.push(pontas as unknown[], reivindicado as unknown[])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: false })
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })
})
```
(No `beforeEach`: limpar `ops`, `selectQueue` e `vi.clearAllMocks()`.)

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3: Implementar `vincular-db.ts`:**

```ts
import { getDb, transactions, forecastMatchProposals } from '@floow/db'
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { aplicarEfeitoDaAbsorcao } from './absorver'
import { condicaoDaTransacaoDaOrg } from '@/lib/finance/forecast-match-db'

type Db = ReturnType<typeof getDb>

/**
 * O vínculo previsão → lançamento do banco, com ou sem proposta prévia
 * (spec 2026-10-01 §5.1). Único gravador de `matched_transaction_id` fora do
 * motor R1. Reconfere as duas pontas: a tela é renderizada e o clique chega
 * depois — ver o docblock de `aprovarProposta` para o porquê de cada checagem.
 * Devolve `false` sem gravar nada quando o par deixou de valer.
 */
export async function vincularNoBanco(tx: Db, orgId: string, realizadoId: string, previsaoId: string): Promise<boolean> {
  const pontas = await tx
    .select({
      id: transactions.id, matchedTransactionId: transactions.matchedTransactionId, balanceApplied: transactions.balanceApplied,
      isIgnored: transactions.isIgnored, externalId: transactions.externalId, transferAccountId: transactions.transferAccountId,
      aguardaExtrato: transactions.aguardaExtrato, origem: transactions.origem, categoryId: transactions.categoryId,
      description: transactions.description, transferGroupId: transactions.transferGroupId, type: transactions.type,
      reviewState: transactions.reviewState,
    })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, [previsaoId, realizadoId])))

  const previsao = pontas.find((p) => p.id === previsaoId)
  const realizado = pontas.find((p) => p.id === realizadoId)
  if (!previsao || !realizado) return false
  if (previsao.matchedTransactionId || previsao.balanceApplied || previsao.isIgnored || previsao.origem === 'extrato') return false
  if (realizado.isIgnored) return false

  // Realizado que outra previsão já reivindicou: o índice único da 00042
  // estouraria no UPDATE. Melhor dizer "não vale mais" que lançar.
  const [reivindicado] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.matchedTransactionId, realizadoId)))
    .limit(1)
  if (reivindicado) return false

  await tx.update(transactions).set({ matchedTransactionId: realizadoId }).where(condicaoDaTransacaoDaOrg(previsaoId, orgId))

  if (previsao.aguardaExtrato) {
    await aplicarEfeitoDaAbsorcao(tx, orgId, previsao, realizadoId)
  } else if (realizado.reviewState === 'pending' && previsao.type !== 'transfer' && previsao.categoryId) {
    // A previsão já diz o que o dinheiro é: o card não pede classificação.
    await tx.update(transactions)
      .set({ type: previsao.type, categoryId: previsao.categoryId, reviewState: 'confirmed' })
      .where(condicaoDaTransacaoDaOrg(realizadoId, orgId))
  }

  const pendente = and(eq(forecastMatchProposals.orgId, orgId), eq(forecastMatchProposals.status, 'pending'))
  const doPar = and(eq(forecastMatchProposals.forecastTransactionId, previsaoId), eq(forecastMatchProposals.realizedTransactionId, realizadoId))
  await tx.update(forecastMatchProposals).set({ status: 'approved', decidedAt: new Date() }).where(and(pendente, doPar))
  await tx.update(forecastMatchProposals).set({ status: 'refused', decidedAt: new Date() }).where(and(
    pendente,
    or(eq(forecastMatchProposals.forecastTransactionId, previsaoId), eq(forecastMatchProposals.realizedTransactionId, realizadoId)),
    or(ne(forecastMatchProposals.forecastTransactionId, previsaoId), ne(forecastMatchProposals.realizedTransactionId, realizadoId)),
  ))
  return true
}
```

`vincular-actions.ts` (as Tasks 7 acrescentam mais actions aqui):

```ts
'use server'

import { getDb } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { revalidateTransactionData } from '@/lib/finance/revalidate'
import { vincularNoBanco } from './vincular-db'

type Db = ReturnType<typeof getDb>

/** "Vincular" do card (spec §5.1). `false` = o par deixou de valer; a tela tira o card e avisa. */
export async function vincularPrevisao(realizadoId: string, previsaoId: string): Promise<{ efetivada: boolean }> {
  const orgId = await getOrgId()
  const efetivada = await getDb().transaction((tx) => vincularNoBanco(tx as unknown as Db, orgId, realizadoId, previsaoId))
  if (efetivada) revalidateTransactionData(orgId)
  return { efetivada }
}
```

Em `forecast-match-actions.ts`, dentro de `aprovarProposta`, substituir tudo depois de `if (!proposta) return false` até o `return true` por:

```ts
    return vincularNoBanco(tx as unknown as Db, orgId, proposta.realizedTransactionId, proposta.forecastTransactionId)
```
e importar `vincularNoBanco` de `./conciliacao/vincular-db` (remover imports que ficarem sem uso). Manter o docblock, acrescentando: "O vínculo em si mora em `vincularNoBanco`, compartilhado com o card do modo foco."

- [ ] **Step 4:** `npx vitest run __tests__/finance/vincular-previsao.test.ts __tests__/finance/aprovar-e-recusar-conciliacao.test.ts` → PASS. Se o teste antigo de aprovar checar exatamente 2 updates, ajuste a contagem esperada para os updates de `forecast_match_proposals` (agora 2: aprovar o par e recusar concorrentes) — a asserção de vínculo e de status `approved` tem de continuar.
- [ ] **Step 5: Commit** — `git add` dos arquivos tocados; `git commit -m "feat(conciliar): vincular previsão sem proposta prévia"`

---

### Task 7: "Não é nenhum", "classificar só este" e "procurar previsão"

**Files:**
- Modify: `apps/web/lib/finance/conciliacao/vincular-actions.ts`
- Test: `apps/web/__tests__/finance/acoes-do-card.test.ts`

**Interfaces — Produces:**
- `marcarSemVinculo(realizadoId: string): Promise<{ ok: boolean }>`
- `classificarSoEste(input: { transactionId: string; counterpartyId: string; nature: 'income' | 'expense' | 'transfer'; categoryId: string | null; transferAccountId: string | null }): Promise<{ ok: true } | { error: string }>`
- `procurarPrevisoes(realizadoId: string, termo: string): Promise<Candidata[]>` (até 10, todas as contas, `outraConta` preenchido)

- [ ] **Step 1: Testes falhando** (mesmo arnês de mock da Task 6, mais `vi.mock('@/lib/openfinance/aplicar-regra', () => ({ aplicarDecisaoAosPendentes: vi.fn().mockResolvedValue(1) }))`, `vi.mock('@/lib/finance/account-actions', () => ({ assertAccountOwnership: vi.fn() }))`, `vi.mock('@/lib/finance/conciliacao/conciliar-conta', () => ({ conciliarContas: vi.fn() }))`, `vi.mock('@/lib/cache-tags', () => ({ accountsTag: () => 't', invalidateTag: vi.fn() }))`):

```ts
const { marcarSemVinculo, classificarSoEste } = await import('@/lib/finance/conciliacao/vincular-actions')
const { aplicarDecisaoAosPendentes } = await import('@/lib/openfinance/aplicar-regra')

describe('marcarSemVinculo', () => {
  it('grava vinculo_revisado_em e recusa as propostas pendentes do lançamento', async () => {
    expect(await marcarSemVinculo('real-1')).toEqual({ ok: true })
    expect(ops[0]).toMatchObject({ op: 'update:transactions' })
    expect(ops[0].payload!.vinculoRevisadoEm).toBeInstanceOf(Date)
    expect(ops[1]).toMatchObject({ op: 'update:forecast_match_proposals', payload: { status: 'refused' } })
  })
})

describe('classificarSoEste', () => {
  it('aplica só a este lançamento e não grava regra na contraparte', async () => {
    const r = await classificarSoEste({ transactionId: '00000000-0000-4000-8000-000000000001', counterpartyId: '00000000-0000-4000-8000-000000000002', nature: 'expense', categoryId: '00000000-0000-4000-8000-000000000003', transferAccountId: null })
    expect(r).toEqual({ ok: true })
    expect(vi.mocked(aplicarDecisaoAosPendentes).mock.calls[0][4]).toEqual(['00000000-0000-4000-8000-000000000001'])
    expect(ops.some((o) => o.op === 'update:counterparties')).toBe(false)
  })
  it('natureza incoerente com o destino devolve { error }', async () => {
    const r = await classificarSoEste({ transactionId: '00000000-0000-4000-8000-000000000001', counterpartyId: '00000000-0000-4000-8000-000000000002', nature: 'transfer', categoryId: null, transferAccountId: null })
    expect(r).toHaveProperty('error')
  })
  it('nada pendente para classificar devolve { error }', async () => {
    vi.mocked(aplicarDecisaoAosPendentes).mockResolvedValueOnce(0)
    const r = await classificarSoEste({ transactionId: '00000000-0000-4000-8000-000000000001', counterpartyId: '00000000-0000-4000-8000-000000000002', nature: 'expense', categoryId: '00000000-0000-4000-8000-000000000003', transferAccountId: null })
    expect(r).toEqual({ error: 'Este lançamento já foi classificado. A fila foi atualizada.' })
  })
})
```
(Acrescentar `counterparties: { _: { name: 'counterparties' } }` ao mock de `@floow/db`.)

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3: Implementar** — acrescentar a `vincular-actions.ts` (imports de `counterparty-actions.ts`: `z`, `assertAccountOwnership`, `revalidateSnapshotData`, `accountsTag`, `invalidateTag`, `conciliarContas`, `aplicarDecisaoAosPendentes`; mais `transactions`, `forecastMatchProposals`, `accounts`, `categories` de `@floow/db`, `and`, `eq`, `ilike`, `isNull`, `ne`, `or`, `sql` de `drizzle-orm`, `withUserDb`):

```ts
/** "Não é nenhum" (spec §5.2): o lançamento não cumpre previsão nenhuma. */
export async function marcarSemVinculo(realizadoId: string): Promise<{ ok: boolean }> {
  const orgId = await getOrgId()
  await getDb().transaction(async (tx) => {
    await tx.update(transactions).set({ vinculoRevisadoEm: new Date() })
      .where(and(eq(transactions.id, realizadoId), eq(transactions.orgId, orgId)))
    await tx.update(forecastMatchProposals).set({ status: 'refused', decidedAt: new Date() })
      .where(and(eq(forecastMatchProposals.orgId, orgId), eq(forecastMatchProposals.status, 'pending'), eq(forecastMatchProposals.realizedTransactionId, realizadoId)))
  })
  revalidateTransactionData(orgId)
  return { ok: true }
}

const soEsteSchema = z.object({
  transactionId: z.string().uuid(), counterpartyId: z.string().uuid(),
  nature: z.enum(['income', 'expense', 'transfer']),
  categoryId: z.string().uuid().nullable(), transferAccountId: z.string().uuid().nullable(),
}).refine((v) => (v.nature === 'transfer' ? v.categoryId === null && v.transferAccountId !== null : v.categoryId !== null && v.transferAccountId === null))

/**
 * Classificar com "fazer igual daqui pra frente" desmarcado (spec §5.4): o
 * mesmo caminho de `confirmCounterparty`, restrito a este lançamento e sem
 * gravar a regra na contraparte — o próximo lançamento dela volta para a fila.
 */
export async function classificarSoEste(raw: z.input<typeof soEsteSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = soEsteSchema.safeParse(raw)
  if (!parsed.success) return { error: 'Transferência exige a outra conta; receita e despesa exigem categoria.' }
  const input = parsed.data
  const orgId = await getOrgId()
  const db = getDb()
  const contasParaConciliar = new Set<string>()

  const aplicados = await db.transaction(async (tx) => {
    if (input.transferAccountId) await assertAccountOwnership(tx as unknown as Db, input.transferAccountId, orgId)
    return aplicarDecisaoAosPendentes(
      tx as unknown as Db, orgId,
      { counterpartyId: input.counterpartyId, nature: input.nature, categoryId: input.categoryId, transferAccountId: input.transferAccountId, exceptions: [] },
      contasParaConciliar, [input.transactionId],
    )
  })
  if (aplicados === 0) return { error: 'Este lançamento já foi classificado. A fila foi atualizada.' }

  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)
  await conciliarContas(db, orgId, contasParaConciliar, '[classificarSoEste]')
  revalidateTransactionData(orgId)
  return { ok: true }
}

/** "Procurar previsão" (spec §2.4): todas as contas, por descrição ou valor. */
export async function procurarPrevisoes(realizadoId: string, termo: string): Promise<Candidata[]> {
  const orgId = await getOrgId()
  const t = termo.trim()
  if (t.length < 2) return []
  const centavos = Math.round(Number(t.replace(/\./g, '').replace(',', '.')) * 100)
  return withUserDb(async (db) => {
    const [real] = await db.select({ accountId: transactions.accountId, date: transactions.date, amountCents: transactions.amountCents })
      .from(transactions).where(and(eq(transactions.id, realizadoId), eq(transactions.orgId, orgId))).limit(1)
    if (!real) return []
    const filtroTermo = Number.isFinite(centavos) && centavos !== 0
      ? sql`abs(${transactions.amountCents}) = ${Math.abs(centavos)}`
      : ilike(transactions.description, `%${t}%`)
    const rows = await db.select({
      id: transactions.id, accountId: transactions.accountId, contaNome: accounts.name, date: transactions.date,
      amountCents: transactions.amountCents, description: transactions.description, categoriaNome: categories.name,
    })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(
        eq(transactions.orgId, orgId), eq(transactions.balanceApplied, false), isNull(transactions.matchedTransactionId),
        eq(transactions.isIgnored, false), ne(transactions.origem, 'extrato'), filtroTermo,
      ))
      .orderBy(sql`abs(${transactions.date} - ${real.date}::date)`)
      .limit(10)
    const dia = (d: Date | string) => Date.parse(String(d instanceof Date ? d.toISOString() : d).slice(0, 10))
    return rows.map((p) => ({
      ...p, date: p.date instanceof Date ? p.date.toISOString() : String(p.date),
      diasDeDiferenca: Math.round(Math.abs(dia(p.date) - dia(real.date)) / 86_400_000),
      diferencaCents: Math.abs(p.amountCents - real.amountCents),
      outraConta: p.accountId !== real.accountId, propostaId: null,
    }))
  })
}
```
(Importar `type Candidata` de `./candidatos`.) Teste extra para `procurarPrevisoes` não é exigido aqui (consulta pura de leitura, coberta na verificação com banco real da parte 2, Task 11).

- [ ] **Step 4:** testes → PASS; `npx tsc --noEmit -p .` limpo; `wc -l lib/finance/conciliacao/vincular-actions.ts` < 500.
- [ ] **Step 5: Commit** — `git add` dos dois arquivos; `git commit -m "feat(conciliar): não é nenhum, classificar só este e busca de previsão"`

---

Continua na parte 2: `2026-10-01-conciliar-modo-foco-parte-2.md`.
