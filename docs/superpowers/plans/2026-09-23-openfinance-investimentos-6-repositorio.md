# Parte 6 — Repositório de investimentos

Índice e restrições globais: `2026-09-23-openfinance-investimentos.md`. Depende das Partes 1, 2, 4 e 5.

Pasta nova: `apps/web/lib/openfinance/investimentos/`. Nenhum arquivo dela chama `getDb()` — recebem `db` por parâmetro, como `sync.ts`.

### Task 8: Repositório de investimentos

**Files:**
- Create: `apps/web/lib/openfinance/investimentos/vinculo.ts`
- Create: `apps/web/lib/openfinance/investimentos/repositorio.ts`
- Test: `apps/web/__tests__/openfinance/investimentos/vinculo.test.ts`

**Interfaces:**
- Consumes: tabelas da T1; `NormalizedInvestment`, `NormalizedInvestmentEvent` (T6, T7); `recomputeOrgPositionSnapshots(orgId, db)` (T2).
- Produces:

```ts
// vinculo.ts
export type Vinculo = { tipo: 'novo' } | { tipo: 'meu'; resourceId: string; assetId: string | null } | { tipo: 'conflito' }
export function decidirVinculo(existente: { id: string; orgId: string; assetId: string | null } | undefined, orgId: string): Vinculo
export function janelaDeMovimentacoes(ultimaData: string | null, margemDias?: number): { fromDate?: string }

// repositorio.ts
export interface ProblemaDeIngestao { resourceId: string | null; externalId: string | null; reason: string; payload: unknown }
export interface RepositorioDeInvestimentos {
  garantirConta(conexao: { id: string; orgId: string; institutionName: string | null }): Promise<string>
  salvarInvestimento(ctx: { orgId: string; connectionId: string }, inv: NormalizedInvestment):
    Promise<{ tipo: 'salvo'; assetId: string; resourceId: string } | { tipo: 'conflito' }>
  ultimaDataDeMovimentacao(assetId: string): Promise<string | null>
  salvarMovimentacoes(ctx: { orgId: string; accountId: string; assetId: string }, eventos: NormalizedInvestmentEvent[]): Promise<number>
  registrarProblemas(orgId: string, problemas: ProblemaDeIngestao[]): Promise<void>
  recalcularPosicoes(orgId: string): Promise<void>
}
export function criarRepositorio(db: Db): RepositorioDeInvestimentos
```

- [ ] **Step 1: Testes que falham (regras puras)**

```ts
import { describe, it, expect } from 'vitest'
import { decidirVinculo, janelaDeMovimentacoes } from '@/lib/openfinance/investimentos/vinculo'

describe('decidirVinculo', () => {
  it('investimento nunca visto é novo', () => {
    expect(decidirVinculo(undefined, 'org-a')).toEqual({ tipo: 'novo' })
  })
  it('já é desta org: reaproveita recurso e ativo', () => {
    expect(decidirVinculo({ id: 'r1', orgId: 'org-a', assetId: 'a1' }, 'org-a')).toEqual({ tipo: 'meu', resourceId: 'r1', assetId: 'a1' })
  })
  it('pertence a outra org: conflito, nunca atualizar a linha alheia', () => {
    expect(decidirVinculo({ id: 'r1', orgId: 'org-b', assetId: 'a1' }, 'org-a')).toEqual({ tipo: 'conflito' })
  })
})

describe('janelaDeMovimentacoes', () => {
  it('primeira vez: sem filtro, puxa todo o histórico', () => {
    expect(janelaDeMovimentacoes(null)).toEqual({})
  })
  it('depois: última data menos 7 dias, para pegar lançamento atrasado', () => {
    expect(janelaDeMovimentacoes('2026-09-20')).toEqual({ fromDate: '2026-09-13T00:00:00Z' })
  })
  it('virada de mês', () => {
    expect(janelaDeMovimentacoes('2026-03-03')).toEqual({ fromDate: '2026-02-24T00:00:00Z' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter web test -- investimentos/vinculo`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `vinculo.ts`**

