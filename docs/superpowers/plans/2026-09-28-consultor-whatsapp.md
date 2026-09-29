# Consultor no WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem ligou o WhatsApp conversa pelo número do floow com o mesmo consultor da web (consulta + memória).

**Architecture:** O webhook responde 200 na hora e agenda o tratamento com `after()`. `handleInboundText` mantém vínculo e SAIR e, no lugar da resposta padrão, chama `consultar(userId, msg)`. O canal (`lib/consultor/whatsapp/`) resolve a org, grava a pergunta na conversa `canal='whatsapp'` com o `wamid` (repetida = para), mostra "digitando", chama o mesmo `responder` da fase 1 com as ferramentas de consulta e memória e o limite real, grava e envia a resposta em partes. Configurações ganha o seletor da org do WhatsApp.

**Tech Stack:** Next.js 16 (`after` de `next/server`), TypeScript, Drizzle, vitest + Testing Library, WhatsApp Cloud API.

**Spec:** `docs/superpowers/specs/2026-09-28-consultor-whatsapp-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md).
- Textos e comentários em pt-BR.
- Nada no canal WhatsApp lê cookies: `userId` vem do número verificado; leitura/escrita de conversa, mensagens, perfil e membros sob `withUserDbFor(userId)`. Nenhum `getDb()` novo (o `__tests__/auth/rls-ledger.test.ts` barra).
- Migration `00068_consultor_whatsapp.sql` já aplicada em produção: `profiles.whatsapp_org_id`, `cfo_conversations.canal` (`'web' | 'whatsapp'`, default `'web'`), `cfo_messages.external_id` (único quando não nulo).
- Ferramentas no WhatsApp: todas de `FERRAMENTAS` exceto `tipo === 'sugestao'`.
- Modelo e tamanho: `process.env.CFO_CHAT_MODEL ?? 'claude-sonnet-5'`, `maxTokens: 8000` (iguais ao route web).
- Partes de no máximo `MAX_PARTE = 4000` caracteres.
- Histórico: últimas 20 mensagens `user`/`assistant` com texto da conversa WhatsApp, sem a pergunta atual.
- Textos fixos (exatos):
  - várias orgs sem escolha: `Você tem mais de uma organização no floow. Escolha qual o consultor usa no WhatsApp em Configurações: ${appUrl}/settings`
  - sem org: `Não encontrei uma organização sua no floow.`
  - indisponível: `O consultor está indisponível agora. Tente de novo em instantes.`
- Trabalho na branch `feat/consultor-whatsapp` do worktree `.claude/worktrees/consultor-whatsapp`; `git add` só dos arquivos da tarefa; commit termina com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A Meta entrega a mesma mensagem duas vezes — o agente roda uma vez só (Task 3).
2. Usuário com a org escolhida da qual saiu depois — cai na regra de org vazia, sem usar a org antiga (Task 1).
3. Resposta com mais de 4096 caracteres ou sem parágrafos — nenhuma parte passa de 4000 (Task 1).
4. Falha no envio do "digitando" — não impede a resposta (Task 3).
5. Mensagem sem `id` (testes antigos, formatos inesperados) — segue sem deduplicar, sem quebrar (Task 1/3).

---

### Task 1: Id da mensagem, "digitando" e funções puras do canal

**Files:**
- Modify: `apps/web/lib/notifications/whatsapp-webhook.ts` (`InboundText.id?`, `parseWebhook` preenche)
- Modify: `apps/web/lib/notifications/send-whatsapp.ts` (`marcarComoLidaDigitando`)
- Create: `apps/web/lib/consultor/whatsapp/puras.ts`
- Test: `apps/web/__tests__/notifications/whatsapp-webhook.test.ts` (acrescentar), `apps/web/__tests__/notifications/send-whatsapp.test.ts` (acrescentar), `apps/web/__tests__/consultor/whatsapp-puras.test.ts`

**Interfaces:**
- Produces: `InboundText { from: string; text: string; id?: string }`; `marcarComoLidaDigitando(messageId: string, fetchImpl?: typeof fetch): Promise<SendResult>`; `MAX_PARTE = 4000`; `escolherOrgDoWhatsApp(orgIds: string[], preferida: string | null): { tipo: 'ok'; orgId: string } | { tipo: 'escolher' } | { tipo: 'sem-org' }`; `dividirMensagem(texto: string, max?: number): string[]`.

- [ ] **Step 1: Write the failing tests**

Em `whatsapp-webhook.test.ts`, acrescentar (seguindo o formato de corpo que os testes existentes já montam):

```ts
it('devolve o id (wamid) da mensagem de texto', () => {
  const body = { entry: [{ changes: [{ value: { messages: [
    { id: 'wamid.ABC', from: '5511999998888', type: 'text', text: { body: 'oi' } },
  ] } }] }] }
  expect(parseWebhook(body).texts).toEqual([{ from: '5511999998888', text: 'oi', id: 'wamid.ABC' }])
})

