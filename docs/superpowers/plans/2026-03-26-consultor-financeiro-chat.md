# Consultor Financeiro Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive streaming chat to the Consultor Financeiro, with per-insight ephemeral chat and persistent general chat, tool calling with user confirmation, and freemium gating.

**Architecture:** Extends the existing `LLMProvider` with a `ChatProvider` interface that adds `streamChat`. Server streams SSE via `ReadableStream`, client reads with a custom `useChat` hook (~60 lines). Tool calls are proposed by the LLM and executed only after user confirmation. Chat by insight is ephemeral (client-side state), general chat is persisted in `cfo_conversations` + `cfo_messages`.

**Tech Stack:** Next.js 15 (App Router, RSC), Drizzle ORM, Supabase PostgreSQL, raw fetch + ReadableStream (no SDK), Vitest.

**Spec:** `docs/superpowers/specs/2026-03-26-consultor-financeiro-chat-design.md`

---

## Task 1: Chat Types

**Files:**
- Modify: `packages/core-finance/src/cfo/types.ts`

- [ ] **Step 1: Add chat types to types.ts**

Append to the end of `packages/core-finance/src/cfo/types.ts`:

```typescript
// -- Chat Types --

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool_result'
  content: string
  toolCall?: ToolCall
  toolResult?: { success: boolean; message: string }
  createdAt: string
}

export interface ChatTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  params: Record<string, unknown>
}

export interface ChatStreamChunk {
  type: 'text' | 'tool_call' | 'done'
  text?: string
  toolCall?: ToolCall
}

export interface ChatResponse {
  content: string
  toolCalls: ToolCall[]
  usage?: { inputTokens: number; outputTokens: number }
}

export interface ChatProvider extends LLMProvider {
  streamChat(
    messages: ChatMessage[],
    options: {
      system: string
      tools?: ChatTool[]
      onChunk: (chunk: ChatStreamChunk) => void
    }
  ): Promise<ChatResponse>
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/core-finance && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/core-finance/src/cfo/types.ts
git commit -m "feat(cfo): add chat types and ChatProvider interface"
```

---

## Task 2: Anthropic streamChat Implementation

**Files:**
- Modify: `packages/core-finance/src/cfo/llm/anthropic.ts`
- Modify: `packages/core-finance/src/index.ts`

- [ ] **Step 1: Update anthropic.ts to implement ChatProvider**

Replace the entire file content. Key changes:
- Import `ChatProvider` instead of `LLMProvider`
- Return type of factory is now `ChatProvider`
- Add `streamChat` method that:
  - Calls Anthropic Messages API with `stream: true`
  - Converts `ChatMessage[]` to Anthropic message format
  - Converts `ChatTool[]` to Anthropic tool format (pass `inputSchema` as `input_schema`)
  - Reads SSE stream line by line
  - Parses `content_block_delta` (type `text_delta`) → emits `{ type: 'text', text }`
  - Parses `content_block_start` (type `tool_use`) + `content_block_delta` (type `input_json_delta`) → accumulates tool input JSON
  - On `message_stop` → emits `{ type: 'done' }`
  - Returns `ChatResponse` with full content + collected tool calls

