# Ritmo no WhatsApp — Parte 10: Webhook

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 12: Webhook `/api/webhooks/whatsapp`

**Files:**
- Create: `apps/web/lib/notifications/whatsapp-webhook.ts` (puro: assinatura, parse, palavra de saída)
- Create: `apps/web/lib/notifications/whatsapp-inbound.ts` (decide a resposta; **encaixe da fase 2**)
- Create: `apps/web/lib/notifications/whatsapp-inbound-deps.ts` (banco + envio reais)
- Create: `apps/web/app/api/webhooks/whatsapp/route.ts`
- Modify: `apps/web/__tests__/auth/auth-boundary.test.ts` (`PUBLIC_ROUTES`)
- Test: `apps/web/__tests__/notifications/whatsapp-webhook.test.ts`
- Test: `apps/web/__tests__/notifications/whatsapp-inbound.test.ts`

**Interfaces:**
- Consumes: `phoneCandidatesFromWaId` (Tarefa 2); `sendWhatsAppText`, `SendResult` (Tarefa 5); `listUserOrgIds`, `upsertFrequency` (Tarefa 6); `profiles` (Tarefa 1); `withUserDbFor` (`@/lib/db/rls`).
- Produces:
  ```ts
  // whatsapp-webhook.ts
  export function safeEqual(a: string, b: string): boolean
  export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean
  export interface InboundText { from: string; text: string }       // from = wa_id (só dígitos)
  export interface DeliveryError { recipient: string; code?: number; title?: string }
  export function parseWebhook(body: unknown): { texts: InboundText[]; errors: DeliveryError[] }
  export function isStopWord(text: string): boolean
  export function maskPhone(digits: string): string                 // '•••8888', para log
  // whatsapp-inbound.ts
  export interface InboundDeps {
    findUserByPhone(candidates: string[]): Promise<{ userId: string } | undefined>
    turnOffWhatsApp(userId: string): Promise<void>
    reply(to: string, body: string): Promise<SendResult>
    appUrl: string
  }
  export type InboundOutcome = 'unknown_sender' | 'stopped' | 'default_reply'
  export function handleInboundText(msg: InboundText, deps: InboundDeps): Promise<InboundOutcome>
  // whatsapp-inbound-deps.ts
  export function defaultInboundDeps(): InboundDeps
  ```

Formato do corpo que a Meta envia (só os campos usados):

```json
{ "entry": [{ "changes": [{ "value": {
  "messages": [{ "from": "5511999998888", "type": "text", "text": { "body": "SAIR" } }],
  "statuses": [{ "status": "failed", "recipient_id": "5511999998888",
                 "errors": [{ "code": 131026, "title": "Message undeliverable" }] }]
} }] }] }
```

- [ ] **Step 1: Escrever o teste do módulo puro**