it('mensagem sem id segue sem id', () => {
  const body = { entry: [{ changes: [{ value: { messages: [
    { from: '5511999998888', type: 'text', text: { body: 'oi' } },
  ] } }] }] }
  expect(parseWebhook(body).texts).toEqual([{ from: '5511999998888', text: 'oi' }])
})
```

Se algum teste existente comparar `texts` com `toEqual` e a mensagem do corpo tiver `id`, ajustar a expectativa para incluir o `id` (só isso).

Em `send-whatsapp.test.ts`, acrescentar (seguindo como os testes existentes injetam `fetchImpl` e as env vars):

```ts
it('marcarComoLidaDigitando marca como lida com indicador de digitação', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
  await marcarComoLidaDigitando('wamid.ABC', fetchImpl as unknown as typeof fetch)
  const corpo = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
  expect(corpo).toEqual({
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: 'wamid.ABC',
    typing_indicator: { type: 'text' },
  })
})
```

```ts
// apps/web/__tests__/consultor/whatsapp-puras.test.ts
import { describe, it, expect } from 'vitest'
import { escolherOrgDoWhatsApp, dividirMensagem, MAX_PARTE } from '@/lib/consultor/whatsapp/puras'

describe('escolherOrgDoWhatsApp', () => {
  it('org escolhida da qual ainda é membro', () => {
    expect(escolherOrgDoWhatsApp(['a', 'b'], 'b')).toEqual({ tipo: 'ok', orgId: 'b' })
  })
  it('uma org só, sem escolha', () => {
    expect(escolherOrgDoWhatsApp(['a'], null)).toEqual({ tipo: 'ok', orgId: 'a' })
  })
  it('várias orgs sem escolha', () => {
    expect(escolherOrgDoWhatsApp(['a', 'b'], null)).toEqual({ tipo: 'escolher' })
  })
  it('escolhida da qual saiu cai na regra de org vazia', () => {
    expect(escolherOrgDoWhatsApp(['a'], 'x')).toEqual({ tipo: 'ok', orgId: 'a' })
    expect(escolherOrgDoWhatsApp(['a', 'b'], 'x')).toEqual({ tipo: 'escolher' })
  })
  it('nenhuma org', () => {
    expect(escolherOrgDoWhatsApp([], null)).toEqual({ tipo: 'sem-org' })
  })
})

