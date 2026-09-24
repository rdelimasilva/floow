# Parte 8 — Consentimento e tela

Índice e restrições globais: `2026-09-23-openfinance-investimentos.md`. Depende das Partes 1–7.

### Task 11: Investimentos no wizard de conexão

**Files:**
- Modify: `apps/web/app/(app)/accounts/connect/connect-wizard.tsx` (array `PRODUCTS`, linha ~30)
- Modify: `apps/web/lib/openfinance/connection-actions.ts` (`SUPPORTED_PRODUCTS`, linha 37 — troca na mesma linha)
- Test: `apps/web/__tests__/openfinance/connect-wizard-produtos.test.tsx`

**Interfaces:**
- Produces: `export const PRODUCTS` em `connect-wizard.tsx` (hoje é `const` local — exporte para o teste).

- [ ] **Step 1: Teste que falha**

```tsx
import { describe, it, expect } from 'vitest'
import { PRODUCTS } from '@/app/(app)/accounts/connect/connect-wizard'

describe('produtos oferecidos no wizard', () => {
  it('oferece investimentos, sem marcar por padrão', () => {
    const inv = PRODUCTS.find((p) => p.value === 'INVESTMENTS')
    expect(inv?.label).toBe('Investimentos')
    expect(inv?.hint).toMatch(/renda fixa|fundos/i)
  })
  it('não oferece o que o floow não importa', () => {
    expect(PRODUCTS.map((p) => p.value)).not.toContain('CREDIT_OPERATIONS')
    expect(PRODUCTS.map((p) => p.value)).not.toContain('EXCHANGE')
  })
})
```

Run: `pnpm --filter web test -- connect-wizard-produtos` → FAIL.

- [ ] **Step 2: Implementar**

Em `connect-wizard.tsx`, `const PRODUCTS` → `export const PRODUCTS`, e acrescente ao array:

```ts
  {
    value: 'INVESTMENTS',
    label: 'Investimentos',
    hint: 'Renda fixa, Tesouro, fundos e ações: posição e movimentações. Não mexe no seu extrato.',
  },
```

O estado inicial `useState<string[]>(['ACCOUNT', 'CREDIT_CARD_ACCOUNT'])` **não muda**: investimento é opt-in, cada produto é acesso contínuo (ver "Escolha de produtos" na spec de 2026-09-02).

Em `connection-actions.ts`, na mesma linha: `const SUPPORTED_PRODUCTS: PolpProduct[] = ['ACCOUNT', 'CREDIT_CARD_ACCOUNT', 'INVESTMENTS']`. Atualize o comentário da linha acima para "Os produtos que o floow sabe ingerir." (mesma quantidade de linhas).

- [ ] **Step 3: Rodar e ver passar**