```typescript
import type { ChatProvider, SynthesisInput, SynthesisOutput, ChatMessage, ChatTool, ChatStreamChunk, ChatResponse, ToolCall } from '../types'
import { CFO_SYSTEM_PROMPT, buildSynthesisPrompt } from './prompts'

interface AnthropicConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  timeoutMs?: number
}

export function createAnthropicProvider(config: AnthropicConfig): ChatProvider {
  const model = config.model ?? 'claude-sonnet-4-20250514'
  const maxTokens = config.maxTokens ?? 2000
  const timeoutMs = config.timeoutMs ?? 15000

  return {
    async synthesize(input: SynthesisInput): Promise<SynthesisOutput> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: CFO_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: buildSynthesisPrompt(
                  JSON.stringify(input.insights),
                  JSON.stringify(input.financialContext),
                ),
              },
            ],
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.status}`)
        }

        const data = await response.json()
        const text = data.content?.[0]?.text ?? ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON in response')

        return JSON.parse(jsonMatch[0]) as SynthesisOutput
      } finally {
        clearTimeout(timer)
      }
    },

    async streamChat(
      messages: ChatMessage[],
      options: {
        system: string
        tools?: ChatTool[]
        onChunk: (chunk: ChatStreamChunk) => void
      },
    ): Promise<ChatResponse> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)

      try {
        // Convert ChatMessage[] to Anthropic format, preserving order.
        // tool_result messages become user messages with content block arrays.
        const anthropicMessages: { role: 'user' | 'assistant'; content: string | Record<string, unknown>[] }[] = []

        for (const m of messages) {
          if (m.role === 'tool_result' && m.toolCall) {
            // Anthropic expects tool_result as a user message with content blocks
            anthropicMessages.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: m.toolCall.id,
                content: m.content,
              }],
            })
          } else {
            anthropicMessages.push({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
            })
          }
        }

        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          system: options.system,
          messages: anthropicMessages,
          stream: true,
        }

        if (options.tools && options.tools.length > 0) {
          body.tools = options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
          }))
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.status}`)
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''
        const toolCalls: ToolCall[] = []
        let currentToolId = ''
        let currentToolName = ''
        let currentToolInput = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const event = JSON.parse(data)

              if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'tool_use') {
                  currentToolId = event.content_block.id
                  currentToolName = event.content_block.name
                  currentToolInput = ''
                }
              } else if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta') {
                  const text = event.delta.text
                  fullContent += text
                  options.onChunk({ type: 'text', text })
                } else if (event.delta?.type === 'input_json_delta') {
                  currentToolInput += event.delta.partial_json
                }
              } else if (event.type === 'content_block_stop') {
                if (currentToolId) {
                  const toolCall: ToolCall = {
                    id: currentToolId,
                    name: currentToolName,
                    params: currentToolInput ? JSON.parse(currentToolInput) : {},
                  }
                  toolCalls.push(toolCall)
                  options.onChunk({ type: 'tool_call', toolCall })
                  currentToolId = ''
                  currentToolName = ''
                  currentToolInput = ''
                }
              } else if (event.type === 'message_stop') {
                options.onChunk({ type: 'done' })
              }
            } catch {
              // skip unparseable lines
            }
          }
        }

        return { content: fullContent, toolCalls }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/core-finance && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/core-finance/src/cfo/llm/anthropic.ts
git commit -m "feat(cfo): add streamChat to Anthropic provider"
```

---

## Task 3: Database Schema + Migration

**Files:**
- Modify: `packages/db/src/schema/cfo.ts`
- Create: `supabase/migrations/00022_cfo_chat.sql`

- [ ] **Step 1: Add conversation and message tables to Drizzle schema**

Append to `packages/db/src/schema/cfo.ts`:

```typescript
export const cfoConversations = pgTable(
  'cfo_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    title: text('title'),
    insightId: uuid('insight_id').references(() => cfoInsights.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrg: index('idx_cfo_conversations_org').on(table.orgId, table.updatedAt),
  })
)

export const cfoMessages = pgTable(
  'cfo_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => cfoConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    toolCall: jsonb('tool_call'),
    toolResult: jsonb('tool_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxConversation: index('idx_cfo_messages_conversation').on(table.conversationId, table.createdAt),
  })
)

export type CfoConversation = typeof cfoConversations.$inferSelect
export type NewCfoConversation = typeof cfoConversations.$inferInsert
export type CfoMessage = typeof cfoMessages.$inferSelect
export type NewCfoMessage = typeof cfoMessages.$inferInsert
```

- [ ] **Step 2: Create SQL migration**

Create `supabase/migrations/00022_cfo_chat.sql` with the full SQL from the spec (both tables, RLS policies including DELETE on messages, indexes). Use the exact SQL from the spec's "Modelo de Dados" section.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/cfo.ts supabase/migrations/00022_cfo_chat.sql
git commit -m "feat(cfo): add chat database schema and migration"
```

---

## Task 4: Chat Tools Definition + Executors

**Files:**
- Create: `apps/web/lib/cfo/chat-tools.ts`

- [ ] **Step 1: Create chat-tools.ts**

```typescript
import type { ChatTool, ToolCall } from '@floow/core-finance'
import { upsertBudgetGoal } from '@/lib/finance/budget-actions'

