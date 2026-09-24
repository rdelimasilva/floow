# Corrigir regra de contraparte — Plano, parte 2 (tela, extrato, script)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a correção de regra para a tela (Classificar e extrato), com o CPF próprio decidido lançamento a lançamento e a sugestão pelo par.

**Architecture:** As queries de Classificar ganham `ehCpfProprio` e a sugestão de conta. A seção "Já confirmadas" sai para `regras-confirmadas.tsx`, com editor, prévia e caixa "aplicar ao histórico". O extrato ganha um link para a regra.

**Tech Stack:** Next.js (App Router, server components + client), Drizzle, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-corrigir-regra-contraparte-design.md`

## Global Constraints

Os mesmos da parte 1, e mais:
- `counterparty-queue-client.tsx` (351 linhas) não pode passar de 500. O editor de regras confirmadas vai para um arquivo próprio.
- Nenhum item de menu novo. A correção vive em `/transactions/review`.

## Review Focus

- **Grupo de CPF próprio com um lançamento sem conta escolhida:** o botão Confirmar recusa com aviso; nunca envia. Teste na Task 7.
- **Dois candidatos de par para o mesmo Pix:** sem sugestão (nunca chutar). Teste na Task 6.
- **`?regra=` de outra org ou inexistente:** a página abre normalmente, sem editor aberto. Teste na Task 8.
- **Prévia pedida e decisão alterada depois:** a prévia antiga some e é recalculada antes de salvar. Teste na Task 8.
- **Lançamento sem `counterparty_id` no extrato** (manual, importado por OFX): não mostra "Corrigir regra". Teste na Task 9.

**Arquivos do plano (executar em ordem):** `2026-09-24-corrigir-regra-contraparte-1a-backend.md` (Tasks 1-2), `2026-09-24-corrigir-regra-contraparte-1b-backend.md` (Task 3), `2026-09-24-corrigir-regra-contraparte-1c-backend.md` (Tasks 4-5), `2026-09-24-corrigir-regra-contraparte-2a-tela.md` (Tasks 6-7), `2026-09-24-corrigir-regra-contraparte-2b-tela.md` (Task 8), `2026-09-24-corrigir-regra-contraparte-2c-tela.md` (Tasks 9-10).

---

### Task 6: Queries de Classificar com CPF próprio e sugestão de par

**Files:**
- Create: `apps/web/lib/openfinance/sugestao-par.ts`
- Modify: `apps/web/lib/openfinance/counterparty-queries.ts` (`PendingGroup`, `PendingGroupItem`, `getPendingCounterpartyGroups`, `ConfirmedCounterparty`, `getConfirmedCounterparties`)
- Test: `apps/web/__tests__/openfinance/sugestao-par.test.ts`

**Interfaces:**
- Consumes: `carregarHashesDoTitular`, `ehCpfProprio` (parte 1, Task 1)
- Produces:
  - `sugerirContaDoPar(item: { accountId: string; amountCents: number; date: string }, candidatos: { accountId: string; amountCents: number; date: string }[]): string | null`
  - `carregarCandidatosDePar(db: Pick<Db, 'select'>, orgId: string, itens: { amountCents: number; date: string }[]): Promise<{ accountId: string; amountCents: number; date: string }[]>`
  - `PendingGroup.ehCpfProprio: boolean`
  - `PendingGroupItem.sugestaoContaId: string | null`
  - `ConfirmedCounterparty` ganha `keyType: 'tax_id' | 'description'`, `direction: 'in' | 'out'` e `ehCpfProprio: boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { sugerirContaDoPar } from '@/lib/openfinance/sugestao-par'

const pix = { accountId: 'itau', amountCents: 9552, date: '2025-10-03' }