Run: `pnpm --filter web test -- connect-wizard-produtos && pnpm --filter web typecheck && wc -l apps/web/lib/openfinance/connection-actions.ts`
Expected: PASS e ≤ 500 linhas.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(app)/accounts/connect/connect-wizard.tsx" apps/web/lib/openfinance/connection-actions.ts apps/web/__tests__/openfinance/connect-wizard-produtos.test.tsx
git commit -m "feat(openfinance): wizard oferece investimentos como produto opcional"
```

---

### Task 12: Ativo do banco na tela de investimentos

**Files:**
- Modify: `apps/web/lib/investments/queries.ts` (`EnrichedPosition`, `getPositions`)
- Create: `apps/web/lib/investments/bank-position-queries.ts`
- Modify: `apps/web/components/investments/position-table.tsx`
- Modify: `apps/web/components/investments/asset-event-list.tsx`
- Modify: `apps/web/app/(app)/investments/[assetId]/page.tsx`
- Modify: `apps/web/lib/openfinance/connection-actions.ts` (invalidar cache de investimentos — +1 linha)
- Test: `apps/web/__tests__/investments/position-badges.test.ts`

**Interfaces:**
- Consumes: `assets.source`, `assetPositionSnapshots.costIsPartial`, `assetBankPositions` (T1); `assetDisplayName`, `EVENT_TYPE_LABEL` (T3).
- Produces:
  - `EnrichedPosition` += `source: 'manual' | 'openfinance'`, `costIsPartial: boolean`, `ticker: string | null`.
  - `getLatestBankPosition(orgId: string, assetId: string): Promise<{ referenceDate: string; grossCents: number | null; netCents: number | null; incomeTaxCents: number | null; iofCents: number | null } | null>`
  - `positionBadges(p: Pick<EnrichedPosition, 'source' | 'costIsPartial'>): Array<{ label: string; title: string }>`

**Somente leitura é na tela, não no servidor — decisão consciente.** `lib/investments/actions.ts` tem 555 linhas; tocá-lo exigiria dividi-lo antes (CLAUDE.md), e o arquivo novo cairia na catraca de `getDb()`. O dano de uma edição por fora é autocorrigível: `updateAsset`/`updatePortfolioEvent` são sobrescritos no próximo upsert; `deleteAsset` zera `openfinance_resources.asset_id` (`on delete set null`) e a próxima sincronização recria o ativo com o histórico inteiro (`ultimaDataDeMovimentacao` volta a `null`). Registrar isso no corpo do commit.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { positionBadges } from '@/components/investments/position-badges'

describe('positionBadges', () => {
  it('ativo manual não tem selo', () => {
    expect(positionBadges({ source: 'manual', costIsPartial: false })).toEqual([])
  })
  it('ativo do banco tem selo de origem', () => {
    expect(positionBadges({ source: 'openfinance', costIsPartial: false }).map((b) => b.label)).toEqual(['Open Finance'])
  })
  it('custo parcial explica o porquê', () => {
    const b = positionBadges({ source: 'openfinance', costIsPartial: true })
    expect(b.map((x) => x.label)).toEqual(['Open Finance', 'Custo parcial'])
    expect(b[1].title).toMatch(/12 meses/)
  })
})
```

Run: `pnpm --filter web test -- position-badges` → FAIL.

- [ ] **Step 2: `position-badges.ts`**

Create `apps/web/components/investments/position-badges.ts`:

```ts
import type { EnrichedPosition } from '@/lib/investments/queries'

/** Selos da linha de posição. Função pura para o texto não se espalhar pela tabela. */
export function positionBadges(p: Pick<EnrichedPosition, 'source' | 'costIsPartial'>): Array<{ label: string; title: string }> {
  if (p.source !== 'openfinance') return []
  const badges = [{ label: 'Open Finance', title: 'Posição informada pelo banco. Atualizada a cada sincronização; edite no banco, não aqui.' }]
  if (p.costIsPartial) {
    badges.push({
      label: 'Custo parcial',
      title: 'O banco não informou o preço de compra e o histórico do Open Finance cobre só os últimos 12 meses. O custo soma apenas as aplicações conhecidas.',
    })
  }
  return badges
}
```

Run: `pnpm --filter web test -- position-badges` → PASS.

- [ ] **Step 3: `getPositions` traz origem e custo parcial**

Em `queries.ts`: `EnrichedPosition.ticker: string | null` e acrescente `source` e `costIsPartial`. No `select` de `getPositions`, acrescente `source: assets.source` e `costIsPartial: assetPositionSnapshots.costIsPartial`, e repasse no `map`. Troque `.orderBy(asc(assets.ticker))` por `.orderBy(asc(sql\`coalesce(${assets.ticker}, ${assets.name})\`))` (ativo sem ticker ordena pelo nome; `sql` já está importado no arquivo — confira).

Run: `pnpm --filter web typecheck`. Todo erro de `ticker` nulo que aparecer se resolve com `assetDisplayName(position)`.

- [ ] **Step 4: Última posição do banco para a página do ativo**

`bank-position-queries.ts` (usa `withUserDb`, não `getDb()` — arquivo novo entra já convertido):

```ts
import { and, desc, eq } from 'drizzle-orm'
import { assetBankPositions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'

/** Bruto, líquido e impostos que o banco informou na última data de referência. */
export async function getLatestBankPosition(orgId: string, assetId: string) {
  return withUserDb(async (db) => {
    const [row] = await db
      .select({
        referenceDate: assetBankPositions.referenceDate,
        grossCents: assetBankPositions.grossCents,
        netCents: assetBankPositions.netCents,
        incomeTaxCents: assetBankPositions.incomeTaxCents,
        iofCents: assetBankPositions.iofCents,
      })
      .from(assetBankPositions)
      .where(and(eq(assetBankPositions.orgId, orgId), eq(assetBankPositions.assetId, assetId)))
      .orderBy(desc(assetBankPositions.referenceDate))
      .limit(1)
    return row ?? null
  })
}
```