/** Hardcoded allowlist of tool names the chat can execute */
export const ALLOWED_TOOLS = ['create_budget', 'adjust_budget', 'view_transactions', 'view_account'] as const

export type AllowedToolName = (typeof ALLOWED_TOOLS)[number]

/** Tool definitions sent to the LLM */
export const CHAT_TOOLS: ChatTool[] = [
  {
    name: 'create_budget',
    description: 'Criar um orçamento mensal para uma categoria de gastos',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do orçamento (ex: "Delivery")' },
        targetCents: { type: 'number', description: 'Limite em centavos (ex: 50000 = R$500)' },
      },
      required: ['name', 'targetCents'],
    },
  },
  {
    name: 'adjust_budget',
    description: 'Ajustar o limite de um orçamento existente',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do orçamento a ajustar' },
        targetCents: { type: 'number', description: 'Novo limite em centavos' },
      },
      required: ['name', 'targetCents'],
    },
  },
  {
    name: 'view_transactions',
    description: 'Redirecionar o usuário para ver transações filtradas por categoria ou período',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtro de categoria' },
        period: { type: 'string', description: 'Período no formato YYYY-MM' },
      },
    },
  },
  {
    name: 'view_account',
    description: 'Redirecionar o usuário para ver detalhes de uma conta',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'ID da conta' },
      },
      required: ['accountId'],
    },
  },
]