```ts
/**
 * Regras puras da ingestão de investimentos.
 *
 * `polp_resource_id` é único GLOBAL — é o que torna o roteamento do webhook
 * determinístico. Se o investimento já pertence a outra org, a ingestão pula:
 * atualizar a linha alheia foi exatamente o defeito que `persistResources`
 * teve com contas (ver o comentário lá).
 */
export type Vinculo =
  | { tipo: 'novo' }
  | { tipo: 'meu'; resourceId: string; assetId: string | null }
  | { tipo: 'conflito' }

export function decidirVinculo(
  existente: { id: string; orgId: string; assetId: string | null } | undefined,
  orgId: string,
): Vinculo {
  if (!existente) return { tipo: 'novo' }
  if (existente.orgId !== orgId) return { tipo: 'conflito' }
  return { tipo: 'meu', resourceId: existente.id, assetId: existente.assetId }
}

/**
 * `fromDate` da próxima busca de movimentações.
 *
 * Margem de 7 dias: instituição lança movimentação com atraso (come-cotas
 * sai no último dia útil e aparece dias depois). O upsert por
 * `polp_transaction_id` torna a sobreposição inofensiva.
 */
export function janelaDeMovimentacoes(ultimaData: string | null, margemDias = 7): { fromDate?: string } {
  if (!ultimaData) return {}
  const d = new Date(`${ultimaData}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - margemDias)
  return { fromDate: `${d.toISOString().slice(0, 10)}T00:00:00Z` }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter web test -- investimentos/vinculo`
Expected: PASS.

- [ ] **Step 5: Implementar `repositorio.ts`**

```ts
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  accounts, assets, assetBankPositions, openfinanceConnections,
  openfinanceIngestionIssues, openfinanceResources, portfolioEvents,
  type getDb,
} from '@floow/db'
import type { NormalizedInvestment, NormalizedInvestmentEvent } from '@floow/core-finance'
import { recomputeOrgPositionSnapshots } from '@/lib/investments/position-snapshots'
import { decidirVinculo } from './vinculo'

type Db = ReturnType<typeof getDb>

// (interfaces ProblemaDeIngestao e RepositorioDeInvestimentos da seção "Produces")