- [ ] **Step 5: Tabela de posições**

Em `position-table.tsx`, na `PositionRow`:
- Coluna ticker: `assetDisplayName(position)`; logo abaixo, os selos:

```tsx
          {positionBadges(position).map((b) => (
            <span key={b.label} title={b.title} className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-600">
              {b.label}
            </span>
          ))}
```

- Quantidade: `position.quantityHeld.toLocaleString('pt-BR', { maximumFractionDigits: 6 })` (cota fracionária).
- Ações: com `position.source === 'openfinance'`, **não renderizar** os botões de atualizar preço e de excluir; o de Histórico continua.

- [ ] **Step 6: Página do ativo**

Em `apps/web/app/(app)/investments/[assetId]/page.tsx`:
- Carregue o ativo com `source`, `isin`, `indexer`, `dueDate`, `assetSubtype`. Se `source === 'openfinance'`, chame `getLatestBankPosition(orgId, assetId)` e renderize um bloco "Posição no banco" com: data de referência (`dd/MM/yyyy`), bruto, líquido, IR, IOF (cada um `formatBRL`, `—` quando nulo) e, quando existirem, vencimento e remuneração (`indexer`, `assetSubtype`).
- Esconda o formulário de novo evento e o de edição do ativo quando `source === 'openfinance'`.
- Passe `readOnly={asset.source === 'openfinance'}` para `AssetEventList`.

Em `asset-event-list.tsx`: prop `readOnly?: boolean`; com ela, não renderizar editar/excluir. Rótulo do tipo via `EVENT_TYPE_LABEL[event.eventType] ?? event.eventType`.

- [ ] **Step 7: Cache**

Em `connection-actions.ts` → `syncBankConnection`, depois de `await invalidateTag(transactionsTag(orgId))`: `await invalidateTag(investmentsTag(orgId))` e acrescente `investmentsTag` ao import existente de `@/lib/cache-tags` (mesma linha). O cron não invalida — `getPositions` revalida em 300 s, suficiente para dado diário.

Run: `wc -l apps/web/lib/openfinance/connection-actions.ts` → ≤ 500.

- [ ] **Step 8: Suíte, typecheck e build**

Run: `pnpm --filter web test && pnpm typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 9: Conferir na tela**

Suba o app (skill `run`), conecte com a org que tem dados (ver memória "Três orgs, uma com dados") e confira: posição de um ativo manual inalterada; wizard com a opção Investimentos desmarcada. Sem conexão com investimento autorizada, os selos só aparecem após a primeira sincronização real — registre no resumo o que foi e o que não foi possível ver.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/investments/queries.ts apps/web/lib/investments/bank-position-queries.ts apps/web/components/investments/position-badges.ts apps/web/components/investments/position-table.tsx apps/web/components/investments/asset-event-list.tsx "apps/web/app/(app)/investments/[assetId]/page.tsx" apps/web/lib/openfinance/connection-actions.ts apps/web/__tests__/investments/position-badges.test.ts
git commit -m "feat(investimentos): ativo do banco na tela com selo, bruto/liquido e somente leitura"
```

---

## Fora deste plano: incluir investimentos em conexão antiga

A spec prevê a ação **Incluir investimentos** para conexões criadas antes desta fase. Ela fica para um plano próprio, porque depende de respostas que só a Polp dá (pendência P1):

1. Um consentimento novo para o mesmo CPF + instituição, com `avoidDuplicates: false`, é aceito, ou conta contra o teto regulatório de reconexão?
2. As contas e cartões do consentimento novo voltam com os **mesmos** `resource_id`? Se não voltarem, os vínculos `openfinance_resources.account_id` quebram e o extrato duplica — é o que decide entre "trocar o consentimento da conexão" e "conexão paralela só de investimentos".
3. Criar consentimento exige o CPF em claro, e o floow guarda só o hash: a ação precisará pedir o CPF de novo e conferir contra `cpf_hash`.

Até lá, investimento chega só por conexão nova.
