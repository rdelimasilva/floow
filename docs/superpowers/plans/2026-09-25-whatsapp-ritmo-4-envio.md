# Ritmo no WhatsApp — Parte 4: Envio e descadastro

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 5: Cliente da Graph API (`send-whatsapp.ts`)

**Files:**
- Create: `apps/web/lib/notifications/send-whatsapp.ts`
- Test: `apps/web/__tests__/notifications/send-whatsapp.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SendResult = { ok: true; id: string } | { ok: false; error: string }
  export interface TemplateMessage { to: string; template: string; bodyParams: string[]; buttonParams?: string[] }
  export function sendWhatsAppTemplate(msg: TemplateMessage, fetchImpl?: typeof fetch): Promise<SendResult>
  export function sendWhatsAppText(to: string, body: string, fetchImpl?: typeof fetch): Promise<SendResult>
  ```
  `to` é E.164 (com `+`). A função tira o `+` antes de enviar, porque a Meta espera só dígitos.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendWhatsAppTemplate, sendWhatsAppText } from '@/lib/notifications/send-whatsapp'

const ok = () =>
  vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }))

describe('send-whatsapp', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_TOKEN', 'tok')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123')
    vi.stubEnv('WHATSAPP_API_VERSION', 'v21.0')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('envia template com parâmetros de corpo e de botão', async () => {
    const f = ok()
    const r = await sendWhatsAppTemplate(
      { to: '+5511999998888', template: 'floow_codigo', bodyParams: ['123456'], buttonParams: ['123456'] },
      f,
    )
    expect(r).toEqual({ ok: true, id: 'wamid.1' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '5511999998888',
      type: 'template',
      template: {
        name: 'floow_codigo',
        language: { code: 'pt_BR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] },
        ],
      },
    })
  })

  it('template sem botão não manda componente de botão', async () => {
    const f = ok()
    await sendWhatsAppTemplate({ to: '+5511999998888', template: 't', bodyParams: ['a'] }, f)
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.template.components).toHaveLength(1)
  })

  it('envia texto livre', async () => {
    const f = ok()
    await sendWhatsAppText('+5511999998888', 'Oi', f)
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toEqual({ messaging_product: 'whatsapp', to: '5511999998888', type: 'text', text: { body: 'Oi' } })
  })

  it('erro da API vira ok:false com status', async () => {
    const f = vi.fn(async () => new Response('{"error":{"code":131026}}', { status: 400 }))
    const r = await sendWhatsAppText('+5511999998888', 'Oi', f)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/^whatsapp_400: /) })
  })

  it('sem configuração é no-op', async () => {
    vi.stubEnv('WHATSAPP_TOKEN', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = ok()
    const r = await sendWhatsAppText('+5511999998888', 'Oi', f)
    expect(r).toEqual({ ok: false, error: 'not_configured' })
    expect(f).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/send-whatsapp.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar**

```ts
/**
 * Envio pelo WhatsApp Cloud API da Meta (Graph API).
 *
 * `fetch` direto, como o send-email.ts: são duas chamadas, e assim não entra
 * dependência. Sem WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID vira no-op com
 * aviso — o cron não pode quebrar em dev/preview.
 *
 * Mensagem que parte do floow só sai por template aprovado. Texto livre só é
 * aceito dentro das 24h depois de o usuário escrever (resposta do webhook).
 */
export type SendResult = { ok: true; id: string } | { ok: false; error: string }

export interface TemplateMessage {
  /** E.164, com '+'. */
  to: string
  template: string
  bodyParams: string[]
  /** Parâmetro do botão de URL (índice 0) — o template de código usa. */
  buttonParams?: string[]
}

const text = (t: string) => ({ type: 'text', text: t })

async function post(payload: Record<string, unknown>, fetchImpl: typeof fetch): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0'
  if (!token || !phoneId) {
    console.warn('[whatsapp] WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes — mensagem não enviada')
    return { ok: false, error: 'not_configured' }
  }

  const res = await fetchImpl(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: `whatsapp_${res.status}: ${body.slice(0, 200)}` }
  }
  const data = (await res.json()) as { messages?: { id?: string }[] }
  return { ok: true, id: data.messages?.[0]?.id ?? '' }
}

const digits = (e164: string) => e164.replace(/^\+/, '')

export function sendWhatsAppTemplate(msg: TemplateMessage, fetchImpl: typeof fetch = fetch) {
  const components: Record<string, unknown>[] = [
    { type: 'body', parameters: msg.bodyParams.map(text) },
  ]
  if (msg.buttonParams?.length) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: msg.buttonParams.map(text) })
  }
  return post(
    {
      to: digits(msg.to),
      type: 'template',
      template: { name: msg.template, language: { code: 'pt_BR' }, components },
    },
    fetchImpl,
  )
}

export function sendWhatsAppText(to: string, body: string, fetchImpl: typeof fetch = fetch) {
  return post({ to: digits(to), type: 'text', text: { body } }, fetchImpl)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/send-whatsapp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/notifications/send-whatsapp.ts apps/web/__tests__/notifications/send-whatsapp.test.ts
git commit -m "feat(notificacoes): cliente do WhatsApp Cloud API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Descadastro do e-mail por org

**Files:**
- Create: `apps/web/lib/notifications/preferences-store.ts`
- Modify: `apps/web/lib/notifications/unsubscribe-token.ts`
- Modify: `apps/web/app/api/email/unsubscribe/route.ts`
- Modify: `apps/web/__tests__/notifications/unsubscribe-token.test.ts`
- Test: `apps/web/__tests__/notifications/unsubscribe-route.test.ts`

**Interfaces:**
- Consumes: `notificationPreferences`, `orgMembers`, `RlsTx` de `@floow/db`. `Channel`, `Frequency` de `schedule.ts`.
- Produces:
  - `signUnsubscribeToken(userId: string, secret: string | undefined, orgId?: string): string`. O `orgId` é o **terceiro** parâmetro e é opcional, para a chamada antiga continuar compilando até a Tarefa 7.
  - `verifyUnsubscribeToken(token, secret): { userId: string; orgId: string | null } | null`
  - `preferences-store.ts`, que **não** é `'use server'` (recebe `userId` e não pode virar action chamável pelo cliente):
    - `listUserOrgIds(tx: RlsTx, userId: string): Promise<string[]>`
    - `upsertFrequency(tx: RlsTx, userId: string, orgIds: string[], channel: Channel, frequency: Frequency): Promise<void>`

Tokens antigos (payload = só o `userId`) continuam válidos e passam a desligar o e-mail em **todas** as orgs do usuário, que é o que eles faziam antes.

- [ ] **Step 1: Atualizar o teste do token**

Em `apps/web/__tests__/notifications/unsubscribe-token.test.ts`, troque o primeiro `it` e acrescente os novos casos:

```ts
  it('ida e volta sem org (token antigo) devolve orgId null', () => {
    const token = signUnsubscribeToken(USER, SECRET)
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ userId: USER, orgId: null })
  })

  it('ida e volta com org', () => {
    const ORG = '11111111-2222-4333-8444-555566667777'
    const token = signUnsubscribeToken(USER, SECRET, ORG)
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ userId: USER, orgId: ORG })
  })

  it('org que não é uuid é recusada', () => {
    const payload = Buffer.from(`${USER}:nao-uuid`).toString('base64url')
    const sig = createHmac('sha256', `unsubscribe:${SECRET}`).update(payload).digest('base64url')
    expect(verifyUnsubscribeToken(`${payload}.${sig}`, SECRET)).toBeNull()
  })
