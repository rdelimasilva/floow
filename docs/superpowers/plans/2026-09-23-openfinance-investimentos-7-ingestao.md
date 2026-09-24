# Parte 7 — Ingestão

Índice e restrições globais: `2026-09-23-openfinance-investimentos.md`. Depende das Partes 1–6.

### Task 9: Orquestração da ingestão

**Files:**
- Modify: `apps/web/lib/openfinance/normalize-batch.ts` (genérico no tipo de saída)
- Create: `apps/web/lib/openfinance/investimentos/sincronizar.ts`
- Test: `apps/web/__tests__/openfinance/investimentos/sincronizar.test.ts`

**Interfaces:**
- Consumes: `RepositorioDeInvestimentos`, `janelaDeMovimentacoes` (T8); `PolpClient.streamInvestments/streamInvestmentTransactions` (T4); normalizadores (T6, T7).
- Produces:

```ts
export interface ResumoDeInvestimentos {
  ativos: number
  posicoes: number
  movimentacoes: number
  conflitos: number
  rejeitados: number
  tiposComFalha: PolpInvestmentKind[]
}
export async function sincronizarInvestimentos(
  repo: RepositorioDeInvestimentos,
  client: Pick<PolpClient, 'streamInvestments' | 'streamInvestmentTransactions'>,
  conexao: { id: string; orgId: string; polpConsentId: string; institutionName: string | null; products: string[] },
): Promise<ResumoDeInvestimentos>
```

- [ ] **Step 1: Generalizar `normalizeBatch`**

Troque a assinatura mantendo o default, para não mexer em quem já usa:

```ts
export interface BatchResult<R = NormalizedPolpTransaction> {
  ok: R[]
  rejected: RejectedItem[]
}

export function normalizeBatch<T, R = NormalizedPolpTransaction>(
  items: T[],
  normalize: (item: T) => R,
): BatchResult<R> {
  const ok: R[] = []
```

Run: `pnpm --filter web test -- normalize-batch` → PASS.

- [ ] **Step 2: Testes que falham**

Repositório em memória que respeita as mesmas chaves únicas do banco — é ele que prova a idempotência (Review Focus 3) e o conflito (Review Focus 2):