describe('dividirMensagem', () => {
  it('texto curto vira uma parte', () => {
    expect(dividirMensagem('oi')).toEqual(['oi'])
  })
  it('junta parágrafos até o limite e quebra entre parágrafos', () => {
    const p = 'a'.repeat(30)
    expect(dividirMensagem([p, p, p].join('\n\n'), 70)).toEqual([`${p}\n\n${p}`, p])
  })
  it('parágrafo maior que o limite é cortado em pedaços', () => {
    const partes = dividirMensagem('b'.repeat(9000))
    expect(partes.every((x) => x.length <= MAX_PARTE)).toBe(true)
    expect(partes.join('')).toBe('b'.repeat(9000))
  })
  it('texto vazio não gera parte', () => {
    expect(dividirMensagem('   ')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/web && pnpm vitest run __tests__/notifications/whatsapp-webhook.test.ts __tests__/notifications/send-whatsapp.test.ts __tests__/consultor/whatsapp-puras.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

Em `whatsapp-webhook.ts`: `InboundText` ganha `/** wamid; a Meta pode reenviar a mesma mensagem. */ id?: string`, e no `parseWebhook`:

```ts
          texts.push({ from: m.from, text, ...(typeof m.id === 'string' ? { id: m.id } : {}) })
```

Em `send-whatsapp.ts`, depois de `sendWhatsAppText`:

```ts
/**
 * Marca a mensagem recebida como lida e mostra "digitando" (some quando a
 * resposta chega ou em ~25 s). A resposta do consultor leva segundos.
 */
export function marcarComoLidaDigitando(messageId: string, fetchImpl: typeof fetch = fetch) {
  return post({ status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }, fetchImpl)
}
```

```ts
// apps/web/lib/consultor/whatsapp/puras.ts
/** O WhatsApp aceita até 4096 caracteres por mensagem; sobra folga. */
export const MAX_PARTE = 4000

export type OrgDoWhatsApp = { tipo: 'ok'; orgId: string } | { tipo: 'escolher' } | { tipo: 'sem-org' }

/**
 * A escolhida vale enquanto o usuário for membro dela; fora disso, a regra de
 * org vazia: uma org só → ela; várias → pedir para escolher.
 */
export function escolherOrgDoWhatsApp(orgIds: string[], preferida: string | null): OrgDoWhatsApp {
  if (preferida && orgIds.includes(preferida)) return { tipo: 'ok', orgId: preferida }
  if (orgIds.length === 1) return { tipo: 'ok', orgId: orgIds[0] }
  if (orgIds.length === 0) return { tipo: 'sem-org' }
  return { tipo: 'escolher' }
}

/** Quebra em parágrafos; parágrafo maior que o limite é cortado em pedaços. */
export function dividirMensagem(texto: string, max = MAX_PARTE): string[] {
  const partes: string[] = []
  let atual = ''
  for (const paragrafo of texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    const pedacos: string[] = []
    for (let i = 0; i < paragrafo.length; i += max) pedacos.push(paragrafo.slice(i, i + max))
    for (const pedaco of pedacos) {
      if (!atual) atual = pedaco
      else if (atual.length + 2 + pedaco.length <= max) atual += `\n\n${pedaco}`
      else {
        partes.push(atual)
        atual = pedaco
      }
    }
  }
  if (atual) partes.push(atual)
  return partes
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/notifications __tests__/consultor && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/notifications/whatsapp-webhook.ts apps/web/lib/notifications/send-whatsapp.ts apps/web/lib/consultor/whatsapp/puras.ts apps/web/__tests__/notifications/whatsapp-webhook.test.ts apps/web/__tests__/notifications/send-whatsapp.test.ts apps/web/__tests__/consultor/whatsapp-puras.test.ts
git commit -m "feat(whatsapp): id da mensagem, digitando e funções puras do consultor"
```

---

### Task 2: Schema e conversa WhatsApp no banco

**Files:**
- Modify: `packages/db/src/schema/auth.ts` (`profiles.whatsappOrgId`)
- Modify: `packages/db/src/schema/cfo.ts` (`cfoConversations.canal`, `cfoMessages.externalId`)
- Create: `apps/web/lib/consultor/whatsapp/conversa.ts`

**Interfaces:**
- Consumes: `withUserDbFor` (`@/lib/db/rls`); `listUserOrgIds(tx, userId)` (`@/lib/notifications/preferences-store`); `historicoParaOAgente` (`@/lib/consultor/historico`).
- Produces:
  - `orgsDoWhatsApp(userId: string): Promise<{ orgIds: string[]; preferida: string | null }>`
  - `registrarPergunta(p: { userId: string; orgId: string; texto: string; wamid?: string }): Promise<{ conversaId: string; historico: ChatMessage[] } | null>` (null = mensagem repetida)
  - `registrarResposta(p: { userId: string; conversaId: string; texto: string }): Promise<void>`

Sem teste unitário (é SQL fino sob RLS); a Task 6 confere no banco real com rollback.

- [ ] **Step 1: Schema**

Em `auth.ts`, na tabela `profiles`, depois de `whatsappVerifiedAt`:

```ts
  /** Org que o consultor usa no WhatsApp. Vazio + uma org só = essa org (00068). */
  whatsappOrgId: uuid('whatsapp_org_id').references(() => orgs.id, { onDelete: 'set null' }),
```

Em `cfo.ts`: `cfoConversations` ganha `canal: text('canal').notNull().default('web'),` (depois de `insightId`); `cfoMessages` ganha `externalId: text('external_id'),` (depois de `toolResult`).

Run: `cd apps/web && pnpm typecheck`
Expected: sem erro.

- [ ] **Step 2: Implement**

```ts
// apps/web/lib/consultor/whatsapp/conversa.ts
/**
 * Conversa do consultor no WhatsApp: uma por usuário/org (canal 'whatsapp').
 *
 * Sem cookies: tudo sob withUserDbFor(userId), com o userId do número
 * verificado. A pergunta é gravada com o wamid; o índice único de
 * external_id faz a repetição da Meta cair no ON CONFLICT DO NOTHING.
 */
import { cfoConversations, cfoMessages, profiles, type RlsTx } from '@floow/db'
import type { ChatMessage } from '@floow/core-finance'
import { and, desc, eq } from 'drizzle-orm'
import { withUserDbFor } from '@/lib/db/rls'
import { listUserOrgIds } from '@/lib/notifications/preferences-store'
import { historicoParaOAgente } from '@/lib/consultor/historico'

const LIMITE_HISTORICO = 20

export function orgsDoWhatsApp(userId: string): Promise<{ orgIds: string[]; preferida: string | null }> {
  return withUserDbFor(userId, async (tx) => {
    const [perfil] = await tx
      .select({ preferida: profiles.whatsappOrgId })
      .from(profiles)
      .where(eq(profiles.id, userId))
    return { orgIds: await listUserOrgIds(tx, userId), preferida: perfil?.preferida ?? null }
  })
}

async function conversaDoWhatsApp(tx: RlsTx, userId: string, orgId: string): Promise<string> {
  const [existente] = await tx
    .select({ id: cfoConversations.id })
    .from(cfoConversations)
    .where(and(eq(cfoConversations.orgId, orgId), eq(cfoConversations.userId, userId), eq(cfoConversations.canal, 'whatsapp')))
    .orderBy(desc(cfoConversations.updatedAt))
    .limit(1)
  if (existente) return existente.id
  const [nova] = await tx
    .insert(cfoConversations)
    .values({ orgId, userId, canal: 'whatsapp', title: 'WhatsApp' })
    .returning({ id: cfoConversations.id })
  return nova.id
}

export function registrarPergunta(p: {
  userId: string
  orgId: string
  texto: string
  wamid?: string
}): Promise<{ conversaId: string; historico: ChatMessage[] } | null> {
  return withUserDbFor(p.userId, async (tx) => {
    const conversaId = await conversaDoWhatsApp(tx, p.userId, p.orgId)
    const anteriores = await tx
      .select()
      .from(cfoMessages)
      .where(eq(cfoMessages.conversationId, conversaId))
      .orderBy(desc(cfoMessages.createdAt))
      .limit(LIMITE_HISTORICO)
    const gravada = await tx
      .insert(cfoMessages)
      .values({ conversationId: conversaId, role: 'user', content: p.texto, externalId: p.wamid ?? null })
      .onConflictDoNothing()
      .returning({ id: cfoMessages.id })
    if (gravada.length === 0) return null
    const historico = historicoParaOAgente(
      anteriores.reverse().map((m) => ({
        id: m.id,
        role: m.role as ChatMessage['role'],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    )
    return { conversaId, historico }
  })
}

export function registrarResposta(p: { userId: string; conversaId: string; texto: string }): Promise<void> {
  return withUserDbFor(p.userId, async (tx) => {
    await tx.insert(cfoMessages).values({ conversationId: p.conversaId, role: 'assistant', content: p.texto })
    await tx.update(cfoConversations).set({ updatedAt: new Date() }).where(eq(cfoConversations.id, p.conversaId))
  })
}
```

- [ ] **Step 3: Typecheck + suite**

Run: `cd apps/web && pnpm typecheck && pnpm vitest run __tests__/auth/rls-ledger.test.ts __tests__/consultor`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/auth.ts packages/db/src/schema/cfo.ts apps/web/lib/consultor/whatsapp/conversa.ts
git commit -m "feat(whatsapp): conversa do consultor no banco"
```

---

### Task 3: Atender uma mensagem no WhatsApp

**Files:**
- Create: `apps/web/lib/consultor/whatsapp/atender.ts`
- Test: `apps/web/__tests__/consultor/whatsapp-atender.test.ts`

**Interfaces:**
- Consumes: Task 1 (`escolherOrgDoWhatsApp`, `dividirMensagem`); `RespostaDoAgente`, `EntradaDoAgente` (`@/lib/consultor/agente`); `SendResult` (`@/lib/notifications/send-whatsapp`).
- Produces:
  - `interface DepsDoWhatsApp { orgsDoWhatsApp(userId): Promise<{ orgIds: string[]; preferida: string | null }>; registrarPergunta(p): Promise<{ conversaId: string; historico: ChatMessage[] } | null>; registrarResposta(p): Promise<void>; marcarDigitando(wamid: string): Promise<unknown>; enviar(to: string, body: string): Promise<SendResult>; montarSystem(orgId: string, userId: string): Promise<string>; responder(e: Omit<EntradaDoAgente, 'onTexto' | 'onSugestao'>): Promise<RespostaDoAgente>; appUrl: string; log(msg: string, err?: unknown): void }` (assinaturas de `registrarPergunta`/`registrarResposta` iguais às da Task 2)
  - `type ResultadoNoWhatsApp = 'respondido' | 'limite' | 'escolher-org' | 'sem-org' | 'repetida' | 'erro'`
  - `atenderNoWhatsApp(m: { userId: string; waId: string; texto: string; wamid?: string }, deps: DepsDoWhatsApp): Promise<ResultadoNoWhatsApp>`
  - Constantes exportadas `TEXTO_ESCOLHER_ORG(appUrl)`, `TEXTO_SEM_ORG`, `TEXTO_INDISPONIVEL` com os textos exatos das Global Constraints.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/consultor/whatsapp-atender.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  atenderNoWhatsApp, TEXTO_ESCOLHER_ORG, TEXTO_SEM_ORG, TEXTO_INDISPONIVEL, type DepsDoWhatsApp,
} from '@/lib/consultor/whatsapp/atender'

const historico = [{ id: 'h1', role: 'user' as const, content: 'antes', createdAt: '' }]

function deps(over: Partial<DepsDoWhatsApp> = {}): DepsDoWhatsApp {
  return {
    orgsDoWhatsApp: vi.fn(async () => ({ orgIds: ['org-1'], preferida: null })),
    registrarPergunta: vi.fn(async () => ({ conversaId: 'c1', historico })),
    registrarResposta: vi.fn(async () => {}),
    marcarDigitando: vi.fn(async () => ({ ok: true })),
    enviar: vi.fn(async () => ({ ok: true as const, id: 'w' })),
    montarSystem: vi.fn(async () => 'sys'),
    responder: vi.fn(async () => ({ tipo: 'ok' as const, texto: 'Você gastou R$ 10.', sugestoes: [] })),
    appUrl: 'https://app.test',
    log: vi.fn(),
    ...over,
  }
}
const msg = { userId: 'u1', waId: '5511999998888', texto: 'quanto gastei?', wamid: 'wamid.A' }

describe('atenderNoWhatsApp', () => {
  it('fluxo feliz: grava, digitando, agente com canal whatsapp, grava e envia', async () => {
    const d = deps()
    expect(await atenderNoWhatsApp(msg, d)).toBe('respondido')
    expect(d.registrarPergunta).toHaveBeenCalledWith({ userId: 'u1', orgId: 'org-1', texto: 'quanto gastei?', wamid: 'wamid.A' })
    expect(d.marcarDigitando).toHaveBeenCalledWith('wamid.A')
    expect(d.montarSystem).toHaveBeenCalledWith('org-1', 'u1')
    expect(d.responder).toHaveBeenCalledWith({
      orgId: 'org-1', userId: 'u1', canal: 'whatsapp', historico, mensagem: 'quanto gastei?', system: 'sys',
    })
    expect(d.registrarResposta).toHaveBeenCalledWith({ userId: 'u1', conversaId: 'c1', texto: 'Você gastou R$ 10.' })
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', 'Você gastou R$ 10.')
  })

  it('org escolhida vale', async () => {
    const d = deps({ orgsDoWhatsApp: vi.fn(async () => ({ orgIds: ['org-1', 'org-2'], preferida: 'org-2' })) })
    await atenderNoWhatsApp(msg, d)
    expect(d.montarSystem).toHaveBeenCalledWith('org-2', 'u1')
  })

  it('várias orgs sem escolha: manda o link e não chama o agente', async () => {
    const d = deps({ orgsDoWhatsApp: vi.fn(async () => ({ orgIds: ['org-1', 'org-2'], preferida: null })) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('escolher-org')
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', TEXTO_ESCOLHER_ORG('https://app.test'))
    expect(d.registrarPergunta).not.toHaveBeenCalled()
    expect(d.responder).not.toHaveBeenCalled()
  })

  it('sem org: avisa', async () => {
    const d = deps({ orgsDoWhatsApp: vi.fn(async () => ({ orgIds: [], preferida: null })) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('sem-org')
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', TEXTO_SEM_ORG)
  })

  it('mensagem repetida: não chama o agente nem responde', async () => {
    const d = deps({ registrarPergunta: vi.fn(async () => null) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('repetida')
    expect(d.responder).not.toHaveBeenCalled()
    expect(d.enviar).not.toHaveBeenCalled()
  })

  it('limite: envia o aviso e não grava resposta', async () => {
    const d = deps({ responder: vi.fn(async () => ({ tipo: 'limite' as const, texto: 'Limite atingido.', retryAfterSeconds: 9 })) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('limite')
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', 'Limite atingido.')
    expect(d.registrarResposta).not.toHaveBeenCalled()
  })

  it('erro do agente: envia indisponível e loga', async () => {
    const d = deps({ responder: vi.fn(async () => { throw new Error('api') }) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('erro')
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', TEXTO_INDISPONIVEL)
    expect(d.log).toHaveBeenCalled()
  })

  it('falha no digitando não impede a resposta', async () => {
    const d = deps({ marcarDigitando: vi.fn(async () => { throw new Error('meta') }) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('respondido')
    expect(d.enviar).toHaveBeenCalled()
  })

  it('sem wamid: não chama o digitando e segue', async () => {
    const d = deps()
    expect(await atenderNoWhatsApp({ ...msg, wamid: undefined }, d)).toBe('respondido')
    expect(d.marcarDigitando).not.toHaveBeenCalled()
  })

  it('resposta longa sai em partes, em ordem', async () => {
    const longa = `${'a'.repeat(3000)}\n\n${'b'.repeat(3000)}`
    const d = deps({ responder: vi.fn(async () => ({ tipo: 'ok' as const, texto: longa, sugestoes: [] })) })
    await atenderNoWhatsApp(msg, d)
    expect(vi.mocked(d.enviar).mock.calls.map((c) => c[1])).toEqual(['a'.repeat(3000), 'b'.repeat(3000)])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/whatsapp-atender.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/consultor/whatsapp/atender.ts
/**
 * Uma mensagem de texto no WhatsApp → resposta do consultor.
 *
 * Mesmo agente da web (responder), com canal 'whatsapp'. As deps chegam
 * injetadas: o arquivo não conhece banco, Meta nem Claude.
 */
import type { ChatMessage } from '@floow/core-finance'
import type { EntradaDoAgente, RespostaDoAgente } from '@/lib/consultor/agente'
import type { SendResult } from '@/lib/notifications/send-whatsapp'
import { maskPhone } from '@/lib/notifications/whatsapp-webhook'
import { dividirMensagem, escolherOrgDoWhatsApp } from './puras'

export const TEXTO_ESCOLHER_ORG = (appUrl: string) =>
  `Você tem mais de uma organização no floow. Escolha qual o consultor usa no WhatsApp em Configurações: ${appUrl}/settings`
export const TEXTO_SEM_ORG = 'Não encontrei uma organização sua no floow.'
export const TEXTO_INDISPONIVEL = 'O consultor está indisponível agora. Tente de novo em instantes.'

export interface DepsDoWhatsApp {
  orgsDoWhatsApp(userId: string): Promise<{ orgIds: string[]; preferida: string | null }>
  registrarPergunta(p: { userId: string; orgId: string; texto: string; wamid?: string }): Promise<{ conversaId: string; historico: ChatMessage[] } | null>
  registrarResposta(p: { userId: string; conversaId: string; texto: string }): Promise<void>
  marcarDigitando(wamid: string): Promise<unknown>
  enviar(to: string, body: string): Promise<SendResult>
  montarSystem(orgId: string, userId: string): Promise<string>
  responder(e: Omit<EntradaDoAgente, 'onTexto' | 'onSugestao'>): Promise<RespostaDoAgente>
  appUrl: string
  log(msg: string, err?: unknown): void
}

export type ResultadoNoWhatsApp = 'respondido' | 'limite' | 'escolher-org' | 'sem-org' | 'repetida' | 'erro'

export async function atenderNoWhatsApp(
  m: { userId: string; waId: string; texto: string; wamid?: string },
  deps: DepsDoWhatsApp,
): Promise<ResultadoNoWhatsApp> {
  const para = `+${m.waId}`
  const enviar = async (texto: string) => {
    for (const parte of dividirMensagem(texto)) {
      const r = await deps.enviar(para, parte)
      if (!r.ok) deps.log(`[consultor] envio falhou para ${maskPhone(m.waId)}: ${r.error}`)
    }
  }

  const { orgIds, preferida } = await deps.orgsDoWhatsApp(m.userId)
  const org = escolherOrgDoWhatsApp(orgIds, preferida)
  if (org.tipo === 'escolher') {
    await enviar(TEXTO_ESCOLHER_ORG(deps.appUrl))
    return 'escolher-org'
  }
  if (org.tipo === 'sem-org') {
    await enviar(TEXTO_SEM_ORG)
    return 'sem-org'
  }

  const pergunta = await deps.registrarPergunta({ userId: m.userId, orgId: org.orgId, texto: m.texto, wamid: m.wamid })
  if (!pergunta) return 'repetida'

  if (m.wamid) {
    // Só conforto visual: se a Meta recusar, a resposta sai do mesmo jeito.
    await deps.marcarDigitando(m.wamid).catch((err) => deps.log('[consultor] digitando falhou', err))
  }

  try {
    const r = await deps.responder({
      orgId: org.orgId,
      userId: m.userId,
      canal: 'whatsapp',
      historico: pergunta.historico,
      mensagem: m.texto,
      system: await deps.montarSystem(org.orgId, m.userId),
    })
    if (r.tipo === 'limite') {
      await enviar(r.texto)
      return 'limite'
    }
    await deps.registrarResposta({ userId: m.userId, conversaId: pergunta.conversaId, texto: r.texto })
    await enviar(r.texto)
    return 'respondido'
  } catch (err) {
    deps.log(`[consultor] falha no WhatsApp de ${maskPhone(m.waId)}`, err)
    await enviar(TEXTO_INDISPONIVEL)
    return 'erro'
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/whatsapp-atender.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/whatsapp/atender.ts apps/web/__tests__/consultor/whatsapp-atender.test.ts
git commit -m "feat(whatsapp): consultor atende mensagem de texto"
```

---

### Task 4: Ligar no webhook

**Files:**
- Create: `apps/web/lib/consultor/whatsapp/deps.ts`
- Modify: `apps/web/lib/notifications/whatsapp-inbound.ts` (`InboundDeps.consultar`; outcome `'consultor'` no lugar de `'default_reply'`)
- Modify: `apps/web/lib/notifications/whatsapp-inbound-deps.ts` (`consultar`)
- Modify: `apps/web/app/api/webhooks/whatsapp/route.ts` (`after()` + `maxDuration = 60`)
- Modify: `apps/web/__tests__/notifications/whatsapp-inbound.test.ts`, `apps/web/__tests__/notifications/whatsapp-webhook-route.test.ts`

**Interfaces:**
- Consumes: Task 2 (`orgsDoWhatsApp`, `registrarPergunta`, `registrarResposta`), Task 3 (`atenderNoWhatsApp`, `DepsDoWhatsApp`), Task 1 (`marcarComoLidaDigitando`); `responder` (`@/lib/consultor/agente`), `FERRAMENTAS`, `consumirLimiteDoConsultor`, `montarPrompt`, `carregarDadosDoPrompt`, `createAnthropicProvider`, `sendWhatsAppText`, `getAppUrl`.
- Produces: `depsReaisDoWhatsApp(): DepsDoWhatsApp`; `FERRAMENTAS_WHATSAPP`; `InboundDeps.consultar(userId: string, msg: InboundText): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Em `whatsapp-inbound.test.ts`: a função `deps()` ganha `consultar: vi.fn(async () => {})`. Trocar o teste "outro texto recebe a resposta padrão com o link de Configurações" por:

```ts
  it('outro texto de número ligado vai para o consultor', async () => {
    const d = deps()
    const m = { from: '5511999998888', text: 'quanto gastei?', id: 'wamid.A' }
    expect(await handleInboundText(m, d)).toBe('consultor')
    expect(d.consultar).toHaveBeenCalledWith('u1', m)
    expect(d.reply).not.toHaveBeenCalled()
  })
```

Nos demais testes que esperavam `'default_reply'`, trocar para `'consultor'`. Nos testes de vínculo e SAIR, acrescentar `expect(d.consultar).not.toHaveBeenCalled()`.

Em `whatsapp-webhook-route.test.ts`: mockar `after` para rodar na hora, sem mudar as asserções existentes:

```ts
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: vi.fn((fn: () => unknown) => { void fn() }),
}))
```

e, se o teste espera o tratamento terminar antes de asserir, aguardar as promessas pendentes (`await new Promise((r) => setTimeout(r, 0))`) — manter as asserções.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/web && pnpm vitest run __tests__/notifications/whatsapp-inbound.test.ts`
Expected: FAIL (`consultar` não é chamado; outcome ainda `default_reply`).

- [ ] **Step 3: Implement**

Em `whatsapp-inbound.ts`:
- `InboundDeps` ganha `/** Mensagem comum de número verificado → consultor (lib/consultor/whatsapp). */ consultar(userId: string, msg: InboundText): Promise<void>`.
- `InboundOutcome`: trocar `'default_reply'` por `'consultor'`.
- O fim da função vira:

```ts
  await deps.consultar(user.userId, msg)
  return 'consultor'
```

- Atualizar o comentário do topo ("FASE 2: …") para dizer que a mensagem comum vai para o consultor.

```ts
// apps/web/lib/consultor/whatsapp/deps.ts
import { createAnthropicProvider } from '@floow/core-finance'
import { responder } from '@/lib/consultor/agente'
import { FERRAMENTAS } from '@/lib/consultor/ferramentas'
import { consumirLimiteDoConsultor } from '@/lib/consultor/limite'
import { montarPrompt } from '@/lib/consultor/prompt'
import { carregarDadosDoPrompt } from '@/lib/consultor/prompt-dados'
import { getAppUrl } from '@/lib/app-url'
import { marcarComoLidaDigitando, sendWhatsAppText } from '@/lib/notifications/send-whatsapp'
import { orgsDoWhatsApp, registrarPergunta, registrarResposta } from './conversa'
import type { DepsDoWhatsApp } from './atender'

/** Botão não existe no WhatsApp: as sugestões da web ficam de fora. */
export const FERRAMENTAS_WHATSAPP = FERRAMENTAS.filter((f) => f.tipo !== 'sugestao')

export function depsReaisDoWhatsApp(): DepsDoWhatsApp {
  const log = (msg: string, err?: unknown) => console.error(msg, err ?? '')
  return {
    orgsDoWhatsApp,
    registrarPergunta,
    registrarResposta,
    marcarDigitando: (wamid) => marcarComoLidaDigitando(wamid),
    enviar: (to, body) => sendWhatsAppText(to, body),
    montarSystem: async (orgId, userId) => montarPrompt(await carregarDadosDoPrompt(orgId, userId, 'whatsapp')),
    responder: async (e) => {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY ausente')
      const provider = createAnthropicProvider({ apiKey, model: process.env.CFO_CHAT_MODEL ?? 'claude-sonnet-5', maxTokens: 8000 })
      return responder(e, { provider, ferramentas: FERRAMENTAS_WHATSAPP, consumirLimite: consumirLimiteDoConsultor, log })
    },
    appUrl: getAppUrl(),
    log,
  }
}
```

Em `whatsapp-inbound-deps.ts`, dentro de `defaultInboundDeps()`:

```ts
    async consultar(userId, msg) {
      await atenderNoWhatsApp({ userId, waId: msg.from, texto: msg.text, wamid: msg.id }, depsReaisDoWhatsApp())
    },
```

(imports de `@/lib/consultor/whatsapp/atender` e `@/lib/consultor/whatsapp/deps`).

No route do webhook: `import { after } from 'next/server'`; `export const maxDuration = 60` com o comentário "o consultor pode levar até ~45 s; a Meta já recebeu o 200"; e o bloco de `texts` vira:

```ts
  if (texts.length > 0) {
    // 200 na hora: a Meta reenvia o que demora. O consultor roda depois.
    after(async () => {
      const deps = defaultInboundDeps()
      for (const t of texts) {
        try {
          await handleInboundText(t, deps)
        } catch (err) {
          console.error(`[whatsapp] erro ao tratar mensagem de ${maskPhone(t.from)}:`, err)
        }
      }
    })
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/notifications __tests__/consultor && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/whatsapp/deps.ts apps/web/lib/notifications/whatsapp-inbound.ts apps/web/lib/notifications/whatsapp-inbound-deps.ts apps/web/app/api/webhooks/whatsapp/route.ts apps/web/__tests__/notifications/whatsapp-inbound.test.ts apps/web/__tests__/notifications/whatsapp-webhook-route.test.ts
git commit -m "feat(whatsapp): mensagem comum vai para o consultor"
```

---

### Task 5: Seletor da org do WhatsApp em Configurações

**Files:**
- Modify: `apps/web/lib/notifications/notification-settings.ts` (`whatsappOrgId`)
- Modify: `apps/web/lib/notifications/preferences-actions.ts` (lê `whatsappOrgId`; nova `setWhatsAppOrg`)
- Modify: `apps/web/app/(app)/settings/notifications-section.tsx` (seletor)
- Test: `apps/web/__tests__/notifications/notification-settings.test.ts`, `apps/web/__tests__/notifications/notifications-section.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: Task 2 (`profiles.whatsappOrgId`).
- Produces: `NotificationSettings.whatsappOrgId: string | null`; `setWhatsAppOrg(orgId: string): Promise<void>` (server action).

- [ ] **Step 1: Write the failing tests**

Em `notification-settings.test.ts`:

```ts
  it('traz a org do WhatsApp do perfil', () => {
    const s = buildNotificationSettings({ whatsappPhone: '+5511999998888', whatsappVerifiedAt: new Date(), whatsappOrgId: 'o2' }, orgs, [])
    expect(s.whatsappOrgId).toBe('o2')
  })
  it('sem perfil, org do WhatsApp é null', () => {
    expect(buildNotificationSettings(undefined, orgs, []).whatsappOrgId).toBeNull()
  })
```

Em `notifications-section.test.tsx` (seguindo como o arquivo já monta `settings` e mocka as actions; mockar também `setWhatsAppOrg` em `@/lib/notifications/preferences-actions`):

```tsx
  it('com WhatsApp ligado e duas orgs, mostra o seletor e grava a escolha', async () => {
    render(<NotificationsSection settings={{ ...settingsLigadoDuasOrgs, whatsappOrgId: null }} />)
    fireEvent.change(screen.getByLabelText('Org do consultor no WhatsApp'), { target: { value: 'o2' } })
    await waitFor(() => expect(setWhatsAppOrg).toHaveBeenCalledWith('o2'))
  })

  it('com uma org só, não mostra o seletor', () => {
    render(<NotificationsSection settings={{ ...settingsLigadoUmaOrg, whatsappOrgId: null }} />)
    expect(screen.queryByLabelText('Org do consultor no WhatsApp')).toBeNull()
  })
```

(`settingsLigadoDuasOrgs`/`settingsLigadoUmaOrg`: `whatsappVerified: true`, `whatsappPhone` preenchido, `orgs` com 2 e 1 itens `{ orgId, orgName, frequencies }` — montar no próprio teste a partir do formato que o arquivo já usa.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/web && pnpm vitest run __tests__/notifications/notification-settings.test.ts __tests__/notifications/notifications-section.test.tsx`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

`notification-settings.ts`: `NotificationSettings` ganha `/** Org que o consultor usa no WhatsApp; null = regra padrão. */ whatsappOrgId: string | null`; o parâmetro `profile` ganha `whatsappOrgId?: string | null`; o retorno ganha `whatsappOrgId: profile?.whatsappOrgId ?? null`.

`preferences-actions.ts`: o select do perfil passa a trazer `whatsappOrgId: profiles.whatsappOrgId`. Nova action:

```ts
/** Org do consultor no WhatsApp. Só aceita org da qual o usuário é membro. */
export async function setWhatsAppOrg(orgId: string): Promise<void> {
  const userId = await requireUserId()
  if (!UUID.test(orgId)) throw new Error('Organização inválida')
  await withUserDb(async (tx) => {
    const [membro] = await tx
      .select({ orgId: orgMembers.orgId })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
    if (!membro) throw new Error('Organização inválida')
    await tx.update(profiles).set({ whatsappOrgId: orgId }).where(eq(profiles.id, userId))
  })
}
```

(acrescentar `and` ao import de `drizzle-orm`).

`notifications-section.tsx`: logo depois de `<WhatsAppConnect … />`, quando `settings.whatsappVerified && settings.orgs.length > 1`:

```tsx
          <div className="space-y-1">
            <label htmlFor="org-whatsapp" className="text-xs text-muted-foreground">
              Org do consultor no WhatsApp
            </label>
            <select
              id="org-whatsapp"
              className={SELECT}
              value={orgWhatsApp ?? ''}
              onChange={(e) => escolherOrgWhatsApp(e.target.value)}
            >
              <option value="" disabled>Escolha…</option>
              {settings.orgs.map((o) => (
                <option key={o.orgId} value={o.orgId}>{o.orgName}</option>
              ))}
            </select>
          </div>
```

com estado `const [orgWhatsApp, setOrgWhatsApp] = useState(settings.whatsappOrgId)` (sincronizado no mesmo `useEffect` que já sincroniza `valores`) e:

```tsx
  async function escolherOrgWhatsApp(orgId: string) {
    const anterior = orgWhatsApp
    setOrgWhatsApp(orgId)
    try {
      await setWhatsAppOrg(orgId)
      toast('Org do consultor salva')
    } catch {
      setOrgWhatsApp(anterior)
      toast('Não foi possível salvar a org', 'error')
    }
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/notifications && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/notifications/notification-settings.ts apps/web/lib/notifications/preferences-actions.ts "apps/web/app/(app)/settings/notifications-section.tsx" apps/web/__tests__/notifications/notification-settings.test.ts apps/web/__tests__/notifications/notifications-section.test.tsx
git commit -m "feat(whatsapp): escolha da org do consultor em Configurações"
```

---

### Task 6: Verificação e entrega (controlador)

- [ ] **Step 1:** `cd apps/web && pnpm vitest run && pnpm typecheck && pnpm build`.
- [ ] **Step 2: Banco real com rollback:** como um usuário real, `registrarPergunta` equivalente em SQL — criar conversa `canal='whatsapp'`, inserir mensagem com `external_id='wamid.teste'`, repetir o insert com `ON CONFLICT DO NOTHING` → 0 linhas; outro usuário não vê a conversa; `canal='sms'` barrado pelo CHECK. ROLLBACK.
- [ ] **Step 3:** Merge em `master`, push, e teste manual: mandar "quanto gastei com mercado este mês?" no WhatsApp, ver "digitando", conferir o número com a tela; dizer "prefiro respostas curtas" → "Anotei" e aparece no /cfo.