/** Execute a tool call. Returns { success, message, redirect? } */
export async function executeToolCall(
  toolCall: ToolCall,
  orgId: string,
): Promise<{ success: boolean; message: string; redirect?: string }> {
  if (!ALLOWED_TOOLS.includes(toolCall.name as AllowedToolName)) {
    return { success: false, message: `Tool "${toolCall.name}" não permitida.` }
  }

  const params = toolCall.params

  switch (toolCall.name) {
    case 'create_budget':
    case 'adjust_budget': {
      const formData = new FormData()
      formData.set('name', String(params.name ?? ''))
      formData.set('targetCents', String(params.targetCents ?? 0))
      formData.set('type', 'spending')
      formData.set('period', 'monthly')
      try {
        await upsertBudgetGoal(formData)
        return { success: true, message: `Orçamento "${params.name}" criado/ajustado com sucesso.` }
      } catch (err) {
        return { success: false, message: `Erro ao criar orçamento: ${err}` }
      }
    }

    case 'view_transactions': {
      const query = new URLSearchParams()
      if (params.category) query.set('category', String(params.category))
      if (params.period) query.set('period', String(params.period))
      const url = `/transactions${query.toString() ? `?${query}` : ''}`
      return { success: true, message: 'Redirecionando para transações.', redirect: url }
    }

    case 'view_account': {
      return { success: true, message: 'Redirecionando para conta.', redirect: `/accounts/${params.accountId}` }
    }

    default:
      return { success: false, message: 'Tool desconhecida.' }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/cfo/chat-tools.ts
git commit -m "feat(cfo): add chat tools definition and executors"
```

---

## Task 5: Chat Context Builder

**Files:**
- Create: `apps/web/lib/cfo/chat-context.ts`

- [ ] **Step 1: Create chat-context.ts**

This module builds the system prompt with financial context for the chat LLM.

```typescript
import { getDb, cfoInsights, cfoRuns, transactions, accounts } from '@floow/db'
import { eq, and, isNull, gt, desc, sql, gte } from 'drizzle-orm'
import { aggregateCashFlow } from '@floow/core-finance'
import type { CfoInsight } from '@floow/db'

const CHAT_SYSTEM_PROMPT = `Você é o Consultor Financeiro pessoal do usuário. Você tem acesso aos dados financeiros dele e pode ajudá-lo a tomar melhores decisões.

Regras:
- Seja direto e objetivo. Nada de jargão desnecessário.
- Use tom firme mas empático — como um amigo que entende de finanças.
- Nunca invente dados. Trabalhe apenas com os números fornecidos no contexto.
- Se não tiver dados suficientes para responder, diga isso claramente.
- Quando sugerir ações, use as tools disponíveis para que o usuário possa executar com um clique.
- Responda SEMPRE em português brasileiro.
- Respostas curtas e práticas — máximo 3 parágrafos.`

export async function buildChatSystemPrompt(
  orgId: string,
  insightContext?: CfoInsight,
): Promise<string> {
  const db = getDb()

  // Financial context (compact, ~500 tokens)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const recentTx = await db
    .select({ date: transactions.date, amountCents: transactions.amountCents, type: transactions.type })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), gte(transactions.date, sixMonthsAgo)))

  const cashFlow = aggregateCashFlow(recentTx)
  const latest = cashFlow[0]

  const accts = await db.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
  const totalBalance = accts.reduce((s, a) => s + a.balanceCents, 0)

  // Active insights
  const activeInsights = await db
    .select({ type: cfoInsights.type, severity: cfoInsights.severity, title: cfoInsights.title, body: cfoInsights.body })
    .from(cfoInsights)
    .where(and(
      eq(cfoInsights.orgId, orgId),
      isNull(cfoInsights.dismissedAt),
      gt(cfoInsights.expiresAt, sql`now()`),
    ))
    .orderBy(desc(cfoInsights.generatedAt))
    .limit(5)

  // Daily summary
  const [latestRun] = await db
    .select({ dailySummary: cfoRuns.dailySummary })
    .from(cfoRuns)
    .where(eq(cfoRuns.orgId, orgId))
    .orderBy(desc(cfoRuns.startedAt))
    .limit(1)

  let context = CHAT_SYSTEM_PROMPT
  context += `\n\n## Contexto Financeiro do Usuário`
  context += `\n- Receita mensal: R$${((latest?.income ?? 0) / 100).toFixed(0)}`
  context += `\n- Despesa mensal: R$${(Math.abs(latest?.expense ?? 0) / 100).toFixed(0)}`
  context += `\n- Saldo total em contas: R$${(totalBalance / 100).toFixed(0)}`

  if (latestRun?.dailySummary) {
    context += `\n\n## Resumo do Dia\n${latestRun.dailySummary}`
  }

  if (activeInsights.length > 0) {
    context += `\n\n## Insights Ativos`
    for (const insight of activeInsights) {
      context += `\n- [${insight.severity}] ${insight.title}: ${insight.body}`
    }
  }

  if (insightContext) {
    context += `\n\n## Insight em Discussão`
    context += `\n- Tipo: ${insightContext.type}`
    context += `\n- Severidade: ${insightContext.severity}`
    context += `\n- ${insightContext.title}: ${insightContext.body}`
    if (insightContext.metric) {
      context += `\n- Dados: ${JSON.stringify(insightContext.metric)}`
    }
  }

  return context
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/cfo/chat-context.ts
git commit -m "feat(cfo): add chat context builder with financial data"
```

---

## Task 6: Chat Queries + Actions

**Files:**
- Create: `apps/web/lib/cfo/chat-queries.ts`
- Create: `apps/web/lib/cfo/chat-actions.ts`

- [ ] **Step 1: Create chat-queries.ts**

```typescript
import { getDb, cfoConversations, cfoMessages } from '@floow/db'
import { eq, and, desc, asc } from 'drizzle-orm'

export async function getConversation(conversationId: string, orgId: string) {
  const db = getDb()
  const [conv] = await db
    .select()
    .from(cfoConversations)
    .where(and(eq(cfoConversations.id, conversationId), eq(cfoConversations.orgId, orgId)))
    .limit(1)
  return conv ?? null
}

export async function getConversationMessages(conversationId: string, limit = 20) {
  const db = getDb()
  const messages = await db
    .select()
    .from(cfoMessages)
    .where(eq(cfoMessages.conversationId, conversationId))
    .orderBy(desc(cfoMessages.createdAt))
    .limit(limit)
  return messages.reverse()
}