```ts
import { describe, it, expect } from 'vitest'
import type { PolpInvestmentKind } from '@floow/core-finance'
import type { RepositorioDeInvestimentos, ProblemaDeIngestao } from '@/lib/openfinance/investimentos/repositorio'
import { sincronizarInvestimentos } from '@/lib/openfinance/investimentos/sincronizar'

function repoEmMemoria(donoDe: Record<string, string> = {}) {
  const ativos = new Map<string, string>()          // polpId -> assetId
  const posicoes = new Map<string, unknown>()       // assetId|data
  const eventos = new Map<string, { assetId: string; eventDate: string }>() // polpTxId
  const problemas: ProblemaDeIngestao[] = []
  let recalculos = 0
  const repo: RepositorioDeInvestimentos = {
    garantirConta: async () => 'conta-inv',
    salvarInvestimento: async (ctx, inv) => {
      if (donoDe[inv.polpId] && donoDe[inv.polpId] !== ctx.orgId) return { tipo: 'conflito' }
      const assetId = ativos.get(inv.polpId) ?? `asset-${inv.polpId}`
      ativos.set(inv.polpId, assetId)
      if (inv.position) posicoes.set(`${assetId}|${inv.position.referenceDate}`, inv.position)
      return { tipo: 'salvo', assetId, resourceId: `res-${inv.polpId}` }
    },
    ultimaDataDeMovimentacao: async (assetId) => {
      const datas = [...eventos.values()].filter((e) => e.assetId === assetId).map((e) => e.eventDate).sort()
      return datas.at(-1) ?? null
    },
    salvarMovimentacoes: async (ctx, evs) => {
      for (const e of evs) eventos.set(e.polpTransactionId, { assetId: ctx.assetId, eventDate: e.eventDate })
      return evs.length
    },
    registrarProblemas: async (_org, ps) => { problemas.push(...ps) },
    recalcularPosicoes: async () => { recalculos++ },
  }
  return { repo, ativos, posicoes, eventos, problemas, recalculos: () => recalculos }
}

const money = (amount: string) => ({ amount, currency: 'BRL' })
const fundo = (id: string) => ({
  id, name: `Fundo ${id}`, cnpj_number: '1',
  balance: { reference_date: '2026-09-22', quota_quantity: '10', gross_amount: money('100.00'), net_amount: money('95.00') },
})
const aplicacao = (id: string, data = '2026-09-01') => ({
  id, transaction_type: 'APLICACAO', transaction_conversion_date: data, transaction_quota_quantity: '10', transaction_value: money('100.00'),
})

function clienteFalso(
  porTipo: Partial<Record<PolpInvestmentKind, unknown[] | Error>>,
  movs: Record<string, unknown[]> = {},
  chamadas: Array<{ id: string; query: unknown }> = [],
) {
  return {
    async *streamInvestments(_c: string, kind: PolpInvestmentKind) {
      const v = porTipo[kind]
      if (v instanceof Error) throw v
      if (v) yield v
    },
    async *streamInvestmentTransactions(_k: PolpInvestmentKind, id: string, query?: unknown) {
      chamadas.push({ id, query })
      if (movs[id]) yield movs[id]
    },
  }
}

const CONEXAO = { id: 'c1', orgId: 'org-a', polpConsentId: 'consent-1', institutionName: 'Banco X', products: ['ACCOUNT', 'INVESTMENTS'] }

describe('sincronizarInvestimentos', () => {
  it('conexão sem INVESTMENTS não chama a Polp', async () => {
    const m = repoEmMemoria()
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: new Error('não devia chamar') }), { ...CONEXAO, products: ['ACCOUNT'] })
    expect(r.ativos).toBe(0)
    expect(r.tiposComFalha).toEqual([])
  })

  it('grava ativo, posição e movimentações, e recalcula uma vez', async () => {
    const m = repoEmMemoria()
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }, { f1: [aplicacao('t1')] }), CONEXAO)
    expect(r).toMatchObject({ ativos: 1, posicoes: 1, movimentacoes: 1, conflitos: 0, rejeitados: 0 })
    expect(m.recalculos()).toBe(1)
  })

  it('rodar duas vezes no mesmo dia não duplica nada', async () => {
    const m = repoEmMemoria()
    const cliente = () => clienteFalso({ FUND: [fundo('f1')] }, { f1: [aplicacao('t1')] })
    await sincronizarInvestimentos(m.repo, cliente(), CONEXAO)
    await sincronizarInvestimentos(m.repo, cliente(), CONEXAO)
    expect(m.ativos.size).toBe(1)
    expect(m.posicoes.size).toBe(1)
    expect(m.eventos.size).toBe(1)
  })

  it('segunda passada pede movimentações a partir da última data menos 7 dias', async () => {
    const m = repoEmMemoria()
    const chamadas: Array<{ id: string; query: unknown }> = []
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }, { f1: [aplicacao('t1', '2026-09-20')] }, chamadas), CONEXAO)
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }, {}, chamadas), CONEXAO)
    expect(chamadas[0].query).toEqual({})
    expect(chamadas[1].query).toEqual({ fromDate: '2026-09-13T00:00:00Z' })
  })

  it('investimento de outra org: pula, conta conflito, registra problema', async () => {
    const m = repoEmMemoria({ f1: 'org-b' })
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }, { f1: [aplicacao('t1')] }), CONEXAO)
    expect(r.conflitos).toBe(1)
    expect(m.eventos.size).toBe(0)
    expect(m.problemas[0].reason).toMatch(/outra org/)
  })

  it('falha num tipo não impede os outros', async () => {
    const m = repoEmMemoria()
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ BANK_FIXED_INCOME: new Error('503'), FUND: [fundo('f1')] }), CONEXAO)
    expect(r.tiposComFalha).toEqual(['BANK_FIXED_INCOME'])
    expect(r.ativos).toBe(1)
    expect(m.problemas.some((p) => /BANK_FIXED_INCOME/.test(p.reason))).toBe(true)
  })

  it('item ilegível e tipo de movimentação novo viram problema, o resto entra', async () => {
    const m = repoEmMemoria()
    const r = await sincronizarInvestimentos(
      m.repo,
      clienteFalso({ FUND: [fundo('f1'), { name: 'sem id' }] }, { f1: [aplicacao('t1'), { ...aplicacao('t2'), transaction_type: 'BONIFICACAO' }] }),
      CONEXAO,
    )
    expect(r.ativos).toBe(1)
    expect(r.rejeitados).toBe(1)
    expect(r.movimentacoes).toBe(2)
    expect(m.problemas.some((p) => /BONIFICACAO/.test(p.reason))).toBe(true)
  })

  it('ativo que sumiu da listagem não é tocado', async () => {
    const m = repoEmMemoria()
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }), CONEXAO)
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [] }), CONEXAO)
    expect(m.ativos.has('f1')).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter web test -- investimentos/sincronizar`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar `sincronizar.ts`**