```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyMetaSignature, parseWebhook, isStopWord, maskPhone, safeEqual,
} from '@/lib/notifications/whatsapp-webhook'

const sig = (body: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

describe('verifyMetaSignature', () => {
  const body = '{"a":1}'
  it('aceita assinatura correta', () => expect(verifyMetaSignature(body, sig(body, 's'), 's')).toBe(true))
  it('recusa corpo alterado', () => expect(verifyMetaSignature('{"a":2}', sig(body, 's'), 's')).toBe(false))
  it('recusa segredo errado', () => expect(verifyMetaSignature(body, sig(body, 'x'), 's')).toBe(false))
  it('recusa sem cabeçalho ou sem segredo', () => {
    expect(verifyMetaSignature(body, null, 's')).toBe(false)
    expect(verifyMetaSignature(body, sig(body, 's'), undefined)).toBe(false)
  })
  it('recusa cabeçalho sem prefixo', () => {
    expect(verifyMetaSignature(body, sig(body, 's').replace('sha256=', ''), 's')).toBe(false)
  })
})

describe('parseWebhook', () => {
  it('extrai textos e erros de entrega, ignora o resto', () => {
    const r = parseWebhook({
      entry: [{ changes: [{ value: {
        messages: [
          { from: '5511999998888', type: 'text', text: { body: 'SAIR' } },
          { from: '5511999998888', type: 'image', image: {} },
        ],
        statuses: [
          { status: 'delivered', recipient_id: '5511999998888' },
          { status: 'failed', recipient_id: '5511999998888', errors: [{ code: 131026, title: 'x' }] },
        ],
      } }] }],
    })
    expect(r.texts).toEqual([{ from: '5511999998888', text: 'SAIR' }])
    expect(r.errors).toEqual([{ recipient: '5511999998888', code: 131026, title: 'x' }])
  })

  it('lixo não lança', () => {
    expect(parseWebhook(null)).toEqual({ texts: [], errors: [] })
    expect(parseWebhook({ entry: 'x' })).toEqual({ texts: [], errors: [] })
  })
})

describe('isStopWord', () => {
  it.each(['SAIR', 'sair', ' Sair! ', 'PARAR', 'parar.', 'STOP'])('%s é saída', (t) =>
    expect(isStopWord(t)).toBe(true))
  it.each(['sair daqui', 'quanto gastei?', ''])('%s não é saída', (t) =>
    expect(isStopWord(t)).toBe(false))
})

describe('utilitários', () => {
  it('maskPhone mostra só o fim', () => expect(maskPhone('5511999998888')).toBe('•••8888'))
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
```

- [ ] **Step 2: Escrever o teste de `handleInboundText`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleInboundText, type InboundDeps } from '@/lib/notifications/whatsapp-inbound'

function deps(over: Partial<InboundDeps> = {}): InboundDeps {
  return {
    findUserByPhone: vi.fn(async () => ({ userId: 'u1' })),
    turnOffWhatsApp: vi.fn(async () => {}),
    reply: vi.fn(async () => ({ ok: true as const, id: 'w' })),
    appUrl: 'https://app.test',
    ...over,
  }
}