export async function getRecentConversations(orgId: string, userId: string, limit = 10) {
  const db = getDb()
  return db
    .select()
    .from(cfoConversations)
    .where(and(eq(cfoConversations.orgId, orgId), eq(cfoConversations.userId, userId)))
    .orderBy(desc(cfoConversations.updatedAt))
    .limit(limit)
}
```

- [ ] **Step 2: Create chat-actions.ts**

```typescript
import { getDb, cfoConversations, cfoMessages } from '@floow/db'
import { eq } from 'drizzle-orm'

export async function createConversation(orgId: string, userId: string, title?: string) {
  const db = getDb()
  const [conv] = await db
    .insert(cfoConversations)
    .values({ orgId, userId, title: title ?? 'Nova conversa' })
    .returning()
  return conv
}

export async function saveMessage(
  conversationId: string,
  role: string,
  content: string,
  toolCall?: unknown,
  toolResult?: unknown,
) {
  const db = getDb()
  await db.insert(cfoMessages).values({
    conversationId,
    role,
    content,
    toolCall: toolCall ?? null,
    toolResult: toolResult ?? null,
  })

  // Update conversation's updated_at
  await db
    .update(cfoConversations)
    .set({ updatedAt: new Date() })
    .where(eq(cfoConversations.id, conversationId))
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/cfo/chat-queries.ts apps/web/lib/cfo/chat-actions.ts
git commit -m "feat(cfo): add chat queries and actions"
```

---

## Task 7: Chat API Route (streaming)

**Files:**
- Create: `apps/web/app/api/cfo/chat/route.ts`

- [ ] **Step 1: Create the streaming chat route**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAnthropicProvider } from '@floow/core-finance'
import type { ChatMessage } from '@floow/core-finance'
import { buildChatSystemPrompt } from '@/lib/cfo/chat-context'
import { CHAT_TOOLS } from '@/lib/cfo/chat-tools'
import { getConversationMessages, getConversation } from '@/lib/cfo/chat-queries'
import { createConversation, saveMessage } from '@/lib/cfo/chat-actions'
import { getDb, cfoInsights, cfoMessages, cfoConversations } from '@floow/db'
import { eq, and, gte, sql } from 'drizzle-orm'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.app_metadata?.org_ids?.[0]
  const userId = session.user.id
  if (!orgId) {
    return NextResponse.json({ error: 'No org' }, { status: 400 })
  }

  // TODO: Freemium gate — check user's subscription plan here.
  // If free tier, return: NextResponse.json({ error: 'upgrade_required' }, { status: 403 })
  // Implementation depends on existing billing check pattern (check Stripe subscription status).

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Chat not configured' }, { status: 503 })
  }

  // Rate limiting: max 30 messages/hour per org
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const db2 = getDb()
  const [countRow] = await db2
    .select({ count: sql`COUNT(*)` })
    .from(cfoMessages)
    .innerJoin(cfoConversations, eq(cfoMessages.conversationId, cfoConversations.id))
    .where(and(
      eq(cfoConversations.orgId, orgId),
      gte(cfoMessages.createdAt, oneHourAgo),
    ))
  if (Number(countRow?.count ?? 0) >= 30) {
    return NextResponse.json({ error: 'rate_limited', message: 'Limite de 30 mensagens/hora atingido.' }, { status: 429 })
  }

  const body = await request.json()
  const { conversationId, insightId, message, history } = body as {
    conversationId?: string
    insightId?: string
    message: string
    history?: ChatMessage[]
  }

  // Build message history
  let messages: ChatMessage[] = []
  let convId = conversationId

  if (convId) {
    // Persistent chat: load from DB
    const conv = await getConversation(convId, orgId)
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const dbMessages = await getConversationMessages(convId, 20)
    messages = dbMessages.map((m) => ({
      id: m.id,
      role: m.role as ChatMessage['role'],
      content: m.content,
      toolCall: m.toolCall as ChatMessage['toolCall'],
      toolResult: m.toolResult as ChatMessage['toolResult'],
      createdAt: m.createdAt.toISOString(),
    }))
  } else if (insightId) {
    // Ephemeral chat: use history from client
    messages = history ?? []
  } else {
    // New persistent conversation
    const conv = await createConversation(orgId, userId, message.slice(0, 60))
    convId = conv.id
  }

  // Add current user message
  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message,
    createdAt: new Date().toISOString(),
  }
  messages.push(userMsg)

  // Save user message (persistent only)
  if (convId && !insightId) {
    await saveMessage(convId, 'user', message)
  }

  // Build context
  let insightContext = undefined
  if (insightId) {
    const db = getDb()
    const [insight] = await db
      .select()
      .from(cfoInsights)
      .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))
      .limit(1)
    insightContext = insight
  }

  const systemPrompt = await buildChatSystemPrompt(orgId, insightContext)
  const provider = createAnthropicProvider({ apiKey })

  // Stream response
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        const response = await provider.streamChat(messages, {
          system: systemPrompt,
          tools: CHAT_TOOLS,
          onChunk(chunk) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
            if (chunk.type === 'text' && chunk.text) {
              fullContent += chunk.text
            }
          },
        })

        // Save assistant message (persistent only)
        if (convId && !insightId) {
          await saveMessage(
            convId,
            'assistant',
            fullContent,
            response.toolCalls.length > 0 ? response.toolCalls : null,
          )
        }

        controller.close()
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', text: 'Erro ao processar' })}\n\n`))
        controller.close()
      }
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

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/cfo/chat/route.ts
git commit -m "feat(cfo): add streaming chat API route"
```

---

## Task 8: Chat Action API Route

**Files:**
- Create: `apps/web/app/api/cfo/chat/action/route.ts`

- [ ] **Step 1: Create action route**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeToolCall, ALLOWED_TOOLS } from '@/lib/cfo/chat-tools'
import { saveMessage } from '@/lib/cfo/chat-actions'
import type { ToolCall } from '@floow/core-finance'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.app_metadata?.org_ids?.[0]
  if (!orgId) {
    return NextResponse.json({ error: 'No org' }, { status: 400 })
  }

  const { conversationId, toolCall } = (await request.json()) as {
    conversationId?: string
    toolCall: ToolCall
  }

  // Validate against allowlist
  if (!ALLOWED_TOOLS.includes(toolCall.name as any)) {
    return NextResponse.json({ error: 'Tool not allowed' }, { status: 400 })
  }

  const result = await executeToolCall(toolCall, orgId)

  // Save tool result (persistent only)
  if (conversationId) {
    await saveMessage(conversationId, 'tool_result', result.message, toolCall, result)
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/cfo/chat/action/route.ts
git commit -m "feat(cfo): add tool call execution API route"
```