describe('sugerirContaDoPar', () => {
  it('acha o lançamento espelhado em outra conta a até 3 dias', () => {
    expect(sugerirContaDoPar(pix, [{ accountId: 'nu', amountCents: -9552, date: '2025-10-05' }])).toBe('nu')
  })
  it('ignora a própria conta, valor diferente e mais de 3 dias', () => {
    expect(sugerirContaDoPar(pix, [
      { accountId: 'itau', amountCents: -9552, date: '2025-10-03' },
      { accountId: 'nu', amountCents: -9553, date: '2025-10-03' },
      { accountId: 'nu', amountCents: -9552, date: '2025-10-07' },
    ])).toBeNull()
  })
  it('duas contas candidatas: não sugere', () => {
    expect(sugerirContaDoPar(pix, [
      { accountId: 'nu', amountCents: -9552, date: '2025-10-03' },
      { accountId: 'xp', amountCents: -9552, date: '2025-10-04' },
    ])).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/sugestao-par.test.ts`
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implement `sugestao-par.ts`**

```ts
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'

type Db = ReturnType<typeof getDb>
type Linha = { accountId: string; amountCents: number; date: string }

const JANELA_DIAS = 3
const DIA_MS = 86_400_000

const dia = (d: string) => Date.parse(d.slice(0, 10))

/**
 * A conta do outro lado de um Pix para o próprio CPF, quando dá para saber:
 * lançamento de sinal oposto, mesmo valor, até 3 dias, em outra conta. Se
 * duas contas servem, não sugere: errar aqui cria par cruzado (spec §6.2).
 */
export function sugerirContaDoPar(item: Linha, candidatos: Linha[]): string | null {
  const contas = new Set<string>()
  for (const c of candidatos) {
    if (c.accountId === item.accountId) continue
    if (c.amountCents !== -item.amountCents) continue
    if (Math.abs(dia(c.date) - dia(item.date)) > JANELA_DIAS * DIA_MS) continue
    contas.add(c.accountId)
  }
  return contas.size === 1 ? [...contas][0] : null
}

/** Os lançamentos que podem ser o outro lado, numa consulta só. */
export async function carregarCandidatosDePar(
  db: Pick<Db, 'select'>,
  orgId: string,
  itens: { amountCents: number; date: string }[],
): Promise<Linha[]> {
  if (itens.length === 0) return []
  const datas = itens.map((i) => dia(i.date))
  const de = new Date(Math.min(...datas) - JANELA_DIAS * DIA_MS).toISOString().slice(0, 10)
  const ate = new Date(Math.max(...datas) + JANELA_DIAS * DIA_MS).toISOString().slice(0, 10)
  const rows = await db
    .select({ accountId: transactions.accountId, amountCents: transactions.amountCents, date: transactions.date })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      inArray(transactions.amountCents, [...new Set(itens.map((i) => -i.amountCents))]),
      isNull(transactions.transferGroupId),
      eq(transactions.isIgnored, false),
      gte(transactions.date, de),
      lte(transactions.date, ate),
    ))
  return rows.map((r) => ({ ...r, date: r.date instanceof Date ? r.date.toISOString() : String(r.date) }))
}
```

- [ ] **Step 4: Plug into `counterparty-queries.ts`**

1. Em `PendingGroupItem`, acrescentar:

```ts
  /** CPF próprio: a conta do outro lado, se o par foi achado sem ambiguidade. */
  sugestaoContaId: string | null
```

2. Em `PendingGroup`, acrescentar:

```ts
  /** Pix para o próprio CPF: a conta é escolhida por lançamento, nunca pelo grupo. */
  ehCpfProprio: boolean
```

3. Em `getPendingCounterpartyGroups`:
   - acrescentar `keyValue: counterparties.keyValue` ao select;
   - inicializar o grupo com `ehCpfProprio: false` e cada item com `sugestaoContaId: null`;
   - antes do `return`, preencher os grupos do titular:

```ts
    const hashes = await carregarHashesDoTitular(db, orgId)
    const chaves = new Map(rows.map((r) => [r.counterpartyId, { keyType: r.keyType, keyValue: r.keyValue }]))
    const doTitular = [...groups.values()].filter((g) => {
      const k = chaves.get(g.counterpartyId)
      return k?.keyType === 'tax_id' && ehCpfProprio(k.keyValue, hashes)
    })
    const itensDoTitular = doTitular.flatMap((g) => g.items)
    const candidatos = await carregarCandidatosDePar(db, orgId, itensDoTitular)
    for (const g of doTitular) {
      g.ehCpfProprio = true
      for (const item of g.items) item.sugestaoContaId = sugerirContaDoPar(item, candidatos)
    }
```

4. Em `ConfirmedCounterparty`, acrescentar `keyType`, `direction` e `ehCpfProprio`. Em `getConfirmedCounterparties`, selecionar `keyType`, `keyValue` e `direction`, carregar os hashes uma vez e mapear `ehCpfProprio: row.keyType === 'tax_id' && ehCpfProprio(row.keyValue, hashes)`. O `keyValue` **não** vai para o cliente.

(`withUserDb` entrega um `RlsTx`. `carregarHashesDoTitular` e `carregarCandidatosDePar` aceitam `Pick<Db, 'select'>`. Se o TypeScript recusar o `RlsTx`, passar `db as unknown as Pick<Db, 'select'>`. A policy `openfinance_connections: members can select` (00027) permite a leitura.)

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/ && pnpm tsc --noEmit`
Expected: PASS e zero erros de tipo. Se testes de componente antigos montam `PendingGroup` sem os campos novos, completar as fixtures com `ehCpfProprio: false` e `sugestaoContaId: null`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/sugestao-par.ts apps/web/lib/openfinance/counterparty-queries.ts apps/web/__tests__/openfinance/sugestao-par.test.ts
git commit -m "feat(classificar): marca o CPF do titular e sugere a conta pelo par"
```

---

### Task 7: Classificar: grupo do CPF próprio e aviso de descrição genérica

**Files:**
- Modify: `apps/web/components/openfinance/counterparty-queue-client.tsx`
- Test: `apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx` (acrescentar casos no arquivo existente, no mesmo estilo)

**Interfaces:**
- Consumes: `PendingGroup.ehCpfProprio`, `PendingGroupItem.sugestaoContaId` (Task 6). `confirmCounterparty` aceita `transferAccountId: null` quando é transferência de CPF próprio (parte 1, Task 2).

- [ ] **Step 1: Write the failing tests**

```tsx
it('CPF próprio: sem conta de grupo, lançamentos abertos e sugestão pré-selecionada', async () => {
  const grupo = { ...grupoBase, ehCpfProprio: true, keyType: 'tax_id' as const,
    items: [{ ...itemBase, id: 'i1', type: 'transfer' as const, sugestaoContaId: 'nu' }, { ...itemBase, id: 'i2', type: 'transfer' as const, sugestaoContaId: null }] }
  render(<CounterpartyQueueClient mode="page" pending={[grupo]} confirmed={[]} categoryOptions={[]} accountOptions={[{ id: 'nu', name: 'NU' }, { id: 'itau', name: 'Itaú' }]} />)
  expect(screen.getByText(/Pix para você mesmo/)).toBeInTheDocument()
  expect(screen.getByTestId('item-i1')).toHaveTextContent('NU')
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
  expect(confirmCounterpartyMock).not.toHaveBeenCalled()
  expect(toastMock).toHaveBeenCalledWith('Escolha a conta de cada lançamento.', 'error')
})

it('transferência por descrição mostra o aviso de alcance', () => {
  const grupo = { ...grupoBase, keyType: 'description' as const, displayName: 'Resgate CDB DI', items: [{ ...itemBase, type: 'transfer' as const }] }
  render(<CounterpartyQueueClient mode="page" pending={[grupo]} confirmed={[]} categoryOptions={[]} accountOptions={[]} />)
  expect(screen.getByText('Vale para todo lançamento com o texto "Resgate CDB DI" nesta conta.')).toBeInTheDocument()
})
```

(Usar o `grupoBase`/`itemBase` e os mocks de `confirmCounterparty` e toast que o arquivo de teste já tem. Se eles tiverem outro nome, adaptar os nomes, e não o comportamento.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/counterparty-queue-client.test.tsx`
Expected: FAIL nos dois casos novos

- [ ] **Step 3: Implement**

No `CounterpartyQueueClient`:

1. Semear os overrides com a sugestão. Trocar a inicialização de `itemOverrides` por:

```ts
  const [itemOverrides, setItemOverrides] = useState<Record<string, { nature: Nature; categoryId: string | null; transferAccountId: string | null }>>(() => {
    // CPF próprio: cada lançamento já nasce como exceção de transferência,
    // com a conta sugerida pelo par quando houver (spec §6.2).
    const inicial: Record<string, { nature: Nature; categoryId: string | null; transferAccountId: string | null }> = {}
    for (const g of initialPending) {
      if (!g.ehCpfProprio) continue
      for (const i of g.items) inicial[i.id] = { nature: 'transfer', categoryId: null, transferAccountId: i.sugestaoContaId }
    }
    return inicial
  })
```

2. Iniciar `expanded` com os grupos do titular: `useState<Set<string>>(() => new Set(initialPending.filter((g) => g.ehCpfProprio).map((g) => g.counterpartyId)))`.
3. Em `draftFor`, para `grupo?.ehCpfProprio` devolver `{ nature: 'transfer', categoryId: null, transferAccountId: null }`.
4. Em `confirm(group)`, antes da checagem `draft.nature === 'transfer' && !draft.transferAccountId`:

```ts
    if (group.ehCpfProprio) {
      const semConta = group.items.some((i) => {
        const o = itemOverrides[i.id]
        return !o || (o.nature === 'transfer' && !o.transferAccountId)
      })
      if (semConta) {
        toast('Escolha a conta de cada lançamento.', 'error')
        return
      }
    }
```

   e trocar a checagem existente por `if (draft.nature === 'transfer' && !draft.transferAccountId && !group.ehCpfProprio)`.
5. Em `renderGroup`:
   - para `group.ehCpfProprio`, não renderizar os botões de natureza nem o `Select` de conta do grupo;
   - no lugar deles, renderizar `<p className="text-xs text-gray-500">Pix para você mesmo: escolha a conta em cada lançamento. Isso não vira regra.</p>`;
   - para `draft.nature === 'transfer' && group.keyType === 'description'`, renderizar abaixo dos controles:

```tsx
                {draft.nature === 'transfer' && group.keyType === 'description' && (
                  <p className="mt-2 text-xs text-gray-500">
                    Vale para todo lançamento com o texto "{group.displayName}" nesta conta.
                  </p>
                )}
```

6. Remover o bloco "Já confirmadas" (linhas 331-348). Ele vai para a Task 8, e o `confirmed` passa adiante para `<RegrasConfirmadas>`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/counterparty-queue-client.test.tsx`
Expected: PASS. Casos antigos que conferiam o texto "Já confirmadas" passam a ser da Task 8: mover para o teste da Task 8.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/components/openfinance/counterparty-queue-client.tsx apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx
git commit -m "feat(classificar): CPF proprio escolhe conta por lancamento; aviso de descricao generica"
```

---