export function criarRepositorio(db: Db): RepositorioDeInvestimentos {
  return {
    async garantirConta(conexao) {
      const [atual] = await db
        .select({ accountId: openfinanceConnections.investmentAccountId })
        .from(openfinanceConnections)
        .where(eq(openfinanceConnections.id, conexao.id))
        .limit(1)
      if (atual?.accountId) return atual.accountId

      // `brokerage` fica fora do seletor de lançamento e do saldo corrido — ver
      // `core-finance/src/account-kind.ts`. D3: investimento não toca o caixa.
      const [conta] = await db
        .insert(accounts)
        .values({ orgId: conexao.orgId, name: `Investimentos · ${conexao.institutionName ?? 'Open Finance'}`, type: 'brokerage' })
        .returning({ id: accounts.id })
      await db
        .update(openfinanceConnections)
        .set({ investmentAccountId: conta.id, updatedAt: new Date() })
        .where(eq(openfinanceConnections.id, conexao.id))
      return conta.id
    },

    async salvarInvestimento(ctx, inv) {
      const [existente] = await db
        .select({ id: openfinanceResources.id, orgId: openfinanceResources.orgId, assetId: openfinanceResources.assetId })
        .from(openfinanceResources)
        .where(eq(openfinanceResources.polpResourceId, inv.polpId))
        .limit(1)

      const vinculo = decidirVinculo(existente, ctx.orgId)
      if (vinculo.tipo === 'conflito') return { tipo: 'conflito' }

      const dadosDoAtivo = { ...inv.asset, currency: 'BRL', source: 'openfinance' as const, updatedAt: new Date() }

      let resourceId: string
      let assetId: string | null = null
      if (vinculo.tipo === 'novo') {
        const [r] = await db
          .insert(openfinanceResources)
          .values({
            orgId: ctx.orgId, connectionId: ctx.connectionId, polpResourceId: inv.polpId,
            resourceType: inv.kind, status: 'AVAILABLE', displayLabel: inv.asset.name,
          })
          .returning({ id: openfinanceResources.id })
        resourceId = r.id
      } else {
        resourceId = vinculo.resourceId
        assetId = vinculo.assetId
      }

      if (assetId) {
        await db.update(assets).set(dadosDoAtivo).where(and(eq(assets.id, assetId), eq(assets.orgId, ctx.orgId)))
      } else {
        const [a] = await db.insert(assets).values({ orgId: ctx.orgId, ...dadosDoAtivo }).returning({ id: assets.id })
        assetId = a.id
        await db
          .update(openfinanceResources)
          .set({ assetId, displayLabel: inv.asset.name, updatedAt: new Date() })
          .where(eq(openfinanceResources.id, resourceId))
      }

      if (inv.position) {
        const { referenceDate, ...valores } = inv.position
        await db
          .insert(assetBankPositions)
          .values({ orgId: ctx.orgId, assetId, referenceDate, ...valores })
          .onConflictDoUpdate({ target: [assetBankPositions.assetId, assetBankPositions.referenceDate], set: valores })
      }

      await db
        .update(openfinanceResources)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(openfinanceResources.id, resourceId))

      return { tipo: 'salvo', assetId, resourceId }
    },

    async ultimaDataDeMovimentacao(assetId) {
      const [row] = await db
        .select({ eventDate: portfolioEvents.eventDate })
        .from(portfolioEvents)
        .where(eq(portfolioEvents.assetId, assetId))
        .orderBy(desc(portfolioEvents.eventDate))
        .limit(1)
      return row ? row.eventDate.toISOString().slice(0, 10) : null
    },

    async salvarMovimentacoes(ctx, eventos) {
      if (eventos.length === 0) return 0
      const linhas = eventos.map((e) => ({
        orgId: ctx.orgId,
        assetId: ctx.assetId,
        accountId: ctx.accountId,
        eventType: e.eventType,
        eventDate: new Date(`${e.eventDate}T00:00:00Z`),
        quantity: e.quantity,
        priceCents: e.priceCents,
        totalCents: e.totalCents,
        unitPrice: e.unitPrice,
        polpTransactionId: e.polpTransactionId,
        grossCents: e.grossCents,
        netCents: e.netCents,
        incomeTaxCents: e.incomeTaxCents,
        notes: e.notes,
      }))
      await db
        .insert(portfolioEvents)
        .values(linhas)
        .onConflictDoUpdate({
          target: portfolioEvents.polpTransactionId,
          set: {
            eventType: sqlExcluded('event_type'), eventDate: sqlExcluded('event_date'),
            quantity: sqlExcluded('quantity'), priceCents: sqlExcluded('price_cents'),
            totalCents: sqlExcluded('total_cents'), unitPrice: sqlExcluded('unit_price'),
            grossCents: sqlExcluded('gross_cents'), netCents: sqlExcluded('net_cents'),
            incomeTaxCents: sqlExcluded('income_tax_cents'), notes: sqlExcluded('notes'),
          },
        })
      return linhas.length
    },

    async registrarProblemas(orgId, problemas) {
      if (problemas.length === 0) return
      await db.insert(openfinanceIngestionIssues).values(
        problemas.map((p) => ({
          orgId, resourceId: p.resourceId, externalId: p.externalId,
          reason: p.reason.slice(0, 500), payload: (p.payload ?? {}) as Record<string, unknown>,
        })),
      )
    },

    async recalcularPosicoes(orgId) {
      await recomputeOrgPositionSnapshots(orgId, db)
    },
  }
}

/** `excluded.<coluna>` — o valor que o INSERT tentou gravar. */
function sqlExcluded(coluna: string) {
  return sql.raw(`excluded.${coluna}`)
}
```

- [ ] **Step 6: Typecheck e catraca de RLS**

Run: `pnpm --filter web typecheck && pnpm --filter web test -- rls-ledger investimentos`
Expected: PASS. O arquivo só usa o **tipo** de `getDb`; se a catraca acusar mesmo assim, leia como ela detecta o uso em `__tests__/auth/rls-ledger.test.ts` e ajuste o import ao padrão de `sync.ts` — nunca acrescente o arquivo à lista `PENDENTES`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/openfinance/investimentos/vinculo.ts apps/web/lib/openfinance/investimentos/repositorio.ts apps/web/__tests__/openfinance/investimentos/vinculo.test.ts
git commit -m "feat(openfinance): repositorio de investimentos com vinculo por org"
```