```ts
/**
 * Ingestão de investimentos de uma conexão.
 *
 * Duas passadas por tipo: a listagem por consentimento (que já traz a
 * posição — a rota de detalhe, limitada a 30 req/min, nunca é usada) e as
 * movimentações de cada investimento. Falha é isolada no menor pedaço
 * possível: um tipo fora do ar não derruba os outros, um item ilegível não
 * derruba a página. Tudo que não entrou vira problema com payload cru.
 *
 * D3 da spec: nada aqui cria lançamento. O dinheiro já chega pelo extrato.
 */
import {
  POLP_INVESTMENT_KINDS, normalizeInvestment, normalizeInvestmentTransaction,
  type PolpClient, type PolpInvestmentKind,
} from '@floow/core-finance'
import { normalizeBatch } from '../normalize-batch'
import type { ProblemaDeIngestao, RepositorioDeInvestimentos } from './repositorio'
import { janelaDeMovimentacoes } from './vinculo'

// (interface ResumoDeInvestimentos da seção "Produces")

export async function sincronizarInvestimentos(
  repo: RepositorioDeInvestimentos,
  client: Pick<PolpClient, 'streamInvestments' | 'streamInvestmentTransactions'>,
  conexao: { id: string; orgId: string; polpConsentId: string; institutionName: string | null; products: string[] },
): Promise<ResumoDeInvestimentos> {
  const resumo: ResumoDeInvestimentos = { ativos: 0, posicoes: 0, movimentacoes: 0, conflitos: 0, rejeitados: 0, tiposComFalha: [] }
  if (!conexao.products.includes('INVESTMENTS')) return resumo

  const { orgId } = conexao
  const accountId = await repo.garantirConta(conexao)
  const problemas: ProblemaDeIngestao[] = []
  const salvos: Array<{ kind: PolpInvestmentKind; polpId: string; assetId: string; resourceId: string }> = []

  for (const kind of POLP_INVESTMENT_KINDS) {
    try {
      for await (const page of client.streamInvestments(conexao.polpConsentId, kind)) {
        const { ok, rejected } = normalizeBatch(page, (raw) => normalizeInvestment(kind, raw))
        resumo.rejeitados += rejected.length
        problemas.push(...rejected.map((r) => ({ resourceId: null, externalId: r.externalId, reason: `${kind}: ${r.reason}`, payload: r.raw })))

        for (const inv of ok) {
          const salvo = await repo.salvarInvestimento({ orgId, connectionId: conexao.id }, inv)
          if (salvo.tipo === 'conflito') {
            resumo.conflitos++
            problemas.push({ resourceId: null, externalId: inv.polpId, reason: `${kind}: investimento pertence a outra org`, payload: { polpId: inv.polpId } })
            continue
          }
          resumo.ativos++
          if (inv.position) resumo.posicoes++
          salvos.push({ kind, polpId: inv.polpId, assetId: salvo.assetId, resourceId: salvo.resourceId })
        }
      }
    } catch (error) {
      resumo.tiposComFalha.push(kind)
      problemas.push({ resourceId: null, externalId: null, reason: `falha ao listar ${kind}: ${mensagem(error)}`, payload: {} })
    }
  }

  for (const s of salvos) {
    try {
      const query = janelaDeMovimentacoes(await repo.ultimaDataDeMovimentacao(s.assetId))
      for await (const page of client.streamInvestmentTransactions(s.kind, s.polpId, query)) {
        const { ok, rejected } = normalizeBatch(page, normalizeInvestmentTransaction)
        resumo.rejeitados += rejected.length
        problemas.push(...rejected.map((r) => ({ resourceId: s.resourceId, externalId: r.externalId, reason: r.reason, payload: r.raw })))
        for (const e of ok) {
          if (e.unknownType) {
            problemas.push({ resourceId: s.resourceId, externalId: e.polpTransactionId, reason: `tipo de movimentação desconhecido: ${e.unknownType}`, payload: e })
          }
        }
        resumo.movimentacoes += await repo.salvarMovimentacoes({ orgId, accountId, assetId: s.assetId }, ok)
      }
    } catch (error) {
      problemas.push({ resourceId: s.resourceId, externalId: null, reason: `falha nas movimentações de ${s.kind}: ${mensagem(error)}`, payload: {} })
    }
  }

  await repo.registrarProblemas(orgId, problemas)
  await repo.recalcularPosicoes(orgId)
  return resumo
}

function mensagem(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter web test -- investimentos && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/openfinance/normalize-batch.ts apps/web/lib/openfinance/investimentos/sincronizar.ts apps/web/__tests__/openfinance/investimentos/sincronizar.test.ts
git commit -m "feat(openfinance): ingestao de investimentos com falha isolada por tipo"
```

