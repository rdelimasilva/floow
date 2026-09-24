# Corrigir regra de contraparte — Plano, parte 2 (tela, extrato, script)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a correção de regra para a tela (Classificar e extrato), com o CPF próprio decidido lançamento a lançamento e a sugestão pelo par.

**Architecture:** As queries de Classificar ganham `ehCpfProprio` e a sugestão de conta. A seção "Já confirmadas" sai para `regras-confirmadas.tsx`, com editor, prévia e caixa "aplicar ao histórico". O extrato ganha um link para a regra.

**Tech Stack:** Next.js (App Router, server components + client), Drizzle, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-corrigir-regra-contraparte-design.md`
**Depende de:** parte 1 (`...-1-backend.md`), Tasks 1-5.

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

### Task 8: Editor de regras confirmadas com prévia

**Files:**
- Create: `apps/web/components/openfinance/regras-confirmadas.tsx` (`'use client'`)
- Modify: `apps/web/components/openfinance/counterparty-queue-client.tsx` (renderiza `<RegrasConfirmadas>` no lugar do bloco removido; nova prop `regraAberta?: string`)
- Modify: `apps/web/components/openfinance/counterparty-queue.tsx` (repassa `regraAberta`)
- Modify: `apps/web/app/(app)/transactions/review/page.tsx` (lê `?regra=`)
- Test: `apps/web/__tests__/openfinance/regras-confirmadas.test.tsx`

**Interfaces:**
- Consumes:
  - `corrigirRegra`, `previaCorrecaoDeRegra`, `PreviaCorrecao` (parte 1, Task 5)
  - `ConfirmedCounterparty` (Task 6)
- Produces: `RegrasConfirmadas({ confirmed, categoryOptions, accountOptions, regraAberta }: { confirmed: ConfirmedCounterparty[]; categoryOptions: CategoryOption[]; accountOptions: AccountOption[]; regraAberta?: string })`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, it, expect, beforeEach } from 'vitest'

const corrigir = vi.fn(async () => ({ reprocessados: 11, ignorados: 0 }))
const previa = vi.fn(async () => ({ mudam: 11, foraPorParDoOutroLado: [], deltas: { xp: 6446627, corretora: -6446627 } }))
vi.mock('@/lib/openfinance/corrigir-regra-actions', () => ({ corrigirRegra: (...a: any[]) => corrigir(...a), previaCorrecaoDeRegra: (...a: any[]) => previa(...a) }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

import { RegrasConfirmadas } from '@/components/openfinance/regras-confirmadas'

const regra = { id: 'r1', displayName: 'Resgate CDB DI', nature: 'transfer' as const, categoryId: null, transferAccountId: 'xp', transferAccountName: 'XP Corretora', confirmedAt: '2026-09-08T19:18:09Z', keyType: 'description' as const, direction: 'in' as const, ehCpfProprio: false }
const contas = [{ id: 'xp', name: 'XP Corretora' }, { id: 'corretora', name: 'Itaú - Corretora' }]

beforeEach(() => { corrigir.mockClear(); previa.mockClear(); refresh.mockClear() })

it('abre direto pela ?regra= e mostra a prévia quando marca o histórico', async () => {
  render(<RegrasConfirmadas confirmed={[regra]} categoryOptions={[]} accountOptions={contas} regraAberta="r1" />)
  await userEvent.click(screen.getByRole('combobox'))
  await userEvent.click(screen.getByRole('option', { name: 'Itaú - Corretora' }))
  await userEvent.click(screen.getByLabelText('Aplicar também aos lançamentos já classificados'))
  expect(await screen.findByText(/11 lançamentos mudam/)).toBeInTheDocument()
  expect(screen.getByText(/XP Corretora \+R\$ 64\.466,27/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Salvar correção' }))
  expect(corrigir).toHaveBeenCalledWith({ counterpartyId: 'r1', nature: 'transfer', categoryId: null, transferAccountId: 'corretora', aplicarAoHistorico: true })
  expect(refresh).toHaveBeenCalled()
})

it('mudar a decisão depois da prévia descarta a prévia antiga', async () => {
  render(<RegrasConfirmadas confirmed={[regra]} categoryOptions={[]} accountOptions={contas} regraAberta="r1" />)
  await userEvent.click(screen.getByLabelText('Aplicar também aos lançamentos já classificados'))
  await screen.findByText(/11 lançamentos mudam/)
  await userEvent.click(screen.getByRole('combobox'))
  await userEvent.click(screen.getByRole('option', { name: 'Itaú - Corretora' }))
  expect(previa).toHaveBeenCalledTimes(2)
})

it('?regra= desconhecida: lista fechada, sem erro', () => {
  render(<RegrasConfirmadas confirmed={[regra]} categoryOptions={[]} accountOptions={contas} regraAberta="nao-existe" />)
  expect(screen.queryByRole('button', { name: 'Salvar correção' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Corrigir' })).toBeInTheDocument()
})

it('regra do CPF próprio não pede conta', async () => {
  render(<RegrasConfirmadas confirmed={[{ ...regra, keyType: 'tax_id', ehCpfProprio: true }]} categoryOptions={[]} accountOptions={contas} regraAberta="r1" />)
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.getByText(/voltam para Classificar/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/regras-confirmadas.test.tsx`
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implement `regras-confirmadas.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@floow/core-finance/src/balance'
import { corrigirRegra, previaCorrecaoDeRegra } from '@/lib/openfinance/corrigir-regra-actions'
import type { PreviaCorrecao } from '@/lib/openfinance/previa-correcao'
import type { ConfirmedCounterparty } from '@/lib/openfinance/counterparty-queries'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'

type Nature = 'income' | 'expense' | 'transfer'
type CategoryOption = { id: string; label: string; type: Nature }
type AccountOption = { id: string; name: string }
type Decisao = { nature: Nature; categoryId: string | null; transferAccountId: string | null }

interface Props {
  confirmed: ConfirmedCounterparty[]
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
  regraAberta?: string
}

const rotulo = (n: Nature) => (n === 'expense' ? 'Despesa' : n === 'income' ? 'Receita' : 'Transferência')

/**
 * "Já confirmadas" de Classificar, agora corrigíveis (spec §3-4). A caixa de
 * histórico vem desmarcada: só daqui pra frente é o padrão seguro. Marcada,
 * a prévia mostra o que muda antes de salvar.
 */
export function RegrasConfirmadas({ confirmed, categoryOptions, accountOptions, regraAberta }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [aberta, setAberta] = useState<string | null>(confirmed.some((c) => c.id === regraAberta) ? regraAberta! : null)
  const [decisao, setDecisao] = useState<Decisao | null>(null)
  const [historico, setHistorico] = useState(false)
  const [previa, setPrevia] = useState<PreviaCorrecao | null>(null)
  const [salvando, setSalvando] = useState(false)

  const regra = confirmed.find((c) => c.id === aberta) ?? null
  const atual: Decisao | null = regra
    ? decisao ?? { nature: regra.nature, categoryId: regra.categoryId, transferAccountId: regra.ehCpfProprio ? null : regra.transferAccountId }
    : null

  useEffect(() => {
    setPrevia(null)
    if (!regra || !atual || !historico) return
    if (atual.nature === 'transfer' && !atual.transferAccountId && !regra.ehCpfProprio) return
    if (atual.nature !== 'transfer' && !atual.categoryId) return
    let vivo = true
    previaCorrecaoDeRegra({ counterpartyId: regra.id, ...atual })
      .then((p) => { if (vivo) setPrevia(p) })
      .catch((e) => toast(e instanceof Error ? e.message : 'Não foi possível calcular a prévia', 'error'))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, historico, atual?.nature, atual?.categoryId, atual?.transferAccountId])

  function abrir(id: string) {
    setAberta(id); setDecisao(null); setHistorico(false); setPrevia(null)
  }

  async function salvar() {
    if (!regra || !atual) return
    setSalvando(true)
    try {
      const r = await corrigirRegra({ counterpartyId: regra.id, ...atual, aplicarAoHistorico: historico })
      toast(historico ? `${r.reprocessados} lançamentos corrigidos.` : 'Regra corrigida. Vale para os próximos lançamentos.')
      setAberta(null)
      router.refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (confirmed.length === 0) return null
  const naturezas = (['expense', 'income', 'transfer'] as const).filter((n) =>
    !(n === 'income' && regra?.direction === 'out') && !(n === 'expense' && regra?.direction === 'in'))
  const nomeDaConta = (id: string) => accountOptions.find((a) => a.id === id)?.name ?? 'outra conta'

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900">Já confirmadas</h2>
      <p className="mt-1 text-xs text-gray-500">Quem você já classificou. Vale para os lançamentos futuros também.</p>
      <ul className="mt-3 space-y-2">
        {confirmed.map((c) => (
          <li key={c.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-900">{c.displayName}</span>
              <span className="flex items-center gap-2 text-gray-500">
                {c.nature === 'transfer' ? `Transferência · ${c.ehCpfProprio ? 'por lançamento' : c.transferAccountName ?? '?'}` : rotulo(c.nature)}
                {aberta !== c.id && (
                  <Button type="button" variant="outline" onClick={() => abrir(c.id)}>Corrigir</Button>
                )}
              </span>
            </div>

            {aberta === c.id && atual && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {!c.ehCpfProprio && naturezas.map((n) => (
                    <Button key={n} type="button" variant={atual.nature === n ? 'primary' : 'outline'}
                      onClick={() => setDecisao({ nature: n, categoryId: null, transferAccountId: null })}>
                      {rotulo(n)}
                    </Button>
                  ))}
                  {atual.nature === 'transfer' && !c.ehCpfProprio && (
                    <Select value={atual.transferAccountId ?? ''} onValueChange={(v) => setDecisao({ ...atual, transferAccountId: v })}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="Conta" /></SelectTrigger>
                      <SelectContent>
                        {accountOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {atual.nature !== 'transfer' && (
                    <Select value={atual.categoryId ?? ''} onValueChange={(v) => setDecisao({ ...atual, categoryId: v })}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
                      <SelectContent>
                        {categoryOptions.filter((o) => o.type === atual.nature).map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {c.ehCpfProprio && (
                  <p className="text-xs text-gray-500">Pix para você mesmo não tem conta fixa. Com o histórico marcado, os lançamentos voltam para Classificar e você escolhe a conta de cada um.</p>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={historico} onChange={(e) => setHistorico(e.target.checked)} />
                  Aplicar também aos lançamentos já classificados
                </label>

                {historico && previa && (
                  <div className="rounded bg-gray-50 p-2 text-xs text-gray-700">
                    <p>{previa.mudam} lançamentos mudam</p>
                    {Object.entries(previa.deltas).map(([conta, v]) => (
                      <p key={conta}>{nomeDaConta(conta)} {v >= 0 ? '+' : ''}{formatBRL(v)}</p>
                    ))}
                    {previa.foraPorParDoOutroLado.length > 0 && (
                      <p className="mt-1 text-gray-500">
                        {previa.foraPorParDoOutroLado.length} seguem o par feito pela outra conta; corrija por lá.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="button" disabled={salvando || (historico && !previa)} onClick={salvar}>
                    {salvando ? 'Salvando…' : 'Salvar correção'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAberta(null)}>Cancelar</Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

(Se o texto do `formatBRL` de 6446627 não sair "R$ 64.466,27" com espaço normal, porque o `Intl` usa NBSP, trocar no teste o espaço por `\s`: `/XP Corretora \+R\$\s64\.466,27/`.)

- [ ] **Step 4: Ligar a página**

`app/(app)/transactions/review/page.tsx`:

```tsx
interface Props { searchParams: Promise<{ regra?: string }> }

