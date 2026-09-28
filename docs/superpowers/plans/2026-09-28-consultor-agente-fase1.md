# Consultor como agente — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O consultor do /cfo passa a consultar dados reais por ferramentas (laço no servidor) e responde com números iguais aos das telas.

**Architecture:** Um núcleo `lib/consultor/agente.ts` roda o laço Claude ⇄ ferramentas (máx. 5 rodadas). As ferramentas de leitura são adaptadores finos das queries que as telas já usam (mesmos números) e recebem `{ orgId, userId }` explícitos, nunca a sessão. As 4 ações antigas viram ferramentas do tipo `sugestao`: o agente não as executa, só repassa ao cliente como botão, que continua usando `/api/cfo/chat/action`. O route `/api/cfo/chat` vira adaptador: autentica, monta histórico e prompt, chama o agente, faz o streaming e salva.

**Tech Stack:** Next.js (route handler), TypeScript, Drizzle, zod 3, vitest, API da Anthropic via `fetch` (`packages/core-finance`).

**Spec:** `docs/superpowers/specs/2026-09-28-consultor-agente-design.md` (seção "Fase 1")

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md).
- Texto para o usuário e comentários em pt-BR ("tela", "você").
- Toda consulta filtra por `orgId` recebido em `ContextoFerramenta`; nenhuma ferramenta chama `getOrgId()`/`requireIdentity()`.
- Só lançamentos confirmados (`reviewState === 'confirmed'`) e não ignorados.
- Resultado de ferramenta: no máximo 30 linhas listadas (`LIMITE_LINHAS`), valores já em reais (`formatBRL`).
- Máximo de 5 rodadas de ferramenta por pergunta (`MAX_RODADAS`).
- Limite de uso: buckets `cfo.chat.burst` (60 s, `CFO_CHAT_BURST_LIMIT` ?? 8) e `cfo.chat.hour` (3600 s, `CFO_CHAT_HOURLY_LIMIT` ?? 30), sujeito `orgId`; uma pergunta consome uma vez.
- Modelo do chat: `process.env.CFO_CHAT_MODEL ?? 'claude-sonnet-5'` — só no chat; o default do provider (usado pelo motor CFO) não muda.
- `maxDuration = 60` no route do chat.
- Trabalho em branch `feat/consultor-agente-fase1`; `git add` só dos arquivos da tarefa (há outras sessões no mesmo diretório — nunca `git add -A`); checar `git branch --show-current` antes de cada commit.

## Review Focus

1. Conversa antiga com linhas `tool_result` e respostas vazias no histórico — o agente deve recebê-la sem quebrar a API (Task 7, `historicoParaOAgente`).
2. Intervalo invertido (`fim` antes de `inicio`) ou data mal formatada — erro de parâmetro devolvido ao Claude, não exceção 500 (Task 2).
3. Nome de categoria com acento/caixa diferente ("alimentacao" × "Alimentação") — deve casar (Task 2/3).
4. Busca que bate o teto de 200 lançamentos — o total não pode ser apresentado como completo (Task 4).
5. Resposta que estoura as rodadas depois de já ter escrito texto — o usuário recebe o texto + aviso, não uma bolha vazia (Task 6).

---

### Task 1: Provider aceita laço de ferramentas

**Files:**
- Modify: `packages/core-finance/src/cfo/types.ts` (interfaces `ChatMessage`, nova `ToolResultBlock`)
- Create: `packages/core-finance/src/cfo/llm/anthropic-messages.ts`
- Modify: `packages/core-finance/src/cfo/llm/anthropic.ts` (bloco "Convert ChatMessage[] to Anthropic format" em `streamChat`)
- Test: `packages/core-finance/src/__tests__/cfo/anthropic-messages.test.ts`

**Interfaces:**
- Produces: `ChatMessage.toolCalls?: ToolCall[]`, `ChatMessage.toolResults?: ToolResultBlock[]`, `interface ToolResultBlock { toolUseId: string; content: string; isError?: boolean }` (exportados por `@floow/core-finance` via `export * from './cfo/types'`); `toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core-finance/src/__tests__/cfo/anthropic-messages.test.ts
import { describe, it, expect } from 'vitest'
import { toAnthropicMessages } from '../../cfo/llm/anthropic-messages'
import type { ChatMessage } from '../../cfo/types'

const base = { id: 'x', createdAt: '2026-09-28T00:00:00Z' }

describe('toAnthropicMessages', () => {
  it('texto simples passa como string', () => {
    expect(toAnthropicMessages([{ ...base, role: 'user', content: 'oi' }])).toEqual([{ role: 'user', content: 'oi' }])
  })

  it('assistente com toolCalls vira blocos text + tool_use', () => {
    const m: ChatMessage = {
      ...base, role: 'assistant', content: 'Vou olhar.',
      toolCalls: [{ id: 't1', name: 'saldos_das_contas', params: {} }],
    }
    expect(toAnthropicMessages([m])).toEqual([{
      role: 'assistant',
      content: [
        { type: 'text', text: 'Vou olhar.' },
        { type: 'tool_use', id: 't1', name: 'saldos_das_contas', input: {} },
      ],
    }])
  })

  it('assistente só com tool_use não manda bloco de texto vazio', () => {
    const m: ChatMessage = { ...base, role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'a', params: { x: 1 } }] }
    expect(toAnthropicMessages([m])[0].content).toEqual([{ type: 'tool_use', id: 't1', name: 'a', input: { x: 1 } }])
  })

  it('toolResults vira um user com um tool_result por bloco, com is_error só quando erro', () => {
    const m: ChatMessage = {
      ...base, role: 'tool_result', content: '',
      toolResults: [
        { toolUseId: 't1', content: 'ok' },
        { toolUseId: 't2', content: 'falhou', isError: true },
      ],
    }
    expect(toAnthropicMessages([m])).toEqual([{
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
        { type: 'tool_result', tool_use_id: 't2', content: 'falhou', is_error: true },
      ],
    }])
  })

  it('tool_result antigo (toolCall único) mantém o formato de antes', () => {
    const m: ChatMessage = { ...base, role: 'tool_result', content: 'feito', toolCall: { id: 't9', name: 'create_budget', params: {} } }
    expect(toAnthropicMessages([m])).toEqual([{
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't9', content: 'feito' }],
    }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core-finance && pnpm vitest run src/__tests__/cfo/anthropic-messages.test.ts`
Expected: FAIL — cannot find module `../../cfo/llm/anthropic-messages`

- [ ] **Step 3: Implement**

Em `packages/core-finance/src/cfo/types.ts`, substituir `interface ChatMessage` por:

```ts
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool_result'
  content: string
  toolCall?: ToolCall
  toolResult?: { success: boolean; message: string }
  /** Assistente: blocos tool_use desta rodada (laço de ferramentas no servidor). */
  toolCalls?: ToolCall[]
  /** tool_result com um bloco por tool_use da rodada anterior. */
  toolResults?: ToolResultBlock[]
  createdAt: string
}

export interface ToolResultBlock {
  toolUseId: string
  content: string
  isError?: boolean
}
```

Criar `packages/core-finance/src/cfo/llm/anthropic-messages.ts`:

```ts
import type { ChatMessage } from '../types'

type Bloco =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Bloco[]
}

/**
 * Histórico do floow → formato da API da Anthropic.
 *
 * O laço de ferramentas exige reenviar os blocos tool_use do assistente e os
 * tool_result com o mesmo id; só texto, a API recusa o tool_result órfão.
 */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  return messages.map((m): AnthropicMessage => {
    if (m.role === 'tool_result') {
      if (m.toolResults?.length) {
        return {
          role: 'user',
          content: m.toolResults.map((r) => ({
            type: 'tool_result' as const,
            tool_use_id: r.toolUseId,
            content: r.content,
            ...(r.isError ? { is_error: true } : {}),
          })),
        }
      }
      return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCall!.id, content: m.content }] }
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      const blocos: Bloco[] = m.content ? [{ type: 'text', text: m.content }] : []
      for (const c of m.toolCalls) blocos.push({ type: 'tool_use', id: c.id, name: c.name, input: c.params })
      return { role: 'assistant', content: blocos }
    }
    return { role: m.role, content: m.content }
  })
}
```

Em `anthropic.ts`, dentro de `streamChat`, trocar todo o bloco `const anthropicMessages = messages.map((m) => { ... })` por:

```ts
        const anthropicMessages = toAnthropicMessages(messages)
```

e adicionar no topo: `import { toAnthropicMessages } from './anthropic-messages'`.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd packages/core-finance && pnpm vitest run && pnpm typecheck`
Expected: PASS em tudo, typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git switch -c feat/consultor-agente-fase1
git add packages/core-finance/src/cfo/types.ts packages/core-finance/src/cfo/llm/anthropic-messages.ts packages/core-finance/src/cfo/llm/anthropic.ts packages/core-finance/src/__tests__/cfo/anthropic-messages.test.ts
git commit -m "feat(consultor): provider reenvia tool_use e tool_result para o laço de ferramentas"
```

---

### Task 2: Contrato de ferramenta, utilitários e `saldos_das_contas`

**Files:**
- Create: `apps/web/lib/consultor/ferramentas/tipos.ts`
- Create: `apps/web/lib/consultor/ferramentas/utils.ts`
- Create: `apps/web/lib/consultor/ferramentas/saldos-das-contas.ts`
- Test: `apps/web/__tests__/consultor/ferramentas-utils.test.ts`
- Test: `apps/web/__tests__/consultor/saldos-das-contas.test.ts`