---

### Task 10: Ligar no cron, no botão e tirar investimento das telas de conta

**Files:**
- Create: `apps/web/lib/openfinance/sincronizar-conexao.ts`
- Modify: `apps/web/lib/openfinance/sync.ts` (filtro de recursos)
- Modify: `apps/web/lib/openfinance/importacao-agendada.ts`
- Modify: `apps/web/lib/openfinance/connection-actions.ts` (**494 linhas — o saldo final não pode passar de 500**)
- Modify: `apps/web/lib/openfinance/queries.ts`
- Test: `apps/web/__tests__/openfinance/recursos-de-conta.test.ts`

**Interfaces:**
- Consumes: `sincronizarInvestimentos`, `criarRepositorio`, `ResumoDeInvestimentos`.
- Produces:
  - `recursosDeConta<T extends { resourceType: string }>(rs: T[]): T[]` (em `sync.ts`)
  - `sincronizarConexao(db, client, conexao: { id: string; orgId: string }): Promise<SyncSummary & { investimentos: ResumoDeInvestimentos | null }>`

- [ ] **Step 1: Teste que falha (Review Focus 5)**

```ts
import { describe, it, expect } from 'vitest'
import { recursosDeConta } from '@/lib/openfinance/sync'

describe('recursosDeConta', () => {
  it('só conta e cartão entram no sync de lançamentos', () => {
    const rs = ['ACCOUNT', 'CREDIT_CARD_ACCOUNT', 'FUND', 'BANK_FIXED_INCOME', 'VARIABLE_INCOME'].map((resourceType) => ({ resourceType }))
    expect(recursosDeConta(rs).map((r) => r.resourceType)).toEqual(['ACCOUNT', 'CREDIT_CARD_ACCOUNT'])
  })
})
```

Run: `pnpm --filter web test -- recursos-de-conta` → FAIL.

- [ ] **Step 2: Implementar em `sync.ts`**

Acima de `syncConnectionTransactions`:

```ts
/**
 * Investimento também é `openfinance_resources`, mas não tem conta nem
 * lançamento. Sem este filtro ele caía em `skippedUnlinked` e inflava o aviso
 * de "recurso sem conta vinculada".
 */
export function recursosDeConta<T extends { resourceType: string }>(rs: T[]): T[] {
  return rs.filter((r) => r.resourceType === 'ACCOUNT' || r.resourceType === 'CREDIT_CARD_ACCOUNT')
}
```

e troque `for (const resource of resources)` por `for (const resource of recursosDeConta(resources))`.

Run: `pnpm --filter web test -- recursos-de-conta sync` → PASS.

- [ ] **Step 3: `sincronizar-conexao.ts`**