---

## Task 9: useChat Hook

**Files:**
- Create: `apps/web/hooks/use-chat.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client'

import { useState, useCallback, useRef } from 'react'
import type { ChatMessage, ToolCall, ChatStreamChunk } from '@floow/core-finance'

interface UseChatOptions {
  insightId?: string
}

export function useChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    setError(null)
    setIsStreaming(true)

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, assistantMsg])

    try {
      abortRef.current = new AbortController()

      const response = await fetch('/api/cfo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          insightId: options?.insightId,
          message: text,
          history: options?.insightId ? messages.concat(userMsg) : undefined,
        }),
        signal: abortRef.current.signal,
      })

      // Capture conversation ID for new persistent chats
      const newConvId = response.headers.get('X-Conversation-Id')
      if (newConvId) setConversationId(newConvId)

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const chunk: ChatStreamChunk = JSON.parse(line.slice(6))
            if (chunk.type === 'text' && chunk.text) {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + chunk.text }
                }
                return updated
              })
            } else if (chunk.type === 'tool_call' && chunk.toolCall) {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, toolCall: chunk.toolCall }
                }
                return updated
              })
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError('Erro ao conectar com o consultor. Tente novamente.')
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [conversationId, messages, options?.insightId])

  const confirmAction = useCallback(async (toolCall: ToolCall) => {
    try {
      const response = await fetch('/api/cfo/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, toolCall }),
      })
      const result = await response.json()

      const toolResultMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'tool_result',
        content: result.message,
        toolCall,
        toolResult: result,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, toolResultMsg])

      return result
    } catch {
      setError('Erro ao executar ação.')
      return { success: false, message: 'Erro' }
    }
  }, [conversationId])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { messages, isStreaming, error, sendMessage, confirmAction, stop, conversationId }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/hooks/use-chat.ts
git commit -m "feat(cfo): add useChat hook with streaming and tool calling"
```