**Interfaces:**
- Consumes: `ChatTool` de `@floow/core-finance`; `getAccounts(orgId)` de `@/lib/finance/queries-accounts`; `formatBRL(cents)` de `@floow/core-finance`.
- Produces:
  - `interface ContextoFerramenta { orgId: string; userId: string }`
  - `interface Ferramenta { definicao: ChatTool; tipo: 'leitura' | 'sugestao'; executar?: (ctx: ContextoFerramenta, params: unknown) => Promise<string> }`
  - `class ParametroInvalido extends Error`
  - `utils.ts`: `LIMITE_LINHAS = 30`, `mesSchema`, `dataSchema`, `validar<T>(schema, params): T`, `intervaloDoMes(mes): { inicio: Date; fim: Date }`, `intervaloDeDatas(inicio, fim): { inicio: Date; fim: Date }`, `normalizar(s): string`, `reais(cents): string`, `dataISO(d: Date | string): string`
  - `saldosDasContas: Ferramenta` (nome `saldos_das_contas`)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/__tests__/consultor/ferramentas-utils.test.ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validar, intervaloDoMes, intervaloDeDatas, normalizar, mesSchema, dataISO } from '@/lib/consultor/ferramentas/utils'
import { ParametroInvalido } from '@/lib/consultor/ferramentas/tipos'

describe('utils das ferramentas', () => {
  it('intervaloDoMes cobre do dia 1 ao último dia, como a tela do plano', () => {
    const { inicio, fim } = intervaloDoMes('2026-02')
    expect(inicio).toEqual(new Date(2026, 1, 1))
    expect(fim).toEqual(new Date(2026, 2, 0))
  })

  it('mês fora do formato é parâmetro inválido', () => {
    expect(() => validar(z.object({ mes: mesSchema }), { mes: '2026-13' })).toThrow(ParametroInvalido)
    expect(() => validar(z.object({ mes: mesSchema }), { mes: 'setembro' })).toThrow(ParametroInvalido)
  })

  it('intervalo invertido é parâmetro inválido', () => {
    expect(() => intervaloDeDatas('2026-09-30', '2026-09-01')).toThrow(ParametroInvalido)
  })

  it('intervaloDeDatas usa data local, sem deslocar o dia', () => {
    const { inicio, fim } = intervaloDeDatas('2026-09-01', '2026-09-30')
    expect(inicio).toEqual(new Date(2026, 8, 1))
    expect(fim).toEqual(new Date(2026, 8, 30))
  })

  it('normalizar ignora acento e caixa', () => {
    expect(normalizar(' Alimentação ')).toBe('alimentacao')
    expect(normalizar('ALIMENTACAO')).toBe(normalizar('alimentação'))
  })

  it('dataISO aceita Date e string', () => {
    expect(dataISO(new Date(Date.UTC(2026, 8, 5)))).toBe('2026-09-05')
    expect(dataISO('2026-09-05')).toBe('2026-09-05')
  })
})
```

```ts
// apps/web/__tests__/consultor/saldos-das-contas.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/finance/queries-accounts', () => ({ getAccounts: vi.fn() }))

import { getAccounts } from '@/lib/finance/queries-accounts'
import { saldosDasContas } from '@/lib/consultor/ferramentas/saldos-das-contas'
import { reais } from '@/lib/consultor/ferramentas/utils'

const ctx = { orgId: 'org-1', userId: 'u1' }