```ts
import { eq } from 'drizzle-orm'
import { openfinanceConnections, type getDb } from '@floow/db'
import type { PolpClient } from '@floow/core-finance'
import { syncConnectionTransactions, type SyncSummary } from './sync'
import { criarRepositorio } from './investimentos/repositorio'
import { sincronizarInvestimentos, type ResumoDeInvestimentos } from './investimentos/sincronizar'

type Db = ReturnType<typeof getDb>

/**
 * Tudo que uma conexão traz: lançamentos e, se o consentimento pediu,
 * investimentos. Um ponto de entrada só para o botão e para o cron.
 *
 * Falha de investimento não derruba o extrato — são dados independentes, e o
 * extrato é o que o orçamento consome.
 */
export async function sincronizarConexao(
  db: Db,
  client: PolpClient,
  conexao: { id: string; orgId: string },
): Promise<SyncSummary & { investimentos: ResumoDeInvestimentos | null }> {
  const lancamentos = await syncConnectionTransactions(db, client, conexao)

  const [dados] = await db
    .select({
      polpConsentId: openfinanceConnections.polpConsentId,
      institutionName: openfinanceConnections.institutionName,
      products: openfinanceConnections.products,
    })
    .from(openfinanceConnections)
    .where(eq(openfinanceConnections.id, conexao.id))
    .limit(1)

  if (!dados?.products.includes('INVESTMENTS')) return { ...lancamentos, investimentos: null }

  try {
    const investimentos = await sincronizarInvestimentos(criarRepositorio(db), client, { ...conexao, ...dados })
    return { ...lancamentos, investimentos }
  } catch (error) {
    console.error(`[openfinance] investimentos falharam para conexao=${conexao.id} org=${conexao.orgId}:`, error)
    return { ...lancamentos, investimentos: null }
  }
}
```

- [ ] **Step 4: Trocar os dois chamadores**

`importacao-agendada.ts`: importe `sincronizarConexao` de `./sincronizar-conexao` no lugar de `syncConnectionTransactions`, e troque a chamada por `sincronizarConexao(db, client, { id: conexao.id, orgId: conexao.orgId })`. O resumo segue somando os mesmos campos.

`connection-actions.ts`, sem acrescentar mais de 2 linhas líquidas:
- import: `import { type SyncSummary } from './sync'` + `import { sincronizarConexao } from './sincronizar-conexao'` (troca a linha atual por duas).
- em `syncBankConnection`, `syncConnectionTransactions(db, getPolpClient(), {` → `sincronizarConexao(db, getPolpClient(), {`.
- após `revalidatePath('/transactions')`: `revalidatePath('/investments')`.
- na leitura `stored` (por volta da linha 305), `.where(eq(openfinanceResources.connectionId, connection.id))` → `.where(and(eq(openfinanceResources.connectionId, connection.id), isNull(openfinanceResources.assetId)))` (mesma linha; `and` e `isNull` já estão importados).

Run: `wc -l apps/web/lib/openfinance/connection-actions.ts` → ≤ 500.

- [ ] **Step 5: Tirar investimento da lista de recursos da conexão**

Em `apps/web/lib/openfinance/queries.ts`, na leitura de `resources` (linha ~61), troque `.where(eq(openfinanceResources.orgId, orgId))` por `.where(and(eq(openfinanceResources.orgId, orgId), isNull(openfinanceResources.assetId)))`. Faça o mesmo em qualquer outra leitura de `openfinanceResources` que alimente a tela `accounts/connect/[connectionId]` (rode `grep -n "openfinanceResources" apps/web/app -r` e confira cada uma).

- [ ] **Step 6: Suíte e typecheck**

Run: `pnpm --filter web test && pnpm --filter web typecheck`
Expected: PASS (inclusive `rls-ledger` — `sincronizar-conexao.ts` só usa o tipo de `getDb`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/openfinance/sincronizar-conexao.ts apps/web/lib/openfinance/sync.ts apps/web/lib/openfinance/importacao-agendada.ts apps/web/lib/openfinance/connection-actions.ts apps/web/lib/openfinance/queries.ts apps/web/__tests__/openfinance/recursos-de-conta.test.ts
git commit -m "feat(openfinance): cron e botao sincronizam investimentos junto com o extrato"
```