---

## Task 10: ChatMessage + ToolCallCard Components

**Files:**
- Create: `apps/web/components/cfo/chat-message.tsx`
- Create: `apps/web/components/cfo/tool-call-card.tsx`

- [ ] **Step 1: Create chat-message.tsx**

```tsx
'use client'

import { cn } from '@/lib/utils'
import { Bot, User } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '@floow/core-finance'
import { ToolCallCard } from './tool-call-card'
import type { ToolCall } from '@floow/core-finance'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
  onConfirmAction?: (toolCall: ToolCall) => void
}

export function ChatMessage({ message, isStreaming, onConfirmAction }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isToolResult = message.role === 'tool_result'

  if (isToolResult) {
    const success = message.toolResult?.success
    return (
      <div className="flex justify-center">
        <div className={cn(
          'rounded-lg px-3 py-2 text-xs',
          success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
        )}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn('max-w-[80%] space-y-2', isUser ? 'text-right' : 'text-left')}>
        <div className={cn(
          'inline-block rounded-lg px-3 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}>
          {message.content || (isStreaming ? '...' : '')}
          {isStreaming && <span className="animate-pulse">|</span>}
        </div>

        {message.toolCall && onConfirmAction && (
          <ToolCallCard toolCall={message.toolCall} onConfirm={onConfirmAction} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create tool-call-card.tsx**

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X, Loader2 } from 'lucide-react'
import type { ToolCall } from '@floow/core-finance'

const TOOL_LABELS: Record<string, string> = {
  create_budget: 'Criar orçamento',
  adjust_budget: 'Ajustar orçamento',
  view_transactions: 'Ver transações',
  view_account: 'Ver conta',
}

interface ToolCallCardProps {
  toolCall: ToolCall
  onConfirm: (toolCall: ToolCall) => void
}

export function ToolCallCard({ toolCall, onConfirm }: ToolCallCardProps) {
  const [status, setStatus] = useState<'pending' | 'loading' | 'done'>('pending')

  async function handleConfirm() {
    setStatus('loading')
    await onConfirm(toolCall)
    setStatus('done')
  }

  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name
  const paramsStr = Object.entries(toolCall.params)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  if (status === 'done') return null

  return (
    <Card className="border-dashed">
      <CardContent className="pt-3 pb-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">Ação sugerida</p>
        <p className="text-sm font-medium">{label}</p>
        {paramsStr && <p className="text-xs text-muted-foreground mt-0.5">{paramsStr}</p>}

        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="default" onClick={handleConfirm} disabled={status === 'loading'}>
            {status === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStatus('done')} disabled={status === 'loading'}>
            <X className="h-3 w-3 mr-1" />
            Não
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/cfo/chat-message.tsx apps/web/components/cfo/tool-call-card.tsx
git commit -m "feat(cfo): add ChatMessage and ToolCallCard components"
```

---

## Task 11: ChatPanel Component

**Files:**
- Create: `apps/web/components/cfo/chat-panel.tsx`

- [ ] **Step 1: Create chat-panel.tsx**

Reusable chat panel with message list, input, and streaming indicator.

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Loader2 } from 'lucide-react'
import { useChat } from '@/hooks/use-chat'
import { ChatMessage } from './chat-message'
import type { ToolCall } from '@floow/core-finance'

interface ChatPanelProps {
  insightId?: string
  className?: string
}