export default async function ReviewPage({ searchParams }: Props) {
  const orgId = await getOrgId()
  const { regra } = await searchParams
  // ...
        <CounterpartyQueue orgId={orgId} mode="page" regraAberta={regra} />
```

- `counterparty-queue.tsx`: aceitar `regraAberta?: string` e repassar para o client.
- `counterparty-queue-client.tsx`: aceitar `regraAberta?: string` em `Props`. No lugar do bloco removido, renderizar:

```tsx
      {mode === 'page' && (
        <RegrasConfirmadas confirmed={confirmed} categoryOptions={categoryOptions} accountOptions={accountOptions} regraAberta={regraAberta} />
      )}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/ && pnpm tsc --noEmit`
Expected: PASS, zero erros de tipo.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/components/openfinance/regras-confirmadas.tsx apps/web/components/openfinance/counterparty-queue-client.tsx apps/web/components/openfinance/counterparty-queue.tsx "apps/web/app/(app)/transactions/review/page.tsx" apps/web/__tests__/openfinance/regras-confirmadas.test.tsx
git commit -m "feat(classificar): corrigir regra confirmada com previa do historico"
```

---

### Task 9: "Corrigir regra" no extrato

**Files:**
- Modify: `apps/web/lib/finance/queries-transactions.ts:213-240` (select ganha `counterpartyId: transactions.counterpartyId`)
- Modify: `apps/web/components/finance/transaction-list-types.ts` (`TransactionRowData` ganha `counterpartyId?: string | null`)
- Modify: `apps/web/components/finance/transaction-display-row.tsx` (link no card mobile e na linha desktop)
- Test: `apps/web/__tests__/finance/transaction-display-row-regra.test.tsx`

**Interfaces:**
- Produces: link `href={`/transactions/review?regra=${tx.counterpartyId}`}` com `aria-label="Corrigir regra"`

- [ ] **Step 1: Write the failing test**

Olhar um teste existente que renderiza `DesktopRow`/`MobileCard` (`grep -rl "transaction-display-row" apps/web/__tests__`) e copiar o `tx` base e as `actions` falsas de lá.

```tsx
it('lançamento de regra mostra o link para corrigir', () => {
  renderRow({ ...txBase, counterpartyId: 'cp-1' })
  expect(screen.getAllByRole('link', { name: 'Corrigir regra' })[0]).toHaveAttribute('href', '/transactions/review?regra=cp-1')
})
it('lançamento manual não mostra', () => {
  renderRow({ ...txBase, counterpartyId: null })
  expect(screen.queryByRole('link', { name: 'Corrigir regra' })).toBeNull()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/finance/transaction-display-row-regra.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

1. Acrescentar `counterpartyId: transactions.counterpartyId,` ao select de `queries-transactions.ts`. O `...row` em 311 já o repassa.
2. `transaction-list-types.ts`: `counterpartyId?: string | null`.
3. Em `transaction-display-row.tsx`, importar `SlidersHorizontal` de `lucide-react`. Logo antes do botão "Editar lançamento", no mobile (h-4) e no desktop (h-3.5):

```tsx
          {tx.counterpartyId && (
            <Link
              href={`/transactions/review?regra=${tx.counterpartyId}`}
              title="Corrigir a regra que classificou este lançamento"
              aria-label="Corrigir regra"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Link>
          )}
```

Conferir que `transaction-display-row.tsx` continua ≤ 500 linhas (hoje 373, fica perto de 395).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/finance/ && pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/queries-transactions.ts apps/web/components/finance/transaction-list-types.ts apps/web/components/finance/transaction-display-row.tsx apps/web/__tests__/finance/transaction-display-row-regra.test.tsx
git commit -m "feat(extrato): link para corrigir a regra que classificou o lancamento"
```

---

### Task 10: Script para as regras de CPF próprio e verificação final

**Files:**
- Create: `scripts/regras-cpf-proprio.mjs`

**Ordem de uso (importante):** o script tira a conta das regras de CPF próprio **que ainda não foram corrigidas pela tela**. Depois disso, `selecionarLancamentosDaRegra` pega todas as transferências confirmadas da contraparte, o que ainda funciona. Mesmo assim, a ordem recomendada é: deploy → o usuário corrige a XP pela tela → rodar o script para o que sobrou.

- [ ] **Step 1: Escrever o script** (dry-run por padrão, `--aplicar` grava)

```js
#!/usr/bin/env node
/**
 * Regras de contraparte do CPF do titular que ainda gravam conta fixa.
 * Spec 2026-09-24-corrigir-regra-contraparte §6.3. Não mexe em lançamento:
 * só tira a conta da regra, para o próximo Pix cair em Classificar.
 *
 *   node scripts/regras-cpf-proprio.mjs            # só lista
 *   node scripts/regras-cpf-proprio.mjs --aplicar  # grava
 */
import postgres from 'postgres'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

function env(nome) {
  if (process.env[nome]) return process.env[nome]
  for (const linha of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const i = linha.indexOf('=')
    if (i > 0 && !linha.trim().startsWith('#') && linha.slice(0, i).trim() === nome) return linha.slice(i + 1).trim()
  }
  throw new Error(`${nome} nao encontrada`)
}

const salt = env('POLP_CPF_SALT')
// Mesmo hash de apps/web/lib/openfinance/cpf.ts::hashCpf.
const hash = (cpf) => createHash('sha256').update(`${salt}:${cpf.replace(/\D/g, '')}`).digest('hex')
const aplicar = process.argv.includes('--aplicar')
const sql = postgres(env('DATABASE_URL'), { prepare: false })

const regras = await sql`
  select c.id, c.org_id, c.key_value, c.display_name, a.name as conta
  from counterparties c left join accounts a on a.id = c.transfer_account_id
  where c.key_type = 'tax_id' and c.nature = 'transfer' and c.transfer_account_id is not null`
const hashes = await sql`select org_id, cpf_hash from openfinance_connections`
const doTitular = new Set(hashes.map((h) => `${h.org_id}:${h.cpf_hash}`))

const alvo = regras.filter((r) => r.key_value.replace(/\D/g, '').length === 11 && doTitular.has(`${r.org_id}:${hash(r.key_value)}`))
for (const r of alvo) console.log(`${r.display_name} -> ${r.conta}`)
console.log(`${alvo.length} regra(s) do titular com conta fixa.`)

if (aplicar && alvo.length > 0) {
  await sql`update counterparties set transfer_account_id = null, updated_at = now() where id in ${sql(alvo.map((r) => r.id))}`
  console.log('Conta removida.')
}
await sql.end()
```

- [ ] **Step 2: Dry-run**

Run: `node scripts/regras-cpf-proprio.mjs`
Expected: lista `Pix recebido Ricardo de Lima Silva -> XP Corretora` e talvez outras (ex.: Itaú → NU, "Pix enviado", que também é o CPF do titular). **Não rodar `--aplicar` agora.** Mostrar a lista ao usuário.

- [ ] **Step 3: Verificação completa**

Run: `cd apps/web && pnpm vitest run && pnpm tsc --noEmit && cd ../.. && pnpm build`
Expected: todos os testes verdes, zero erros de tipo, build OK. Se algo falhar, parar e reportar a saída; não seguir para o merge.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add scripts/regras-cpf-proprio.mjs
git commit -m "chore(script): lista e remove conta fixa de regra do CPF do titular"
```

- [ ] **Step 5: Entrega**

Não fazer merge sozinho. Reportar ao usuário:
1. A branch está pronta. O fluxo do projeto é merge em master + push direto, com build antes (produção).
2. O roteiro para corrigir a XP depois do deploy:
   - Classificar → Já confirmadas → "Resgate CDB DI" → Corrigir → conta certa → marcar histórico → conferir a prévia (9 lançamentos) → Salvar;
   - "Pix recebido Ricardo de Lima Silva" → Corrigir → marcar histórico → Salvar. Os 4 voltam para Classificar com sugestão.
3. Depois disso, rodar `node scripts/regras-cpf-proprio.mjs --aplicar` para as regras do titular que sobraram.