describe('saldos_das_contas', () => {
  beforeEach(() => vi.mocked(getAccounts).mockReset())

  it('lista cada conta e o total, consultando a org do contexto', async () => {
    vi.mocked(getAccounts).mockResolvedValue([
      { name: 'Itaú', type: 'checking', balanceCents: 150000 },
      { name: 'Nubank', type: 'credit_card', balanceCents: -30000 },
    ] as never)
    const r = await saldosDasContas.executar!(ctx, {})
    expect(getAccounts).toHaveBeenCalledWith('org-1')
    expect(r).toContain(`Itaú (checking): ${reais(150000)}`)
    expect(r).toContain(`Nubank (credit_card): ${reais(-30000)}`)
    expect(r).toContain(`Total: ${reais(120000)}`)
  })

  it('sem conta ativa diz isso', async () => {
    vi.mocked(getAccounts).mockResolvedValue([] as never)
    expect(await saldosDasContas.executar!(ctx, {})).toBe('Nenhuma conta ativa cadastrada.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run __tests__/consultor`
Expected: FAIL — módulos `@/lib/consultor/...` não existem.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/consultor/ferramentas/tipos.ts
import type { ChatTool } from '@floow/core-finance'

/** O que toda ferramenta recebe. Nunca a sessão: o WhatsApp (fase 3) não tem. */
export interface ContextoFerramenta {
  orgId: string
  userId: string
}

export interface Ferramenta {
  definicao: ChatTool
  /**
   * 'leitura' roda no servidor e o resultado volta ao Claude.
   * 'sugestao' não roda: vira botão na web (fluxo antigo, até a fase 2).
   */
  tipo: 'leitura' | 'sugestao'
  executar?: (ctx: ContextoFerramenta, params: unknown) => Promise<string>
}

/** Parâmetro que o Claude mandou errado — volta para ele corrigir. */
export class ParametroInvalido extends Error {}
```

```ts
// apps/web/lib/consultor/ferramentas/utils.ts
import { z } from 'zod'
import { formatBRL } from '@floow/core-finance'
import { ParametroInvalido } from './tipos'

/** Máximo de linhas listadas num resultado — contexto pequeno e barato. */
export const LIMITE_LINHAS = 30

export const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'use o formato YYYY-MM')
export const dataSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'use o formato YYYY-MM-DD')

export function validar<T>(schema: z.ZodType<T>, params: unknown): T {
  const r = schema.safeParse(params ?? {})
  if (!r.success) {
    throw new ParametroInvalido(r.error.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`).join('; '))
  }
  return r.data
}

/** Mesma conta da tela do plano: do dia 1 ao último dia, em data local. */
export function intervaloDoMes(mes: string): { inicio: Date; fim: Date } {
  const [y, m] = mes.split('-').map(Number)
  return { inicio: new Date(y, m - 1, 1), fim: new Date(y, m, 0) }
}

function dataLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function intervaloDeDatas(inicio: string, fim: string): { inicio: Date; fim: Date } {
  const i = dataLocal(inicio)
  const f = dataLocal(fim)
  if (f < i) throw new ParametroInvalido(`fim (${fim}) é anterior ao início (${inicio})`)
  return { inicio: i, fim: f }
}

/** "alimentacao" acha "Alimentação". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export const reais = (cents: number): string => formatBRL(cents)

export function dataISO(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
}
```

```ts
// apps/web/lib/consultor/ferramentas/saldos-das-contas.ts
import { getAccounts } from '@/lib/finance/queries-accounts'
import type { Ferramenta } from './tipos'
import { reais } from './utils'

export const saldosDasContas: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'saldos_das_contas',
    description: 'Saldo atual de cada conta ativa (corrente, poupança, cartão, corretora) e o total.',
    inputSchema: { type: 'object', properties: {} },
  },
  async executar(ctx) {
    const contas = await getAccounts(ctx.orgId)
    if (contas.length === 0) return 'Nenhuma conta ativa cadastrada.'
    const total = contas.reduce((s, c) => s + c.balanceCents, 0)
    const linhas = contas.map((c) => `- ${c.name} (${c.type}): ${reais(c.balanceCents)}`)
    return `${linhas.join('\n')}\nTotal: ${reais(total)}`
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run __tests__/consultor`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/ferramentas/tipos.ts apps/web/lib/consultor/ferramentas/utils.ts apps/web/lib/consultor/ferramentas/saldos-das-contas.ts apps/web/__tests__/consultor/ferramentas-utils.test.ts apps/web/__tests__/consultor/saldos-das-contas.test.ts
git commit -m "feat(consultor): contrato de ferramenta e saldos_das_contas"
```

---

### Task 3: `resumo_do_mes` e `gastos_por_categoria`

**Files:**
- Create: `apps/web/lib/consultor/ferramentas/resumo-do-mes.ts`
- Create: `apps/web/lib/consultor/ferramentas/gastos-por-categoria.ts`
- Test: `apps/web/__tests__/consultor/resumo-e-gastos.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Ferramenta`, `validar`, `mesSchema`, `dataSchema`, `intervaloDeDatas`, `normalizar`, `reais`, `LIMITE_LINHAS`); `getMonthlyCashFlowSummary(orgId, months)` de `@/lib/finance/queries-cash-flow` (→ `{ month: 'YYYY-MM', income, expense (negativo), net }[]`); `getSpendingByCategory(orgId, start, end)` de `@/lib/finance/budget-queries` (→ `{ categoryId: string | null; spent: number }[]`, `spent` positivo); `getCategories(orgId)` de `@/lib/finance/queries-categories`.
- Produces: `resumoDoMes: Ferramenta` (`resumo_do_mes`, params `{ mes }`), `gastosPorCategoria: Ferramenta` (`gastos_por_categoria`, params `{ inicio, fim, categoria? }`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/consultor/resumo-e-gastos.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/finance/queries-cash-flow', () => ({ getMonthlyCashFlowSummary: vi.fn() }))
vi.mock('@/lib/finance/budget-queries', () => ({ getSpendingByCategory: vi.fn() }))
vi.mock('@/lib/finance/queries-categories', () => ({ getCategories: vi.fn() }))

import { getMonthlyCashFlowSummary } from '@/lib/finance/queries-cash-flow'
import { getSpendingByCategory } from '@/lib/finance/budget-queries'
import { getCategories } from '@/lib/finance/queries-categories'
import { resumoDoMes } from '@/lib/consultor/ferramentas/resumo-do-mes'
import { gastosPorCategoria } from '@/lib/consultor/ferramentas/gastos-por-categoria'
import { reais } from '@/lib/consultor/ferramentas/utils'
import { ParametroInvalido } from '@/lib/consultor/ferramentas/tipos'

const ctx = { orgId: 'org-1', userId: 'u1' }

beforeEach(() => vi.clearAllMocks())

describe('resumo_do_mes', () => {
  it('traz receita, despesa (positiva) e resultado do mês pedido', async () => {
    vi.mocked(getMonthlyCashFlowSummary).mockResolvedValue([
      { month: '2026-09', income: 1000000, expense: -600000, net: 400000 },
      { month: '2026-08', income: 1, expense: -1, net: 0 },
    ])
    const r = await resumoDoMes.executar!(ctx, { mes: '2026-09' })
    expect(getMonthlyCashFlowSummary).toHaveBeenCalledWith('org-1', 24)
    expect(r).toContain(`Receitas: ${reais(1000000)}`)
    expect(r).toContain(`Despesas: ${reais(600000)}`)
    expect(r).toContain(`Resultado: ${reais(400000)}`)
  })

  it('mês sem dado diz que não há', async () => {
    vi.mocked(getMonthlyCashFlowSummary).mockResolvedValue([])
    expect(await resumoDoMes.executar!(ctx, { mes: '2020-01' })).toContain('Sem lançamentos confirmados em 2020-01')
  })

  it('mês mal formatado é ParametroInvalido', async () => {
    await expect(resumoDoMes.executar!(ctx, { mes: '09/2026' })).rejects.toThrow(ParametroInvalido)
  })
})

describe('gastos_por_categoria', () => {
  beforeEach(() => {
    vi.mocked(getCategories).mockResolvedValue([
      { id: 'c1', name: 'Alimentação' },
      { id: 'c2', name: 'Supermercado' },
    ] as never)
    vi.mocked(getSpendingByCategory).mockResolvedValue([
      { categoryId: 'c2', spent: 50000 },
      { categoryId: 'c1', spent: 80000 },
      { categoryId: null, spent: 1000 },
    ])
  })

  it('ordena do maior para o menor, com total, e nomeia sem categoria', async () => {
    const r = await gastosPorCategoria.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30' })
    expect(getSpendingByCategory).toHaveBeenCalledWith('org-1', new Date(2026, 8, 1), new Date(2026, 8, 30))
    expect(r.indexOf('Alimentação')).toBeLessThan(r.indexOf('Supermercado'))
    expect(r).toContain(`Sem categoria: ${reais(1000)}`)
    expect(r).toContain(`Total: ${reais(131000)}`)
  })

  it('filtro de categoria ignora acento e caixa e casa por trecho', async () => {
    const r = await gastosPorCategoria.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'mercado' })
    expect(r).toContain(`Supermercado: ${reais(50000)}`)
    expect(r).not.toContain('Alimentação')
    const r2 = await gastosPorCategoria.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'ALIMENTACAO' })
    expect(r2).toContain(`Alimentação: ${reais(80000)}`)
  })

  it('categoria sem gasto diz isso', async () => {
    const r = await gastosPorCategoria.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'viagem' })
    expect(r).toContain('Nenhum gasto em categoria parecida com "viagem"')
  })

  it('intervalo invertido é ParametroInvalido', async () => {
    await expect(gastosPorCategoria.executar!(ctx, { inicio: '2026-09-30', fim: '2026-09-01' })).rejects.toThrow(ParametroInvalido)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/resumo-e-gastos.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/consultor/ferramentas/resumo-do-mes.ts
import { z } from 'zod'
import { getMonthlyCashFlowSummary } from '@/lib/finance/queries-cash-flow'
import type { Ferramenta } from './tipos'
import { mesSchema, reais, validar } from './utils'

/** A tela de Fluxo de Caixa usa a mesma consulta — os números batem. */
const MESES_COBERTOS = 24
const Params = z.object({ mes: mesSchema })

export const resumoDoMes: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'resumo_do_mes',
    description: 'Receitas, despesas e resultado de um mês (só lançamentos confirmados). Cobre os últimos 24 meses.',
    inputSchema: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'Mês no formato YYYY-MM' } },
      required: ['mes'],
    },
  },
  async executar(ctx, params) {
    const { mes } = validar(Params, params)
    const meses = await getMonthlyCashFlowSummary(ctx.orgId, MESES_COBERTOS)
    const linha = meses.find((m) => m.month === mes)
    if (!linha) return `Sem lançamentos confirmados em ${mes} (o resumo cobre os últimos ${MESES_COBERTOS} meses).`
    return [
      `Resumo de ${mes} (lançamentos confirmados):`,
      `- Receitas: ${reais(linha.income)}`,
      `- Despesas: ${reais(Math.abs(linha.expense))}`,
      `- Resultado: ${reais(linha.net)}`,
    ].join('\n')
  },
}
```

```ts
// apps/web/lib/consultor/ferramentas/gastos-por-categoria.ts
import { z } from 'zod'
import { getSpendingByCategory } from '@/lib/finance/budget-queries'
import { getCategories } from '@/lib/finance/queries-categories'
import type { Ferramenta } from './tipos'
import { LIMITE_LINHAS, dataSchema, intervaloDeDatas, normalizar, reais, validar } from './utils'

const Params = z.object({ inicio: dataSchema, fim: dataSchema, categoria: z.string().min(1).optional() })

export const gastosPorCategoria: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'gastos_por_categoria',
    description:
      'Total gasto por categoria num período (mesma conta do Plano de Gastos: despesas confirmadas, sem ignoradas nem aplicações). ' +
      'Com "categoria", filtra pelas categorias cujo nome contém o texto.',
    inputSchema: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
        fim: { type: 'string', description: 'Data final YYYY-MM-DD (inclusiva)' },
        categoria: { type: 'string', description: 'Trecho do nome da categoria (opcional)' },
      },
      required: ['inicio', 'fim'],
    },
  },
  async executar(ctx, params) {
    const p = validar(Params, params)
    const { inicio, fim } = intervaloDeDatas(p.inicio, p.fim)
    const [gastos, categorias] = await Promise.all([
      getSpendingByCategory(ctx.orgId, inicio, fim),
      getCategories(ctx.orgId),
    ])
    const nomePorId = new Map(categorias.map((c) => [c.id, c.name]))
    let linhas = gastos.map((g) => ({
      nome: g.categoryId ? (nomePorId.get(g.categoryId) ?? 'Categoria removida') : 'Sem categoria',
      gasto: g.spent,
    }))
    if (p.categoria) {
      const alvo = normalizar(p.categoria)
      linhas = linhas.filter((l) => normalizar(l.nome).includes(alvo))
      if (linhas.length === 0) return `Nenhum gasto em categoria parecida com "${p.categoria}" entre ${p.inicio} e ${p.fim}.`
    }
    if (linhas.length === 0) return `Nenhum gasto confirmado entre ${p.inicio} e ${p.fim}.`

    linhas.sort((a, b) => b.gasto - a.gasto)
    const total = linhas.reduce((s, l) => s + l.gasto, 0)
    const mostradas = linhas.slice(0, LIMITE_LINHAS)
    const resto = linhas.slice(LIMITE_LINHAS)
    return [
      `Gastos de ${p.inicio} a ${p.fim}:`,
      ...mostradas.map((l) => `- ${l.nome}: ${reais(l.gasto)}`),
      ...(resto.length ? [`- (+${resto.length} categorias menores: ${reais(resto.reduce((s, l) => s + l.gasto, 0))})`] : []),
      `Total: ${reais(total)}`,
    ].join('\n')
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/resumo-e-gastos.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/ferramentas/resumo-do-mes.ts apps/web/lib/consultor/ferramentas/gastos-por-categoria.ts apps/web/__tests__/consultor/resumo-e-gastos.test.ts
git commit -m "feat(consultor): ferramentas resumo_do_mes e gastos_por_categoria"
```

---

### Task 4: `buscar_transacoes`

**Files:**
- Create: `apps/web/lib/consultor/ferramentas/buscar-transacoes.ts`
- Test: `apps/web/__tests__/consultor/buscar-transacoes.test.ts`

**Interfaces:**
- Consumes: Task 2 utils; `getTransactionsWithCount(orgId, opts)` de `@/lib/finance/queries-transactions` (opts: `startDate`, `endDate`, `search`, `categoryIds` e `accountId` separados por vírgula, `limit`; devolve `{ transactions: { date, description, amountCents, type, reviewState, isIgnored, categoryName }[], totalCount }`); `getCategories`; `getAccounts`.
- Produces: `buscarTransacoes: Ferramenta` (`buscar_transacoes`, params `{ inicio, fim, texto?, categoria?, conta? }`); `BUSCA_MAX = 200`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/consultor/buscar-transacoes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/finance/queries-transactions', () => ({ getTransactionsWithCount: vi.fn() }))
vi.mock('@/lib/finance/queries-categories', () => ({ getCategories: vi.fn() }))
vi.mock('@/lib/finance/queries-accounts', () => ({ getAccounts: vi.fn() }))

import { getTransactionsWithCount } from '@/lib/finance/queries-transactions'
import { getCategories } from '@/lib/finance/queries-categories'
import { getAccounts } from '@/lib/finance/queries-accounts'
import { buscarTransacoes, BUSCA_MAX } from '@/lib/consultor/ferramentas/buscar-transacoes'
import { reais } from '@/lib/consultor/ferramentas/utils'

const ctx = { orgId: 'org-1', userId: 'u1' }
const tx = (over: Record<string, unknown> = {}) => ({
  date: new Date(Date.UTC(2026, 8, 10)), description: 'IFOOD *PEDIDO', amountCents: -4500,
  type: 'expense', reviewState: 'confirmed', isIgnored: false, categoryName: 'Delivery', ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('buscar_transacoes', () => {
  it('filtra por texto e período, soma despesas e lista as linhas', async () => {
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: [tx(), tx({ amountCents: -5500 })], totalCount: 2 } as never)
    const r = await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', texto: 'ifood' })
    expect(getTransactionsWithCount).toHaveBeenCalledWith('org-1', expect.objectContaining({
      startDate: '2026-09-01', endDate: '2026-09-30', search: 'ifood', limit: BUSCA_MAX,
    }))
    expect(r).toContain(`Total de despesas: ${reais(10000)}`)
    expect(r).toContain(`2026-09-10 | IFOOD *PEDIDO | ${reais(-4500)} | Delivery`)
  })

  it('descarta pendente de revisão e ignorado', async () => {
    vi.mocked(getTransactionsWithCount).mockResolvedValue({
      transactions: [tx(), tx({ reviewState: 'pending' }), tx({ isIgnored: true })], totalCount: 3,
    } as never)
    const r = await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30' })
    expect(r).toContain('1 lançamentos')
    expect(r).toContain(`Total de despesas: ${reais(4500)}`)
  })

  it('categoria vira lista de ids das categorias que casam pelo nome', async () => {
    vi.mocked(getCategories).mockResolvedValue([{ id: 'c1', name: 'Delivery' }, { id: 'c2', name: 'Mercado' }] as never)
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: [tx()], totalCount: 1 } as never)
    await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'deliv' })
    expect(getTransactionsWithCount).toHaveBeenCalledWith('org-1', expect.objectContaining({ categoryIds: 'c1' }))
  })

  it('categoria inexistente responde sem consultar transações', async () => {
    vi.mocked(getCategories).mockResolvedValue([{ id: 'c1', name: 'Delivery' }] as never)
    const r = await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'viagem' })
    expect(r).toContain('Nenhuma categoria parecida com "viagem"')
    expect(getTransactionsWithCount).not.toHaveBeenCalled()
  })

  it('conta vira accountId pelo nome', async () => {
    vi.mocked(getAccounts).mockResolvedValue([{ id: 'a1', name: 'Nubank' }, { id: 'a2', name: 'Itaú' }] as never)
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: [tx()], totalCount: 1 } as never)
    await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', conta: 'itau' })
    expect(getTransactionsWithCount).toHaveBeenCalledWith('org-1', expect.objectContaining({ accountId: 'a2' }))
  })

  it('busca que bate o teto avisa que o total está incompleto', async () => {
    const muitas = Array.from({ length: BUSCA_MAX }, () => tx())
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: muitas, totalCount: 500 } as never)
    const r = await buscarTransacoes.executar!(ctx, { inicio: '2026-01-01', fim: '2026-09-30' })
    expect(r).toContain('INCOMPLETO')
    expect(r.split('\n').filter((l) => l.startsWith('- ')).length).toBe(30)
  })

  it('nada encontrado diz isso', async () => {
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: [], totalCount: 0 } as never)
    expect(await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30' }))
      .toBe('Nenhum lançamento confirmado encontrado com esses filtros.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/buscar-transacoes.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/consultor/ferramentas/buscar-transacoes.ts
import { z } from 'zod'
import { getTransactionsWithCount } from '@/lib/finance/queries-transactions'
import { getCategories } from '@/lib/finance/queries-categories'
import { getAccounts } from '@/lib/finance/queries-accounts'
import type { Ferramenta } from './tipos'
import { LIMITE_LINHAS, dataISO, dataSchema, intervaloDeDatas, normalizar, reais, validar } from './utils'

/** Teto da consulta. O total só é exato abaixo dele. */
export const BUSCA_MAX = 200

const Params = z.object({
  inicio: dataSchema,
  fim: dataSchema,
  texto: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  conta: z.string().min(1).optional(),
})

function idsQueCasam(itens: { id: string; name: string }[], trecho: string): string[] {
  const alvo = normalizar(trecho)
  return itens.filter((i) => normalizar(i.name).includes(alvo)).map((i) => i.id)
}

export const buscarTransacoes: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'buscar_transacoes',
    description:
      'Lançamentos confirmados de um período, com filtros opcionais por texto da descrição (ex.: "ifood"), ' +
      'categoria e conta (trechos do nome). Devolve totais e os 30 mais recentes.',
    inputSchema: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
        fim: { type: 'string', description: 'Data final YYYY-MM-DD (inclusiva)' },
        texto: { type: 'string', description: 'Trecho da descrição do lançamento' },
        categoria: { type: 'string', description: 'Trecho do nome da categoria' },
        conta: { type: 'string', description: 'Trecho do nome da conta' },
      },
      required: ['inicio', 'fim'],
    },
  },
  async executar(ctx, params) {
    const p = validar(Params, params)
    intervaloDeDatas(p.inicio, p.fim)

    let categoryIds: string | undefined
    if (p.categoria) {
      const ids = idsQueCasam(await getCategories(ctx.orgId), p.categoria)
      if (ids.length === 0) return `Nenhuma categoria parecida com "${p.categoria}".`
      categoryIds = ids.join(',')
    }
    let accountId: string | undefined
    if (p.conta) {
      const ids = idsQueCasam(await getAccounts(ctx.orgId), p.conta)
      if (ids.length === 0) return `Nenhuma conta parecida com "${p.conta}".`
      accountId = ids.join(',')
    }

    const { transactions: linhas } = await getTransactionsWithCount(ctx.orgId, {
      startDate: p.inicio, endDate: p.fim, search: p.texto, categoryIds, accountId, limit: BUSCA_MAX,
    })
    const validas = linhas.filter((t) => t.reviewState === 'confirmed' && !t.isIgnored)
    if (validas.length === 0) return 'Nenhum lançamento confirmado encontrado com esses filtros.'

    const soma = (tipo: string) => validas.filter((t) => t.type === tipo).reduce((s, t) => s + Math.abs(t.amountCents), 0)
    const cortada = linhas.length >= BUSCA_MAX
    return [
      cortada
        ? `INCOMPLETO: a busca parou em ${BUSCA_MAX} lançamentos; os totais abaixo são parciais. Refine período ou filtros antes de citar total.`
        : `${validas.length} lançamentos.`,
      `Total de despesas: ${reais(soma('expense'))}`,
      `Total de receitas: ${reais(soma('income'))}`,
      ...validas.slice(0, LIMITE_LINHAS).map(
        (t) => `- ${dataISO(t.date)} | ${t.description} | ${reais(t.amountCents)} | ${t.categoryName ?? 'Sem categoria'}`,
      ),
      ...(validas.length > LIMITE_LINHAS ? [`(mostrando os ${LIMITE_LINHAS} mais recentes)`] : []),
    ].join('\n')
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/buscar-transacoes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/ferramentas/buscar-transacoes.ts apps/web/__tests__/consultor/buscar-transacoes.test.ts
git commit -m "feat(consultor): ferramenta buscar_transacoes"
```

---

### Task 5: `plano_do_mes` (gastos e investimentos) e registro das ferramentas

**Files:**
- Create: `apps/web/lib/consultor/ferramentas/plano-do-mes.ts`
- Create: `apps/web/lib/consultor/ferramentas/index.ts`
- Test: `apps/web/__tests__/consultor/plano-do-mes.test.ts`

**Interfaces:**
- Consumes: Task 2 utils; `getBudgetEntriesForMonth(orgId, monthStart, type)`, `getSpendingByCategory`, `getInvestmentContributions(orgId, start, end): Promise<number>` de `@/lib/finance/budget-queries`; `buscarOcorrenciasDeRecorrentes(db, orgId, start, end)` de `@/lib/finance/recurring-budget-queries`; `combinarMetasDoMes`, `somarRecorrentesPorCategoria` de `@/lib/finance/recurring-budget` (mesmo caminho de `lib/cfo/budget-pacing-input.ts`, sem sessão); `getDb` de `@floow/db`; `CHAT_TOOLS` de `@/lib/cfo/chat-tools`.
- Produces: `planoDoMes: Ferramenta` (`plano_do_mes`, params `{ mes, tipo: 'spending' | 'investing' }`); `FERRAMENTAS: Ferramenta[]` (as 5 de leitura + as 4 de `CHAT_TOOLS` como `tipo: 'sugestao'`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/consultor/plano-do-mes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@floow/db', () => ({ getDb: vi.fn(() => 'db') }))
vi.mock('@/lib/finance/budget-queries', () => ({
  getBudgetEntriesForMonth: vi.fn(), getSpendingByCategory: vi.fn(), getInvestmentContributions: vi.fn(),
}))
vi.mock('@/lib/finance/recurring-budget-queries', () => ({ buscarOcorrenciasDeRecorrentes: vi.fn() }))
vi.mock('@/lib/finance/recurring-budget', () => ({
  somarRecorrentesPorCategoria: vi.fn(() => 'somadas'),
  combinarMetasDoMes: vi.fn(),
}))
vi.mock('@/lib/finance/queries-categories', () => ({ getCategories: vi.fn() }))

import * as bq from '@/lib/finance/budget-queries'
import { buscarOcorrenciasDeRecorrentes } from '@/lib/finance/recurring-budget-queries'
import { combinarMetasDoMes } from '@/lib/finance/recurring-budget'
import { getCategories } from '@/lib/finance/queries-categories'
import { planoDoMes } from '@/lib/consultor/ferramentas/plano-do-mes'
import { reais } from '@/lib/consultor/ferramentas/utils'

const ctx = { orgId: 'org-1', userId: 'u1' }
const inicio = new Date(2026, 9, 1)
const fim = new Date(2026, 10, 0)

beforeEach(() => vi.clearAllMocks())

describe('plano_do_mes — gastos', () => {
  beforeEach(() => {
    vi.mocked(bq.getBudgetEntriesForMonth).mockResolvedValue([{ id: 'e1', categoryId: 'c1', plannedCents: 80000 }] as never)
    vi.mocked(buscarOcorrenciasDeRecorrentes).mockResolvedValue([] as never)
    vi.mocked(combinarMetasDoMes).mockReturnValue([
      { entryId: 'e1', categoryId: 'c1', plannedCents: 80000 },
      { entryId: null, categoryId: 'c2', plannedCents: 20000 },
    ] as never)
    vi.mocked(bq.getSpendingByCategory).mockResolvedValue([
      { categoryId: 'c1', spent: 90000 },
      { categoryId: 'c2', spent: 5000 },
      { categoryId: 'c3', spent: 7000 },
    ])
    vi.mocked(getCategories).mockResolvedValue([
      { id: 'c1', name: 'Mercado' }, { id: 'c2', name: 'Lazer' }, { id: 'c3', name: 'Presentes' },
    ] as never)
  })

  it('usa o mesmo caminho da tela (metas + recorrentes) para a org do contexto', async () => {
    await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'spending' })
    expect(bq.getBudgetEntriesForMonth).toHaveBeenCalledWith('org-1', inicio, 'spending')
    expect(buscarOcorrenciasDeRecorrentes).toHaveBeenCalledWith('db', 'org-1', inicio, fim)
    expect(bq.getSpendingByCategory).toHaveBeenCalledWith('org-1', inicio, fim)
  })

  it('mostra planejado × gasto, estouro e gasto fora do plano', async () => {
    const r = await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'spending' })
    expect(r).toContain(`Mercado: planejado ${reais(80000)}, gasto ${reais(90000)}, estourou ${reais(10000)}`)
    expect(r).toContain(`Lazer: planejado ${reais(20000)}, gasto ${reais(5000)}, resta ${reais(15000)}`)
    expect(r).toContain(`Gasto fora do plano: ${reais(7000)}`)
  })

  it('sem plano diz isso', async () => {
    vi.mocked(combinarMetasDoMes).mockReturnValue([] as never)
    expect(await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'spending' })).toContain('Nenhum plano de gastos para 2026-10')
  })
})

describe('plano_do_mes — investimentos', () => {
  it('soma a meta do mês e compara com o aportado', async () => {
    vi.mocked(bq.getBudgetEntriesForMonth).mockResolvedValue([
      { id: 'i1', name: 'Aporte mensal', plannedCents: 100000 },
      { id: 'i2', name: null, plannedCents: 50000 },
    ] as never)
    vi.mocked(bq.getInvestmentContributions).mockResolvedValue(60000)
    const r = await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'investing' })
    expect(bq.getBudgetEntriesForMonth).toHaveBeenCalledWith('org-1', inicio, 'investing')
    expect(r).toContain(`Aporte mensal: ${reais(100000)}`)
    expect(r).toContain(`Aportes: ${reais(50000)}`)
    expect(r).toContain(`Aportado: ${reais(60000)}`)
    expect(r).toContain(`Falta: ${reais(90000)}`)
  })

  it('sem meta ainda informa o aportado', async () => {
    vi.mocked(bq.getBudgetEntriesForMonth).mockResolvedValue([] as never)
    vi.mocked(bq.getInvestmentContributions).mockResolvedValue(1000)
    expect(await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'investing' }))
      .toBe(`Nenhuma meta de investimento para 2026-10. Aportado no mês: ${reais(1000)}.`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/plano-do-mes.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/consultor/ferramentas/plano-do-mes.ts
import { z } from 'zod'
import { getDb } from '@floow/db'
import { getBudgetEntriesForMonth, getInvestmentContributions, getSpendingByCategory } from '@/lib/finance/budget-queries'
import { buscarOcorrenciasDeRecorrentes } from '@/lib/finance/recurring-budget-queries'
import { combinarMetasDoMes, somarRecorrentesPorCategoria } from '@/lib/finance/recurring-budget'
import { getCategories } from '@/lib/finance/queries-categories'
import type { ContextoFerramenta, Ferramenta } from './tipos'
import { LIMITE_LINHAS, intervaloDoMes, mesSchema, reais, validar } from './utils'

const Params = z.object({ mes: mesSchema, tipo: z.enum(['spending', 'investing']) })

async function planoDeInvestimentos(ctx: ContextoFerramenta, mes: string): Promise<string> {
  const { inicio, fim } = intervaloDoMes(mes)
  const [linhas, aportado] = await Promise.all([
    getBudgetEntriesForMonth(ctx.orgId, inicio, 'investing'),
    getInvestmentContributions(ctx.orgId, inicio, fim),
  ])
  if (linhas.length === 0) return `Nenhuma meta de investimento para ${mes}. Aportado no mês: ${reais(aportado)}.`
  const meta = linhas.reduce((s, l) => s + l.plannedCents, 0)
  return [
    `Meta de investimentos de ${mes}:`,
    ...linhas.map((l) => `- ${l.name ?? 'Aportes'}: ${reais(l.plannedCents)}`),
    `Meta total: ${reais(meta)}`,
    `Aportado: ${reais(aportado)}`,
    `Falta: ${reais(Math.max(0, meta - aportado))}`,
  ].join('\n')
}

/**
 * Metas + recorrentes-meta, pelo mesmo caminho do motor CFO
 * (`lib/cfo/budget-pacing-input.ts`): conexão de serviço, sem sessão.
 */
async function planoDeGastos(ctx: ContextoFerramenta, mes: string): Promise<string> {
  const { inicio, fim } = intervaloDoMes(mes)
  const [manuais, ocorrencias, gastos, categorias] = await Promise.all([
    getBudgetEntriesForMonth(ctx.orgId, inicio, 'spending'),
    buscarOcorrenciasDeRecorrentes(getDb(), ctx.orgId, inicio, fim),
    getSpendingByCategory(ctx.orgId, inicio, fim),
    getCategories(ctx.orgId),
  ])
  const plano = combinarMetasDoMes(
    manuais.map((e) => ({ id: e.id, categoryId: e.categoryId, plannedCents: e.plannedCents })),
    somarRecorrentesPorCategoria(ocorrencias),
  )
  if (plano.length === 0) return `Nenhum plano de gastos para ${mes}.`

  const nomePorId = new Map(categorias.map((c) => [c.id, c.name]))
  const gastoPor = new Map(gastos.map((g) => [g.categoryId, g.spent]))
  const noPlano = new Set(plano.map((l) => l.categoryId))
  const linhas = plano.map((l) => {
    const gasto = gastoPor.get(l.categoryId) ?? 0
    const nome = (l.categoryId && nomePorId.get(l.categoryId)) || 'Sem categoria'
    const saldo = gasto > l.plannedCents ? `estourou ${reais(gasto - l.plannedCents)}` : `resta ${reais(l.plannedCents - gasto)}`
    return { gasto, texto: `- ${nome}: planejado ${reais(l.plannedCents)}, gasto ${reais(gasto)}, ${saldo}` }
  })
  const planejado = plano.reduce((s, l) => s + l.plannedCents, 0)
  const gastoNoPlano = linhas.reduce((s, l) => s + l.gasto, 0)
  const fora = gastos.filter((g) => !noPlano.has(g.categoryId)).reduce((s, g) => s + g.spent, 0)
  return [
    `Plano de gastos de ${mes}:`,
    ...linhas.slice(0, LIMITE_LINHAS).map((l) => l.texto),
    `Total planejado: ${reais(planejado)}; gasto nas categorias do plano: ${reais(gastoNoPlano)}`,
    `Gasto fora do plano: ${reais(fora)}`,
  ].join('\n')
}

export const planoDoMes: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'plano_do_mes',
    description:
      'Plano do mês. tipo "spending" = Plano de Gastos (planejado × gasto por categoria); ' +
      'tipo "investing" = Meta de Investimentos (meta × aportado).',
    inputSchema: {
      type: 'object',
      properties: {
        mes: { type: 'string', description: 'Mês no formato YYYY-MM' },
        tipo: { type: 'string', enum: ['spending', 'investing'] },
      },
      required: ['mes', 'tipo'],
    },
  },
  async executar(ctx, params) {
    const { mes, tipo } = validar(Params, params)
    return tipo === 'investing' ? planoDeInvestimentos(ctx, mes) : planoDeGastos(ctx, mes)
  },
}
```

```ts
// apps/web/lib/consultor/ferramentas/index.ts
import { CHAT_TOOLS } from '@/lib/cfo/chat-tools'
import type { Ferramenta } from './tipos'
import { saldosDasContas } from './saldos-das-contas'
import { resumoDoMes } from './resumo-do-mes'
import { gastosPorCategoria } from './gastos-por-categoria'
import { buscarTransacoes } from './buscar-transacoes'
import { planoDoMes } from './plano-do-mes'

/** As ações antigas viram botão na web até a fase 2 trocar por ação pendente. */
const SUGESTOES: Ferramenta[] = CHAT_TOOLS.map((definicao) => ({ definicao, tipo: 'sugestao' as const }))

export const FERRAMENTAS: Ferramenta[] = [
  resumoDoMes,
  gastosPorCategoria,
  buscarTransacoes,
  planoDoMes,
  saldosDasContas,
  ...SUGESTOES,
]
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/consultor && pnpm typecheck`
Expected: PASS; typecheck sem erro (se `combinarMetasDoMes` exigir outro formato de entrada, ajustar o `map` ao tipo que o typecheck apontar — o de `budget-pacing-input.ts` passa `{ id, categoryId, plannedCents }`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/ferramentas/plano-do-mes.ts apps/web/lib/consultor/ferramentas/index.ts apps/web/__tests__/consultor/plano-do-mes.test.ts
git commit -m "feat(consultor): ferramenta plano_do_mes e registro das ferramentas"
```

---

### Task 6: O laço do agente e o limite de uso

**Files:**
- Create: `apps/web/lib/consultor/agente.ts`
- Create: `apps/web/lib/consultor/limite.ts`
- Test: `apps/web/__tests__/consultor/agente.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `ChatProvider`, `ToolCall`, `ToolResultBlock` de `@floow/core-finance` (Task 1); `Ferramenta`, `ParametroInvalido` (Task 2); `consumeRateLimit(db, { bucket, subject, limit, windowSeconds })` de `@/lib/rate-limit/consume` (→ `{ allowed, remaining, retryAfterSeconds }`).
- Produces:
  - `limite.ts`: `type ResultadoDoLimite = { allowed: true } | { allowed: false; retryAfterSeconds: number }`; `consumirLimiteDoConsultor(orgId: string): Promise<ResultadoDoLimite>`
  - `agente.ts`: `MAX_RODADAS = 5`; `TEXTO_SEM_CONCLUSAO`; `interface EntradaDoAgente { orgId; userId; historico: ChatMessage[]; mensagem: string; system: string; onTexto?: (t: string) => void; onSugestao?: (c: ToolCall) => void }`; `interface DepsDoAgente { provider: Pick<ChatProvider, 'streamChat'>; ferramentas: Ferramenta[]; consumirLimite: (orgId: string) => Promise<ResultadoDoLimite>; log?: (msg: string, err?: unknown) => void }`; `type RespostaDoAgente = { tipo: 'ok'; texto: string; sugestoes: ToolCall[] } | { tipo: 'limite'; texto: string; retryAfterSeconds: number }`; `responder(e: EntradaDoAgente, deps: DepsDoAgente): Promise<RespostaDoAgente>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/consultor/agente.test.ts
import { describe, it, expect, vi } from 'vitest'
import type { ChatMessage, ToolCall } from '@floow/core-finance'
import { responder, MAX_RODADAS, TEXTO_SEM_CONCLUSAO, type DepsDoAgente } from '@/lib/consultor/agente'
import { ParametroInvalido, type Ferramenta } from '@/lib/consultor/ferramentas/tipos'

type Rodada = { texto?: string; calls?: ToolCall[] }

function providerFalso(rodadas: Rodada[]) {
  const recebidas: ChatMessage[][] = []
  const streamChat = vi.fn(async (msgs: ChatMessage[], opts: { onChunk: (c: { type: 'text'; text: string }) => void }) => {
    recebidas.push(structuredClone(msgs))
    const r = rodadas.shift() ?? { texto: 'fim' }
    if (r.texto) opts.onChunk({ type: 'text', text: r.texto })
    return { content: r.texto ?? '', toolCalls: r.calls ?? [] }
  })
  return { streamChat, recebidas }
}

const leitura = (executar: Ferramenta['executar']): Ferramenta => ({
  tipo: 'leitura', executar,
  definicao: { name: 'saldos_das_contas', description: 'x', inputSchema: { type: 'object', properties: {} } },
})
const sugestao: Ferramenta = { tipo: 'sugestao', definicao: { name: 'create_budget', description: 'x', inputSchema: { type: 'object' } } }

function deps(provider: ReturnType<typeof providerFalso>, ferramentas: Ferramenta[] = [], over: Partial<DepsDoAgente> = {}): DepsDoAgente {
  return { provider, ferramentas, consumirLimite: vi.fn(async () => ({ allowed: true as const })), log: vi.fn(), ...over }
}
const entrada = { orgId: 'org-1', userId: 'u1', historico: [] as ChatMessage[], mensagem: 'quanto tenho?', system: 'sys' }
const call = (name = 'saldos_das_contas', id = 't1'): ToolCall => ({ id, name, params: {} })

describe('responder', () => {
  it('sem ferramenta: uma chamada e devolve o texto', async () => {
    const p = providerFalso([{ texto: 'Oi!' }])
    const r = await responder(entrada, deps(p))
    expect(r).toEqual({ tipo: 'ok', texto: 'Oi!', sugestoes: [] })
    expect(p.streamChat).toHaveBeenCalledTimes(1)
    expect(p.recebidas[0].at(-1)).toMatchObject({ role: 'user', content: 'quanto tenho?' })
  })

  it('ferramenta de leitura: executa com a org do contexto e devolve o resultado ao Claude', async () => {
    const executar = vi.fn(async () => 'Total: R$ 10')
    const p = providerFalso([{ calls: [call()] }, { texto: 'Você tem R$ 10.' }])
    const r = await responder(entrada, deps(p, [leitura(executar)]))
    expect(executar).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'u1' }, {})
    const segunda = p.recebidas[1]
    expect(segunda.at(-2)).toMatchObject({ role: 'assistant', toolCalls: [call()] })
    expect(segunda.at(-1)).toMatchObject({ role: 'tool_result', toolResults: [{ toolUseId: 't1', content: 'Total: R$ 10' }] })
    expect(r).toMatchObject({ tipo: 'ok', texto: 'Você tem R$ 10.' })
  })

  it('ferramenta que quebra: tool_result com erro genérico, log, e o laço segue', async () => {
    const log = vi.fn()
    const p = providerFalso([{ calls: [call()] }, { texto: 'Não consegui ver agora.' }])
    await responder(entrada, deps(p, [leitura(async () => { throw new Error('db caiu') })], { log }))
    const bloco = p.recebidas[1].at(-1)!.toolResults![0]
    expect(bloco.isError).toBe(true)
    expect(bloco.content).not.toContain('db caiu')
    expect(log).toHaveBeenCalled()
  })

  it('parâmetro inválido volta ao Claude com a explicação', async () => {
    const p = providerFalso([{ calls: [call()] }, { texto: 'ok' }])
    await responder(entrada, deps(p, [leitura(async () => { throw new ParametroInvalido('mes: use o formato YYYY-MM') })]))
    const bloco = p.recebidas[1].at(-1)!.toolResults![0]
    expect(bloco).toMatchObject({ isError: true })
    expect(bloco.content).toContain('mes: use o formato YYYY-MM')
  })

  it('ferramenta desconhecida vira erro para o Claude', async () => {
    const p = providerFalso([{ calls: [call('apagar_tudo')] }, { texto: 'ok' }])
    await responder(entrada, deps(p))
    expect(p.recebidas[1].at(-1)!.toolResults![0]).toMatchObject({ isError: true })
  })

  it('sugestão não executa: vai para o cliente e o Claude sabe que não foi feita', async () => {
    const onSugestao = vi.fn()
    const c = call('create_budget')
    const p = providerFalso([{ texto: 'Sugiro um teto.', calls: [c] }, { texto: 'Clique para criar.' }])
    const r = await responder({ ...entrada, onSugestao }, deps(p, [sugestao]))
    expect(onSugestao).toHaveBeenCalledWith(c)
    expect(r).toMatchObject({ tipo: 'ok', sugestoes: [c] })
    expect(p.recebidas[1].at(-1)!.toolResults![0].content).toContain('Não diga que já foi feito')
  })

  it('texto de rodadas diferentes sai separado por linha em branco, também no streaming', async () => {
    const pedacos: string[] = []
    const p = providerFalso([{ texto: 'Vou olhar.', calls: [call()] }, { texto: 'Pronto.' }])
    const r = await responder({ ...entrada, onTexto: (t) => pedacos.push(t) }, deps(p, [leitura(async () => 'x')]))
    expect(r).toMatchObject({ texto: 'Vou olhar.\n\nPronto.' })
    expect(pedacos.join('')).toBe('Vou olhar.\n\nPronto.')
  })

  it('estouro de rodadas: para em MAX_RODADAS e avisa, mantendo o texto já escrito', async () => {
    const pedacos: string[] = []
    const rodadas = Array.from({ length: 10 }, (_, i) => ({ texto: i === 0 ? 'Analisando.' : undefined, calls: [call('saldos_das_contas', `t${i}`)] }))
    const p = providerFalso(rodadas)
    const r = await responder({ ...entrada, onTexto: (t) => pedacos.push(t) }, deps(p, [leitura(async () => 'x')]))
    expect(p.streamChat).toHaveBeenCalledTimes(MAX_RODADAS)
    expect(r).toMatchObject({ tipo: 'ok', texto: `Analisando.\n\n${TEXTO_SEM_CONCLUSAO}` })
    expect(pedacos.join('')).toBe(`Analisando.\n\n${TEXTO_SEM_CONCLUSAO}`)
  })

  it('limite estourado: não chama o Claude', async () => {
    const p = providerFalso([])
    const r = await responder(entrada, deps(p, [], { consumirLimite: vi.fn(async () => ({ allowed: false as const, retryAfterSeconds: 42 })) }))
    expect(r).toEqual({ tipo: 'limite', retryAfterSeconds: 42, texto: 'Limite de uso do consultor atingido. Tente de novo em 42s.' })
    expect(p.streamChat).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/agente.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/consultor/limite.ts
import { getDb } from '@floow/db'
import { consumeRateLimit } from '@/lib/rate-limit/consume'

/** Rajada: segura o laço. Teto horário: segura o uso sustentado. Vale para todo canal. */
const BURST = Number(process.env.CFO_CHAT_BURST_LIMIT ?? 8)
const HOURLY = Number(process.env.CFO_CHAT_HOURLY_LIMIT ?? 30)

export type ResultadoDoLimite = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export async function consumirLimiteDoConsultor(orgId: string): Promise<ResultadoDoLimite> {
  const db = getDb()
  for (const janela of [
    { bucket: 'cfo.chat.burst', limit: BURST, windowSeconds: 60 },
    { bucket: 'cfo.chat.hour', limit: HOURLY, windowSeconds: 3600 },
  ]) {
    const r = await consumeRateLimit(db, { ...janela, subject: orgId })
    if (!r.allowed) return { allowed: false, retryAfterSeconds: r.retryAfterSeconds }
  }
  return { allowed: true }
}
```

```ts
// apps/web/lib/consultor/agente.ts
/**
 * O Consultor: um laço Claude ⇄ ferramentas, igual para todo canal.
 *
 * Leitura roda aqui e o resultado volta ao Claude. Sugestão (ações antigas da
 * web) não roda: vai ao canal como botão. O canal cuida de histórico,
 * persistência e formato de saída; o agente, de limite, laço e ferramentas.
 */
import type { ChatMessage, ChatProvider, ToolCall, ToolResultBlock } from '@floow/core-finance'
import { ParametroInvalido, type ContextoFerramenta, type Ferramenta } from './ferramentas/tipos'
import type { ResultadoDoLimite } from './limite'

export const MAX_RODADAS = 5
export const TEXTO_SEM_CONCLUSAO = 'Não consegui concluir essa análise. Tente perguntar de forma mais específica.'

export interface EntradaDoAgente {
  orgId: string
  userId: string
  /** Só texto (ver `historicoParaOAgente`). */
  historico: ChatMessage[]
  mensagem: string
  system: string
  onTexto?: (texto: string) => void
  onSugestao?: (call: ToolCall) => void
}

export interface DepsDoAgente {
  provider: Pick<ChatProvider, 'streamChat'>
  ferramentas: Ferramenta[]
  consumirLimite: (orgId: string) => Promise<ResultadoDoLimite>
  log?: (msg: string, err?: unknown) => void
}

export type RespostaDoAgente =
  | { tipo: 'ok'; texto: string; sugestoes: ToolCall[] }
  | { tipo: 'limite'; texto: string; retryAfterSeconds: number }

const agora = () => new Date().toISOString()

export async function responder(e: EntradaDoAgente, deps: DepsDoAgente): Promise<RespostaDoAgente> {
  const limite = await deps.consumirLimite(e.orgId)
  if (!limite.allowed) {
    return {
      tipo: 'limite',
      retryAfterSeconds: limite.retryAfterSeconds,
      texto: `Limite de uso do consultor atingido. Tente de novo em ${limite.retryAfterSeconds}s.`,
    }
  }

  const porNome = new Map(deps.ferramentas.map((f) => [f.definicao.name, f]))
  const tools = deps.ferramentas.map((f) => f.definicao)
  const ctx: ContextoFerramenta = { orgId: e.orgId, userId: e.userId }
  const conversa: ChatMessage[] = [
    ...e.historico,
    { id: crypto.randomUUID(), role: 'user', content: e.mensagem, createdAt: agora() },
  ]
  const sugestoes: ToolCall[] = []
  let texto = ''
  let separar = false

  const emitir = (t: string) => {
    if (separar) {
      texto += '\n\n'
      e.onTexto?.('\n\n')
      separar = false
    }
    texto += t
    e.onTexto?.(t)
  }

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const r = await deps.provider.streamChat(conversa, {
      system: e.system,
      tools,
      onChunk: (c) => {
        if (c.type === 'text' && c.text) emitir(c.text)
      },
    })
    if (texto) separar = true
    if (r.toolCalls.length === 0) return { tipo: 'ok', texto, sugestoes }

    conversa.push({ id: crypto.randomUUID(), role: 'assistant', content: r.content, toolCalls: r.toolCalls, createdAt: agora() })
    const resultados: ToolResultBlock[] = []
    for (const call of r.toolCalls) resultados.push(await executar(call, porNome, ctx, sugestoes, e, deps))
    conversa.push({ id: crypto.randomUUID(), role: 'tool_result', content: '', toolResults: resultados, createdAt: agora() })
  }

  deps.log?.(`[consultor] estourou ${MAX_RODADAS} rodadas (org ${e.orgId})`)
  emitir(TEXTO_SEM_CONCLUSAO)
  return { tipo: 'ok', texto, sugestoes }
}

async function executar(
  call: ToolCall,
  porNome: Map<string, Ferramenta>,
  ctx: ContextoFerramenta,
  sugestoes: ToolCall[],
  e: EntradaDoAgente,
  deps: DepsDoAgente,
): Promise<ToolResultBlock> {
  const f = porNome.get(call.name)
  if (!f) return { toolUseId: call.id, content: `Ferramenta "${call.name}" não existe.`, isError: true }

  if (f.tipo === 'sugestao' || !f.executar) {
    sugestoes.push(call)
    e.onSugestao?.(call)
    return { toolUseId: call.id, content: 'Mostrado ao usuário como botão; ele decide se executa. Não diga que já foi feito.' }
  }

  try {
    return { toolUseId: call.id, content: await f.executar(ctx, call.params) }
  } catch (err) {
    if (err instanceof ParametroInvalido) {
      return { toolUseId: call.id, content: `Parâmetros inválidos: ${err.message}`, isError: true }
    }
    deps.log?.(`[consultor] ferramenta ${call.name} falhou`, err)
    return {
      toolUseId: call.id,
      content: 'Erro ao consultar os dados. Diga ao usuário que não conseguiu buscar essa informação agora.',
      isError: true,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/agente.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/agente.ts apps/web/lib/consultor/limite.ts apps/web/__tests__/consultor/agente.test.ts
git commit -m "feat(consultor): laço do agente com ferramentas e limite de uso"
```

---

### Task 7: Prompt, histórico e migração do /api/cfo/chat

**Files:**
- Create: `apps/web/lib/consultor/prompt.ts` (puro)
- Create: `apps/web/lib/consultor/prompt-dados.ts` (carrega do banco)
- Create: `apps/web/lib/consultor/historico.ts`
- Modify: `apps/web/app/api/cfo/chat/route.ts` (reescrita)
- Delete: `apps/web/lib/cfo/chat-context.ts` (só o route usava)
- Test: `apps/web/__tests__/consultor/prompt-e-historico.test.ts`

**Interfaces:**
- Consumes: `responder`, `DepsDoAgente` (Task 6); `FERRAMENTAS` (Task 5); `consumirLimiteDoConsultor` (Task 6); `getAccounts`, `getCategories`; `cfoInsights`, `getDb` de `@floow/db`; `createAnthropicProvider({ apiKey, model })`.
- Produces: `interface DadosDoPrompt { canal: 'web' | 'whatsapp'; hoje: string; contas: string[]; categorias: string[]; insights: { severity: string; title: string; body: string }[]; insight?: { type: string; severity: string; title: string; body: string; metric?: unknown } }`; `montarPrompt(d: DadosDoPrompt): string`; `carregarDadosDoPrompt(orgId, canal, insight?): Promise<DadosDoPrompt>`; `historicoParaOAgente(msgs: ChatMessage[]): ChatMessage[]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/consultor/prompt-e-historico.test.ts
import { describe, it, expect } from 'vitest'
import type { ChatMessage } from '@floow/core-finance'
import { montarPrompt, type DadosDoPrompt } from '@/lib/consultor/prompt'
import { historicoParaOAgente } from '@/lib/consultor/historico'

const dados: DadosDoPrompt = {
  canal: 'web', hoje: '2026-09-28',
  contas: ['Itaú', 'Nubank'], categorias: ['Mercado', 'Lazer'],
  insights: [{ severity: 'warning', title: 'Delivery alto', body: 'Subiu 40%' }],
}

describe('montarPrompt', () => {
  it('traz a data de hoje, contas, categorias e insights', () => {
    const p = montarPrompt(dados)
    expect(p).toContain('Hoje é 2026-09-28')
    expect(p).toContain('Itaú, Nubank')
    expect(p).toContain('Mercado, Lazer')
    expect(p).toContain('[warning] Delivery alto: Subiu 40%')
  })

  it('exige que todo número venha de ferramenta', () => {
    expect(montarPrompt(dados)).toContain('Todo número que você citar vem de uma ferramenta')
  })

  it('formato muda com o canal', () => {
    expect(montarPrompt(dados)).toContain('markdown')
    expect(montarPrompt({ ...dados, canal: 'whatsapp' })).toContain('*negrito*')
    expect(montarPrompt({ ...dados, canal: 'whatsapp' })).not.toContain('markdown')
  })

  it('insight em discussão entra com os dados', () => {
    const p = montarPrompt({ ...dados, insight: { type: 't', severity: 'critical', title: 'Caixa negativo', body: 'b', metric: { x: 1 } } })
    expect(p).toContain('## Insight em discussão')
    expect(p).toContain('Caixa negativo')
    expect(p).toContain('{"x":1}')
  })
})

describe('historicoParaOAgente', () => {
  const m = (role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ id: crypto.randomUUID(), role, content, createdAt: '2026-09-28T00:00:00Z', ...extra })

  it('fica só com texto de usuário e assistente, sem tool_result nem tool_call antigos', () => {
    const r = historicoParaOAgente([
      m('user', 'cria orçamento'),
      m('assistant', 'Sugiro R$ 500', { toolCall: { id: 't', name: 'create_budget', params: {} } }),
      m('tool_result', 'Orçamento criado', { toolCall: { id: 't', name: 'create_budget', params: {} } }),
      m('assistant', ''),
      m('user', 'valeu'),
    ])
    expect(r.map((x) => [x.role, x.content])).toEqual([
      ['user', 'cria orçamento'],
      ['assistant', 'Sugiro R$ 500'],
      ['user', 'valeu'],
    ])
    expect(r[1].toolCall).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/prompt-e-historico.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implement prompt, dados e histórico**

```ts
// apps/web/lib/consultor/prompt.ts
export interface DadosDoPrompt {
  canal: 'web' | 'whatsapp'
  /** YYYY-MM-DD em São Paulo. */
  hoje: string
  contas: string[]
  categorias: string[]
  insights: { severity: string; title: string; body: string }[]
  insight?: { type: string; severity: string; title: string; body: string; metric?: unknown }
}

const BASE = `Você é o Consultor Financeiro pessoal do usuário no floow. Você consulta os dados financeiros dele com as ferramentas e o ajuda a decidir melhor.

Regras:
- Todo número que você citar vem de uma ferramenta chamada nesta conversa. Se nenhuma ferramenta trouxe o dado, diga que não tem essa informação — nunca estime nem invente.
- Antes de opinar sobre um gasto ou uma decisão, consulte o plano do mês e compare com meses anteriores.
- Converta períodos relativos ("esse mês", "mês passado", "últimos 3 meses") em datas explícitas a partir de hoje.
- Se uma ferramenta avisar que o resultado está INCOMPLETO, não cite o total como exato.
- Para sugerir ação (criar ou ajustar orçamento, ver transações, ver conta), use as ferramentas de ação: elas viram um botão e o usuário decide. Não diga que a ação já foi feita.
- Seja direto, tom firme e empático, como um amigo que entende de finanças. Máximo de 3 parágrafos curtos.
- Responda sempre em português brasileiro.`

const FORMATO: Record<DadosDoPrompt['canal'], string> = {
  web: 'Formato: pode usar markdown simples (negrito, listas).',
  whatsapp: 'Formato WhatsApp: use *negrito* e listas com "-"; sem títulos, tabelas ou links em markdown.',
}

export function montarPrompt(d: DadosDoPrompt): string {
  const partes = [
    BASE,
    FORMATO[d.canal],
    `Hoje é ${d.hoje}.`,
    `## Contas ativas\n${d.contas.join(', ') || 'nenhuma'}`,
    `## Categorias\n${d.categorias.join(', ') || 'nenhuma'}`,
  ]
  if (d.insights.length) {
    partes.push(`## Insights ativos\n${d.insights.map((i) => `- [${i.severity}] ${i.title}: ${i.body}`).join('\n')}`)
  }
  if (d.insight) {
    const i = d.insight
    partes.push(
      [
        '## Insight em discussão',
        `- Tipo: ${i.type}`,
        `- Severidade: ${i.severity}`,
        `- ${i.title}: ${i.body}`,
        ...(i.metric ? [`- Dados: ${JSON.stringify(i.metric)}`] : []),
      ].join('\n'),
    )
  }
  return partes.join('\n\n')
}
```

```ts
// apps/web/lib/consultor/prompt-dados.ts
import { getDb, cfoInsights, type CfoInsight } from '@floow/db'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { getAccounts } from '@/lib/finance/queries-accounts'
import { getCategories } from '@/lib/finance/queries-categories'
import type { DadosDoPrompt } from './prompt'

/** Nomes de contas e categorias vão no prompt para o Claude acertar os filtros das ferramentas. */
export async function carregarDadosDoPrompt(
  orgId: string,
  canal: DadosDoPrompt['canal'],
  insight?: CfoInsight,
): Promise<DadosDoPrompt> {
  const db = getDb()
  const [contas, categorias, insights] = await Promise.all([
    getAccounts(orgId),
    getCategories(orgId),
    db
      .select({ severity: cfoInsights.severity, title: cfoInsights.title, body: cfoInsights.body })
      .from(cfoInsights)
      .where(and(eq(cfoInsights.orgId, orgId), isNull(cfoInsights.dismissedAt), gt(cfoInsights.expiresAt, sql`now()`)))
      .orderBy(desc(cfoInsights.generatedAt))
      .limit(5),
  ])
  return {
    canal,
    hoje: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    contas: contas.map((c) => c.name),
    categorias: categorias.map((c) => c.name),
    insights,
    insight: insight
      ? { type: insight.type, severity: insight.severity, title: insight.title, body: insight.body, metric: insight.metric ?? undefined }
      : undefined,
  }
}
```

```ts
// apps/web/lib/consultor/historico.ts
import type { ChatMessage } from '@floow/core-finance'

/**
 * Histórico salvo → o que o agente reenvia ao Claude: só texto.
 *
 * As rodadas de ferramenta não são salvas, e o tool_result antigo (clique no
 * botão) não tem o tool_use correspondente no histórico — a API recusaria.
 * Se precisar do número de novo, o Claude consulta de novo.
 */
export function historicoParaOAgente(msgs: ChatMessage[]): ChatMessage[] {
  return msgs
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() !== '')
    .map(({ id, role, content, createdAt }) => ({ id, role, content, createdAt }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/prompt-e-historico.test.ts`
Expected: PASS

- [ ] **Step 5: Reescrever o route**

Substituir o conteúdo de `apps/web/app/api/cfo/chat/route.ts` por:

```ts
import { NextResponse } from 'next/server'
import { getVerifiedIdentity, getOrgId } from '@/lib/auth/session'
import { createAnthropicProvider } from '@floow/core-finance'
import type { ChatMessage, ChatStreamChunk } from '@floow/core-finance'
import { getConversationMessages, getConversation } from '@/lib/cfo/chat-queries'
import { createConversation, saveMessage } from '@/lib/cfo/chat-actions'
import { getDb, cfoInsights } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { responder } from '@/lib/consultor/agente'
import { FERRAMENTAS } from '@/lib/consultor/ferramentas'
import { consumirLimiteDoConsultor } from '@/lib/consultor/limite'
import { montarPrompt } from '@/lib/consultor/prompt'
import { carregarDadosDoPrompt } from '@/lib/consultor/prompt-dados'
import { historicoParaOAgente } from '@/lib/consultor/historico'

/** Até 5 rodadas de ferramenta, cada chamada ao Claude com até 30 s. */
export const maxDuration = 60

const INDISPONIVEL = 'O consultor está indisponível agora. Tente de novo em instantes.'

export async function POST(request: Request) {
  const identity = await getVerifiedIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = identity.userId

  let orgId: string
  try {
    orgId = await getOrgId()
  } catch {
    return NextResponse.json({ error: 'No org' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Chat not configured' }, { status: 503 })

  const body = await request.json()
  const { conversationId, insightId, message, history } = body as {
    conversationId?: string
    insightId?: string
    message: string
    history?: ChatMessage[]
  }

  let historico: ChatMessage[] = []
  let convId = conversationId

  if (convId) {
    const conv = await getConversation(convId, orgId)
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const dbMessages = await getConversationMessages(convId, 20)
    historico = historicoParaOAgente(
      dbMessages.map((m) => ({
        id: m.id,
        role: m.role as ChatMessage['role'],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    )
  } else if (insightId) {
    historico = historicoParaOAgente(history ?? [])
  } else {
    const conv = await createConversation(orgId, userId, message.slice(0, 60))
    convId = conv.id
  }

  if (convId && !insightId) await saveMessage(convId, 'user', message)

  let insightContext = undefined
  if (insightId) {
    const [insight] = await getDb()
      .select()
      .from(cfoInsights)
      .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))
      .limit(1)
    insightContext = insight
  }

  let system: string
  try {
    system = montarPrompt(await carregarDadosDoPrompt(orgId, 'web', insightContext))
  } catch (err) {
    console.error('[consultor] falha ao montar o prompt:', err)
    return NextResponse.json({ error: 'Failed to build context' }, { status: 500 })
  }

  const provider = createAnthropicProvider({ apiKey, model: process.env.CFO_CHAT_MODEL ?? 'claude-sonnet-5' })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const enviar = (chunk: ChatStreamChunk) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))

      try {
        const r = await responder(
          {
            orgId,
            userId,
            historico,
            mensagem: message,
            system,
            onTexto: (text) => enviar({ type: 'text', text }),
            onSugestao: (toolCall) => enviar({ type: 'tool_call', toolCall }),
          },
          {
            provider,
            ferramentas: FERRAMENTAS,
            consumirLimite: consumirLimiteDoConsultor,
            log: (msg, err) => console.error(msg, err ?? ''),
          },
        )
        if (r.tipo === 'limite') {
          enviar({ type: 'error', text: r.texto })
        } else {
          if (convId && !insightId) {
            await saveMessage(convId, 'assistant', r.texto, r.sugestoes.length > 0 ? r.sugestoes : null)
          }
          enviar({ type: 'done' })
        }
      } catch (err) {
        console.error('[consultor] erro no laço:', err)
        enviar({ type: 'error', text: INDISPONIVEL })
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...(convId && !insightId ? { 'X-Conversation-Id': convId } : {}),
    },
  })
}
```

Depois apagar `apps/web/lib/cfo/chat-context.ts` e confirmar que ninguém mais o importa:

Run: `git rm apps/web/lib/cfo/chat-context.ts` e depois Grep por `chat-context` em `apps/web` (excluindo `node_modules`).
Expected: nenhuma ocorrência.

- [ ] **Step 6: Suite inteira + typecheck**

Run: `cd apps/web && pnpm vitest run && pnpm typecheck`
Expected: PASS. Se o typecheck reclamar de `insight.metric` (tipo `unknown`/`jsonb`), manter `metric: insight.metric ?? undefined` e ajustar só o tipo em `DadosDoPrompt` se preciso.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/consultor/prompt.ts apps/web/lib/consultor/prompt-dados.ts apps/web/lib/consultor/historico.ts apps/web/app/api/cfo/chat/route.ts apps/web/__tests__/consultor/prompt-e-historico.test.ts
git commit -m "feat(consultor): /cfo usa o agente com ferramentas de leitura"
```

(`git rm` já deixou a remoção de `chat-context.ts` no índice.)

---

### Task 8: Verificação real e entrega

**Files:** nenhum novo.

- [ ] **Step 1: Build de produção**

Run: `cd apps/web && pnpm build`
Expected: build sem erro.

- [ ] **Step 2: Conferir `CFO_CHAT_MODEL` na Vercel**

Sem a variável vale `claude-sonnet-5`. Confirmar com o usuário se quer manter esse padrão ou definir outro modelo no projeto (painel da Vercel pelo Chrome — o MCP da Vercel dá 403).

- [ ] **Step 3: Rodar as seis perguntas na org com dados (dev local)**

Com `pnpm dev` e login na org que tem dados (as outras duas estão vazias), perguntar no /cfo:

1. "Quanto gastei com mercado em setembro?" → conferir com Plano de Gastos de setembro.
2. "Quais foram minhas maiores despesas esse mês?" → conferir com Plano de Gastos / Transações.
3. "Como está meu plano de gastos de outubro?" → conferir com /budgets/spending?month=2026-10-01.
4. "Quanto já investi da meta desse mês?" → conferir com /budgets/investing.
5. "Quanto tenho em conta hoje?" → conferir com /accounts.
6. "Gastei mais com delivery esse mês do que no mês passado?" → conferir com Transações filtradas.

Expected: números iguais aos das telas; nenhuma resposta com número sem ferramenta. Anotar qualquer divergência e corrigir antes de seguir.

- [ ] **Step 4: Caso sem dado**

Perguntar "Quanto gastei com viagem em 2019?".
Expected: resposta dizendo que não há dado, sem inventar valor.

- [ ] **Step 5: Merge e push**

```bash
git branch --show-current   # feat/consultor-agente-fase1
git switch master && git pull --ff-only
git merge --no-ff feat/consultor-agente-fase1 -m "Merge: consultor como agente — fase 1"
git push
```

Depois do deploy, repetir a pergunta 1 em produção.