export function ChatPanel({ insightId, className }: ChatPanelProps) {
  const { messages, isStreaming, error, sendMessage, confirmAction } = useChat({ insightId })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage(text)
  }

  function handleConfirmAction(toolCall: ToolCall) {
    confirmAction(toolCall)
  }

  return (
    <div className={className}>
      {/* Messages */}
      <div ref={scrollRef} className="space-y-4 overflow-y-auto max-h-[400px] mb-3 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Pergunte qualquer coisa sobre suas finanças.
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
            onConfirmAction={handleConfirmAction}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive mb-2">{error}</p>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua pergunta..."
          disabled={isStreaming}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={isStreaming || !input.trim()}>
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/cfo/chat-panel.tsx
git commit -m "feat(cfo): add ChatPanel reusable component"
```

---

## Task 12: Integrate Chat into /cfo Page

**Files:**
- Modify: `apps/web/app/(app)/cfo/client.tsx`

- [ ] **Step 1: Add chat section to CfoClient**

Read the file first. Add import and a chat section at the bottom of the component:

```typescript
import { ChatPanel } from '@/components/cfo/chat-panel'
```

Add after the positive insights section (before the closing `</div>`):

```tsx
{/* Chat Section */}
<div className="border-t pt-6">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
    Converse com seu Consultor
  </h3>
  <ChatPanel />
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/cfo/client.tsx
git commit -m "feat(cfo): integrate chat panel into /cfo page"
```

---

## Task 13: Add "Conversar" to InsightCard

**Files:**
- Modify: `apps/web/components/cfo/insight-card.tsx`

- [ ] **Step 1: Add chat toggle to InsightCard**

Read the file first. Modifications:

1. Add import: `import { ChatPanel } from './chat-panel'` and `import { MessageCircle } from 'lucide-react'`
2. Add state: `const [chatOpen, setChatOpen] = useState(false)`
3. Add a "Conversar" button next to the action button (both compact and full modes)
4. When `chatOpen` is true, render `<ChatPanel insightId={insight.id} className="mt-3 pt-3 border-t" />` below the card content

The "Conversar" button:
```tsx
<Button size="sm" variant="ghost" onClick={() => setChatOpen(!chatOpen)}>
  <MessageCircle className="h-3 w-3 mr-1" />
  {chatOpen ? 'Fechar' : 'Conversar'}
</Button>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/cfo/insight-card.tsx
git commit -m "feat(cfo): add Conversar button with inline chat to InsightCard"
```

---

## Task 14: Update Middleware + Exports

**Files:**
- Modify: `apps/web/middleware.ts` (if `/api/cfo/chat` needs session auth, it's already covered since `/api/cfo` is excluded from middleware — but chat should use session, not service role)

- [ ] **Step 1: Remove /api/cfo from middleware exclusion**

Read `apps/web/middleware.ts`. The `/api/cfo` prefix is currently excluded from auth middleware (added for service-role routes). But chat routes need session cookies. Solution: exclude only `/api/cfo/run-daily` and `/api/cfo/run-event`, not the entire `/api/cfo` prefix.

Update the `publicRoutes` array:
```typescript
const publicRoutes = ['/auth', '/api/webhooks', '/api/cfo/run-daily', '/api/cfo/run-event']
```

Update the matcher pattern:
```typescript
'/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/reconcile|api/cfo/run-).*)',
```

This way `/api/cfo/chat` goes through auth middleware (session cookie), while `/api/cfo/run-daily` and `/api/cfo/run-event` bypass it (service role).

- [ ] **Step 2: Export new types from core-finance**

Add to `packages/core-finance/src/index.ts`:

```typescript
export type { ChatMessage, ChatTool, ToolCall, ChatStreamChunk, ChatResponse, ChatProvider } from './cfo/types'
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/middleware.ts packages/core-finance/src/index.ts
git commit -m "feat(cfo): fix middleware for chat auth and export chat types"
```

---

## Task 15: Run Tests + Verify

- [ ] **Step 1: Run all core-finance tests**

Run: `cd packages/core-finance && npx vitest run`
Expected: All tests pass, no regressions

- [ ] **Step 2: Type-check**

Run: `cd packages/core-finance && npx tsc --noEmit`
Expected: No new errors