```

E acrescente no topo do arquivo: `import { createHmac } from 'node:crypto'`. Os outros `it` que usam `.toBeNull()` continuam iguais.

- [ ] **Step 2: Escrever o teste da rota**

`apps/web/__tests__/notifications/unsubscribe-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock é içado para o topo; o que a fábrica usa precisa vir de vi.hoisted.
const { upsertFrequency, listUserOrgIds } = vi.hoisted(() => ({
  upsertFrequency: vi.fn(async (..._a: unknown[]) => {}),
  listUserOrgIds: vi.fn(async (..._a: unknown[]) => ['org-a', 'org-b']),
}))
vi.mock('@/lib/notifications/preferences-store', () => ({ upsertFrequency, listUserOrgIds }))
vi.mock('@/lib/db/rls', () => ({
  withUserDbFor: vi.fn(async (_u: string, fn: (tx: unknown) => unknown) => fn({})),
}))

import { POST } from '@/app/api/email/unsubscribe/route'
import { signUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'

const USER = '6f1c2b3a-1111-4222-8333-944455556666'
const ORG = '11111111-2222-4333-8444-555566667777'
const req = (token: string) =>
  new Request(`https://app.test/api/email/unsubscribe?token=${token}`, { method: 'POST' })

describe('POST /api/email/unsubscribe', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's')
    upsertFrequency.mockClear()
  })

  it('token com org desliga o e-mail só daquela org', async () => {
    const res = await POST(req(signUnsubscribeToken(USER, 's', ORG)))
    expect(res.status).toBe(200)
    expect(upsertFrequency).toHaveBeenCalledWith({}, USER, [ORG], 'email', 'off')
  })

  it('token antigo desliga o e-mail em todas as orgs do usuário', async () => {
    await POST(req(signUnsubscribeToken(USER, 's')))
    expect(upsertFrequency).toHaveBeenCalledWith({}, USER, ['org-a', 'org-b'], 'email', 'off')
  })

  it('token inválido não mexe em nada', async () => {
    const res = await POST(req('lixo'))
    expect(res.status).toBe(400)
    expect(upsertFrequency).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/unsubscribe`
Expected: FAIL (`preferences-store` não existe; o formato de retorno do token mudou)

- [ ] **Step 4: Criar `preferences-store.ts`**

```ts
/**
 * Escrita de preferência de notificação, sempre dentro de uma transação sob
 * RLS (withUserDb/withUserDbFor). NÃO é 'use server': recebe userId, e uma
 * server action com userId de parâmetro deixaria o cliente escolher o usuário.
 */
import { notificationPreferences, orgMembers, type RlsTx } from '@floow/db'
import { eq, sql } from 'drizzle-orm'
import type { Channel, Frequency } from './schedule'

export async function listUserOrgIds(tx: RlsTx, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
  return rows.map((r) => r.orgId)
}

export async function upsertFrequency(
  tx: RlsTx,
  userId: string,
  orgIds: string[],
  channel: Channel,
  frequency: Frequency,
): Promise<void> {
  if (orgIds.length === 0) return
  await tx
    .insert(notificationPreferences)
    .values(orgIds.map((orgId) => ({ orgId, userId, channel, frequency, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: [notificationPreferences.orgId, notificationPreferences.userId, notificationPreferences.channel],
      set: { frequency: sql`excluded.frequency`, updatedAt: sql`now()` },
    })
}
```

- [ ] **Step 5: Atualizar `unsubscribe-token.ts`**

Substitua `signUnsubscribeToken` e `verifyUnsubscribeToken` (o `UUID_RE` e o `sign` continuam):

```ts
export function signUnsubscribeToken(
  userId: string,
  secret: string | undefined,
  orgId?: string,
): string {
  if (!secret) throw new Error('Segredo de descadastro não configurado')
  const raw = orgId ? `${userId}:${orgId}` : userId
  const payload = Buffer.from(raw, 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/**
 * { userId, orgId } se o token for válido; null em qualquer outro caso.
 * orgId null = token anterior à preferência por org (vale para todas).
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string | undefined,
): { userId: string; orgId: string | null } | null {
  if (!secret || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts

  const expected = Buffer.from(sign(payload, secret), 'utf8')
  const presented = Buffer.from(sig, 'utf8')
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null

  const [userId, orgId, ...resto] = Buffer.from(payload, 'base64url').toString('utf8').split(':')
  if (resto.length > 0 || !UUID_RE.test(userId)) return null
  if (orgId === undefined) return { userId, orgId: null }
  return UUID_RE.test(orgId) ? { userId, orgId } : null
}
```

Atualize também o comentário do topo do arquivo: o payload agora é `base64url(userId[:orgId]).hmac`.

- [ ] **Step 6: Atualizar a rota `app/api/email/unsubscribe/route.ts`**

Troque os imports de `profiles`/`eq` por:

```ts
import { verifyUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'
import { listUserOrgIds, upsertFrequency } from '@/lib/notifications/preferences-store'
import { withUserDbFor } from '@/lib/db/rls'
```

No `GET`, só troque `if (!verifyUnsubscribeToken(...))` pela mesma checagem, porque o retorno continua sendo "truthy" ou null. Mude o texto do `<p>` para: `Você não vai mais receber por e-mail o ritmo de gastos desta conta. Dá para religar em Configurações.`

No `POST`, troque o corpo por:

```ts
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const parsed = verifyUnsubscribeToken(token, process.env.CRON_SECRET)
  if (!parsed) return invalid()
  const { userId, orgId } = parsed

  // Sob o RLS do dono do token: mesmo com bug aqui, só as linhas dele mudam.
  await withUserDbFor(userId, async (tx) => {
    const orgIds = orgId ? [orgId] : await listUserOrgIds(tx, userId)
    await upsertFrequency(tx, userId, orgIds, 'email', 'off')
  })

  return page(
    'Pronto',
    '<p style="color:#475467">Você não vai mais receber o ritmo de gastos por e-mail. Para religar, vá em Configurações no app.</p>',
  )
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications`
Expected: PASS. O `pacing-email-job.test.ts` antigo continua passando, porque ele só confere o prefixo da URL.

- [ ] **Step 8: Typecheck e commit**

Run: `pnpm --filter @floow/web typecheck`
Expected: PASS

```bash
git branch --show-current
git add apps/web/lib/notifications/preferences-store.ts apps/web/lib/notifications/unsubscribe-token.ts apps/web/app/api/email/unsubscribe/route.ts apps/web/__tests__/notifications/unsubscribe-token.test.ts apps/web/__tests__/notifications/unsubscribe-route.test.ts
git commit -m "feat(notificacoes): descadastro do e-mail passa a ser por org

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