describe('handleInboundText', () => {
  it('SAIR desliga o WhatsApp em todas as orgs e confirma', async () => {
    const d = deps()
    expect(await handleInboundText({ from: '5511999998888', text: 'sair' }, d)).toBe('stopped')
    expect(d.turnOffWhatsApp).toHaveBeenCalledWith('u1')
    expect(vi.mocked(d.reply).mock.calls[0][0]).toBe('+5511999998888')
    expect(vi.mocked(d.reply).mock.calls[0][1]).toContain('não vai mais receber')
  })

  it('outro texto recebe a resposta padrão com o link de Configurações', async () => {
    const d = deps()
    expect(await handleInboundText({ from: '5511999998888', text: 'quanto gastei?' }, d)).toBe('default_reply')
    expect(d.turnOffWhatsApp).not.toHaveBeenCalled()
    expect(vi.mocked(d.reply).mock.calls[0][1]).toContain('https://app.test/settings')
  })

  it('número desconhecido: não responde nem mexe em nada', async () => {
    const d = deps({ findUserByPhone: vi.fn(async () => undefined) })
    expect(await handleInboundText({ from: '5511999998888', text: 'SAIR' }, d)).toBe('unknown_sender')
    expect(d.reply).not.toHaveBeenCalled()
    expect(d.turnOffWhatsApp).not.toHaveBeenCalled()
  })

  it('wa_id sem o nono dígito procura as duas formas', async () => {
    const d = deps()
    await handleInboundText({ from: '551199998888', text: 'oi' }, d)
    expect(d.findUserByPhone).toHaveBeenCalledWith(['+551199998888', '+5511999998888'])
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/whatsapp-webhook.test.ts __tests__/notifications/whatsapp-inbound.test.ts`
Expected: FAIL (módulos não existem)

- [ ] **Step 4: Criar `whatsapp-webhook.ts`**

```ts
/**
 * Peças puras do webhook do WhatsApp: assinatura, leitura do corpo e palavra
 * de saída. A Meta assina o corpo cru com o app secret (X-Hub-Signature-256).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`
  return safeEqual(expected, header)
}

export interface InboundText {
  /** wa_id: só dígitos, com DDI. */
  from: string
  text: string
}

export interface DeliveryError {
  recipient: string
  code?: number
  title?: string
}

type Obj = Record<string, unknown>
const arr = (x: unknown): Obj[] => (Array.isArray(x) ? (x.filter((i) => i && typeof i === 'object') as Obj[]) : [])
const obj = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {})

export function parseWebhook(body: unknown): { texts: InboundText[]; errors: DeliveryError[] } {
  const texts: InboundText[] = []
  const errors: DeliveryError[] = []
  for (const entry of arr(obj(body).entry)) {
    for (const change of arr(entry.changes)) {
      const value = obj(change.value)
      for (const m of arr(value.messages)) {
        const text = obj(m.text).body
        if (m.type === 'text' && typeof m.from === 'string' && typeof text === 'string') {
          texts.push({ from: m.from, text })
        }
      }
      for (const s of arr(value.statuses)) {
        if (s.status !== 'failed' || typeof s.recipient_id !== 'string') continue
        const [e] = arr(s.errors)
        errors.push({
          recipient: s.recipient_id,
          code: typeof e?.code === 'number' ? e.code : undefined,
          title: typeof e?.title === 'string' ? e.title : undefined,
        })
      }
    }
  }
  return { texts, errors }
}

const STOP_WORDS = new Set(['sair', 'parar', 'stop'])

/** "SAIR", "sair!", " Parar. " — a mensagem inteira, não uma palavra dentro dela. */
export function isStopWord(text: string): boolean {
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  return STOP_WORDS.has(t) && text.trim().split(/\s+/).length === 1
}

/** Telefone é dado pessoal: log só com o fim. */
export const maskPhone = (digits: string) => `•••${digits.slice(-4)}`
```

- [ ] **Step 5: Criar `whatsapp-inbound.ts`**

```ts
/**
 * O que fazer com uma mensagem de texto recebida no WhatsApp do floow.
 *
 * FASE 2: o agente conversacional entra aqui, no lugar da resposta padrão.
 * Ele recebe o userId já identificado pelo número verificado. Nesta fase só
 * existe o SAIR e um aviso.
 */
import { phoneCandidatesFromWaId } from './phone'
import { isStopWord, type InboundText } from './whatsapp-webhook'
import type { SendResult } from './send-whatsapp'

export interface InboundDeps {
  /** Só números verificados. */
  findUserByPhone(candidates: string[]): Promise<{ userId: string } | undefined>
  /** WhatsApp 'off' em todas as orgs do usuário. */
  turnOffWhatsApp(userId: string): Promise<void>
  /** Texto livre — permitido porque o usuário acabou de escrever (janela de 24h). */
  reply(to: string, body: string): Promise<SendResult>
  appUrl: string
}

export type InboundOutcome = 'unknown_sender' | 'stopped' | 'default_reply'

export async function handleInboundText(msg: InboundText, deps: InboundDeps): Promise<InboundOutcome> {
  const user = await deps.findUserByPhone(phoneCandidatesFromWaId(msg.from))
  if (!user) return 'unknown_sender'

  const to = `+${msg.from}`
  const settingsUrl = `${deps.appUrl}/settings`

  if (isStopWord(msg.text)) {
    await deps.turnOffWhatsApp(user.userId)
    await deps.reply(
      to,
      `Pronto: você não vai mais receber o ritmo de gastos por aqui, em nenhuma conta. Para religar, vá em Configurações: ${settingsUrl}`,
    )
    return 'stopped'
  }

  await deps.reply(to, `Por enquanto eu só mando o ritmo de gastos. Ajuste em Configurações: ${settingsUrl}`)
  return 'default_reply'
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/whatsapp-webhook.test.ts __tests__/notifications/whatsapp-inbound.test.ts`
Expected: PASS

- [ ] **Step 7: Criar `whatsapp-inbound-deps.ts`**

```ts
/**
 * Deps reais do webhook. Sem usuário na requisição: acha o dono pelo número
 * verificado (conexão de serviço) e só então escreve sob o RLS dele.
 */
import { getServiceDb, profiles } from '@floow/db'
import { and, inArray, isNotNull } from 'drizzle-orm'
import { withUserDbFor } from '@/lib/db/rls'
import { getAppUrl } from '@/lib/app-url'
import { listUserOrgIds, upsertFrequency } from './preferences-store'
import { sendWhatsAppText } from './send-whatsapp'
import type { InboundDeps } from './whatsapp-inbound'

export function defaultInboundDeps(): InboundDeps {
  return {
    async findUserByPhone(candidates) {
      const [row] = await getServiceDb()
        .select({ userId: profiles.id })
        .from(profiles)
        .where(and(inArray(profiles.whatsappPhone, candidates), isNotNull(profiles.whatsappVerifiedAt)))
        .limit(1)
      return row
    },
    async turnOffWhatsApp(userId) {
      await withUserDbFor(userId, async (tx) => {
        const orgIds = await listUserOrgIds(tx, userId)
        await upsertFrequency(tx, userId, orgIds, 'whatsapp', 'off')
      })
    },
    reply: (to, body) => sendWhatsAppText(to, body),
    appUrl: getAppUrl(),
  }
}
```

- [ ] **Step 8: Criar a rota `app/api/webhooks/whatsapp/route.ts`**

```ts
/**
 * Webhook do WhatsApp Cloud API.
 *
 * GET: handshake de cadastro (a Meta manda hub.verify_token e espera o
 * hub.challenge de volta). POST: eventos, autenticados pela assinatura HMAC do
 * corpo cru. Responde 200 rápido a todo POST válido — a Meta reenvia o que não
 * recebe 200, e um erro nosso viraria mensagem duplicada.
 */
import { parseWebhook, safeEqual, verifyMetaSignature, maskPhone } from '@/lib/notifications/whatsapp-webhook'
import { handleInboundText } from '@/lib/notifications/whatsapp-inbound'
import { defaultInboundDeps } from '@/lib/notifications/whatsapp-inbound-deps'

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  const token = p.get('hub.verify_token') ?? ''
  if (p.get('hub.mode') === 'subscribe' && expected && safeEqual(token, expected)) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('ok', { status: 200 })
  }

  const { texts, errors } = parseWebhook(body)
  for (const e of errors) {
    console.error(`[whatsapp] entrega falhou para ${maskPhone(e.recipient)}: ${e.code ?? '?'} ${e.title ?? ''}`)
  }

  if (texts.length > 0) {
    const deps = defaultInboundDeps()
    for (const t of texts) {
      try {
        await handleInboundText(t, deps)
      } catch (err) {
        console.error(`[whatsapp] erro ao tratar mensagem de ${maskPhone(t.from)}:`, err)
      }
    }
  }

  return new Response('ok', { status: 200 })
}
```

- [ ] **Step 9: Registrar a rota pública em `auth-boundary.test.ts`**

Em `PUBLIC_ROUTES`, acrescente:

```ts
    'app/api/webhooks/whatsapp/route.ts':
      'autentica por assinatura HMAC da Meta (X-Hub-Signature-256); o GET só devolve o challenge com o verify token',
```

O middleware já libera `/api/webhooks` sem sessão, então não há nada a mudar lá.

- [ ] **Step 10: Suíte, typecheck e commit**

Run: `pnpm --filter @floow/web test -- __tests__/notifications __tests__/auth`
Expected: PASS

Run: `pnpm --filter @floow/web typecheck`
Expected: PASS

```bash
git branch --show-current
git add apps/web/lib/notifications/whatsapp-webhook.ts apps/web/lib/notifications/whatsapp-inbound.ts apps/web/lib/notifications/whatsapp-inbound-deps.ts apps/web/app/api/webhooks/whatsapp/route.ts apps/web/__tests__/auth/auth-boundary.test.ts apps/web/__tests__/notifications/whatsapp-webhook.test.ts apps/web/__tests__/notifications/whatsapp-inbound.test.ts
git commit -m "feat(notificacoes): webhook do WhatsApp com SAIR e encaixe do agente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
