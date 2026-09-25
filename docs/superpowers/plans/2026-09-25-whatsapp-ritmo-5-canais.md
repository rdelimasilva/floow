# Ritmo no WhatsApp — Parte 5: Canais

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 7: Canais plugáveis (e-mail e WhatsApp)

**Files:**
- Modify: `apps/web/lib/notifications/format.ts` (+ `escapeHtml`)
- Modify: `apps/web/lib/notifications/pacing-email.ts` (importa `escapeHtml` de `format.ts` e apaga a cópia local)
- Create: `apps/web/lib/notifications/pacing-summary-email.ts`
- Create: `apps/web/lib/notifications/channels/types.ts`
- Create: `apps/web/lib/notifications/channels/email.ts`
- Create: `apps/web/lib/notifications/channels/whatsapp.ts`
- Test: `apps/web/__tests__/notifications/channels.test.ts`

**Interfaces:**
- Consumes: `buildPacingSummary`, `projectionPhrase`, `summaryLines`, `PacingSummary` (Tarefa 4); `CHANNELS`, `decideSend`, `weekdayOf`, `Channel`, `Frequency` (Tarefa 3); `sendWhatsAppTemplate`, `TemplateMessage`, `SendResult` (Tarefa 5); `signUnsubscribeToken(userId, secret, orgId)` (Tarefa 6); `selectPacingAlerts`, `PacingAlert` (já existem); `buildPacingEmail`, `BuiltEmail` (já existem).
- Produces:
  ```ts
  // channels/types.ts
  export type { SendResult } from '../send-whatsapp'
  export interface Recipient {
    userId: string
    email: string
    whatsappPhone: string | null            // só se verificado
    frequencies: Record<Channel, Frequency> // já resolvidas (resolveFrequency)
  }
  export interface ChannelMessage {
    kind: 'summary' | 'alert'
    orgId: string; orgName: string; month: string
    daysElapsed: number; daysInMonth: number
    summary: PacingSummary; alerts: PacingAlert[]
    categoryNames: Record<string, string>; pacingUrl: string
  }
  export interface ChannelAdapter { send(r: Recipient, m: ChannelMessage): Promise<SendResult> }

  // channels/email.ts
  createEmailChannel(deps: { appUrl: string; secret: string | undefined; send: (i: SendEmailInput) => Promise<SendEmailResult> }): ChannelAdapter
  // channels/whatsapp.ts
  WA_TEMPLATES = { code: 'floow_codigo', summary: 'floow_resumo_ritmo', alert: 'floow_alerta_ritmo' }
  summaryParams(s: PacingSummary): string[]   // 12 parâmetros
  alertParams(m: ChannelMessage): string[]    // 3 parâmetros
  createWhatsAppChannel(deps: { sendTemplate: (m: TemplateMessage) => Promise<SendResult> }): ChannelAdapter
  // pacing-summary-email.ts
  buildPacingSummaryEmail(s: PacingSummary, unsubscribeUrl: string): BuiltEmail
  ```

- [ ] **Step 1: Escrever o teste dos canais**

`apps/web/__tests__/notifications/channels.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createEmailChannel } from '@/lib/notifications/channels/email'
import { createWhatsAppChannel, summaryParams, WA_TEMPLATES } from '@/lib/notifications/channels/whatsapp'
import type { ChannelMessage, Recipient } from '@/lib/notifications/channels/types'
import type { PacingSummary } from '@/lib/notifications/pacing-summary'
import { verifyUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'
import type { SendEmailInput } from '@/lib/notifications/send-email'
import type { TemplateMessage } from '@/lib/notifications/send-whatsapp'

const USER = '6f1c2b3a-1111-4222-8333-944455556666'
const ORG = '11111111-2222-4333-8444-555566667777'

const summary: PacingSummary = {
  orgName: 'Casa', monthName: 'setembro', day: 25, daysInMonth: 30,
  plannedCents: 800000, expectedCents: 666667, spentCents: 712000, pctOfExpected: 107,
  projectedCents: 854000, projectedDiffCents: 54000, flagged: 'Alimentação estourado',
  pacingUrl: 'https://app.test/budgets/pacing',
}
const msg = (kind: 'summary' | 'alert'): ChannelMessage => ({
  kind, orgId: ORG, orgName: 'Casa', month: '2026-09', daysElapsed: 25, daysInMonth: 30, summary,
  alerts: [{ categoryId: 'a', status: 'estourado', plannedCents: 100000, spentCents: 125000, projectedCents: 150000 }],
  categoryNames: { a: 'Alimentação' }, pacingUrl: summary.pacingUrl,
})
const rec: Recipient = {
  userId: USER, email: 'a@x.com', whatsappPhone: '+5511999998888',
  frequencies: { email: 'alerts', whatsapp: 'weekly' },
}

describe('canal de e-mail', () => {
  const setup = () => {
    const send = vi.fn(async (_i: SendEmailInput) => ({ ok: true as const, id: '1' }))
    return { send, ch: createEmailChannel({ appUrl: 'https://app.test', secret: 's', send }) }
  }

  it('alerta usa o e-mail de alerta e o link de descadastro leva a org', async () => {
    const { send, ch } = setup()
    await ch.send(rec, msg('alert'))
    const arg = send.mock.calls[0][0]
    expect(arg.to).toBe('a@x.com')
    expect(arg.subject).toBe('Orçamento estourado: Alimentação')
    const token = new URL(arg.unsubscribeUrl!).searchParams.get('token')!
    expect(verifyUnsubscribeToken(token, 's')).toEqual({ userId: USER, orgId: ORG })
  })

  it('resumo usa o e-mail de resumo', async () => {
    const { send, ch } = setup()
    await ch.send(rec, msg('summary'))
    const arg = send.mock.calls[0][0]
    expect(arg.subject).toBe('Ritmo de gastos em Casa: 107% do esperado até o dia 25')
    expect(arg.text).toContain('Esperado até hoje: R$ 6.666,67')
    expect(arg.html).toContain('Realizado até hoje: R$ 7.120,00 (107% do esperado)')
  })
})

describe('canal de WhatsApp', () => {
  const setup = () => {
    const sendTemplate = vi.fn(async (_m: TemplateMessage) => ({ ok: true as const, id: 'w' }))
    return { sendTemplate, ch: createWhatsAppChannel({ sendTemplate }) }
  }

  it('resumo manda o template de resumo com 12 parâmetros de uma linha', async () => {
    const { sendTemplate, ch } = setup()
    await ch.send(rec, msg('summary'))
    const arg = sendTemplate.mock.calls[0][0]
    expect(arg.to).toBe('+5511999998888')
    expect(arg.template).toBe(WA_TEMPLATES.summary)
    expect(arg.bodyParams).toEqual(summaryParams(summary))
    expect(arg.bodyParams).toHaveLength(12)
    expect(arg.bodyParams).toEqual([
      'Casa', 'setembro', '25', '30', 'R$ 8.000,00', 'R$ 6.666,67', 'R$ 7.120,00', '107%',
      'R$ 8.540,00', 'estoura em R$ 540,00', 'Alimentação estourado', 'https://app.test/budgets/pacing',
    ])
    for (const p of arg.bodyParams) expect(p).not.toMatch(/[\n\t]| {5,}/)
  })

  it('alerta manda o template de alerta', async () => {
    const { sendTemplate, ch } = setup()
    await ch.send(rec, msg('alert'))
    expect(sendTemplate.mock.calls[0][0]).toMatchObject({
      template: WA_TEMPLATES.alert,
      bodyParams: ['Casa', 'Alimentação estourou o teto', 'https://app.test/budgets/pacing'],
    })
  })

  it('sem número verificado não tenta enviar', async () => {
    const { sendTemplate, ch } = setup()
    const r = await ch.send({ ...rec, whatsappPhone: null }, msg('summary'))
    expect(r).toEqual({ ok: false, error: 'no_phone' })
    expect(sendTemplate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/channels.test.ts`
Expected: FAIL (módulos não existem)

- [ ] **Step 3: Mover `escapeHtml` para `format.ts`**

Acrescente a `format.ts`:

```ts
export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
```

Em `pacing-email.ts`, apague a `const escapeHtml` local e mude o import para `import { brl, MESES, escapeHtml } from './format'`.

- [ ] **Step 4: Criar `pacing-summary-email.ts`**

```ts
/** E-mail do resumo de ritmo (frequência diária/semanal). Mesmo estilo do e-mail de alerta. */
import { escapeHtml } from './format'
import { summaryLines, type PacingSummary } from './pacing-summary'
import type { BuiltEmail } from './pacing-email'

export function buildPacingSummaryEmail(s: PacingSummary, unsubscribeUrl: string): BuiltEmail {
  const lines = summaryLines(s)
  const [title, ...rest] = lines
  const body = rest.slice(0, -1) // a última é "Ver detalhes: <url>", que vira botão

  const subject = `Ritmo de gastos em ${s.orgName}: ${s.pctOfExpected}% do esperado até o dia ${s.day}`
  const rows = body
    .map((l) => `<tr><td style="padding:6px 0;color:#344054;font-size:14px">${escapeHtml(l)}</td></tr>`)
    .join('\n')

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<tr><td style="font-size:18px;font-weight:700;color:#101828;padding-bottom:8px">${escapeHtml(title)}</td></tr>
${rows}
<tr><td style="padding-top:20px"><a href="${escapeHtml(s.pacingUrl)}" style="display:inline-block;background:#101828;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Ver ritmo de gastos</a></td></tr>
<tr><td style="padding-top:24px;color:#98a2b3;font-size:12px">Você recebe este resumo porque escolheu essa frequência em Configurações.
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#98a2b3">Parar de receber</a>.</td></tr>
</table></body></html>`

  const text = [...lines, '', `Parar de receber: ${unsubscribeUrl}`].join('\n')
  return { subject, html, text }
}
```

- [ ] **Step 5: Criar `channels/types.ts`**

```ts
import type { PacingSummary } from '../pacing-summary'
import type { PacingAlert } from '../pacing-alerts'
import type { Channel, Frequency } from '../schedule'
import type { SendResult } from '../send-whatsapp'

export type { SendResult }

export interface Recipient {
  userId: string
  email: string
  /** Só preenchido com número verificado. */
  whatsappPhone: string | null
  /** Já resolvidas: padrão aplicado e WhatsApp sem número = 'off'. */
  frequencies: Record<Channel, Frequency>
}

export interface ChannelMessage {
  kind: 'summary' | 'alert'
  orgId: string
  orgName: string
  /** YYYY-MM */
  month: string
  daysElapsed: number
  daysInMonth: number
  summary: PacingSummary
  /** Categorias que pioraram desde o último envio deste canal. */
  alerts: PacingAlert[]
  categoryNames: Record<string, string>
  pacingUrl: string
}

/** Um canal só formata e envia. Quem decide o que sai é o job. */
export interface ChannelAdapter {
  send(r: Recipient, m: ChannelMessage): Promise<SendResult>
}
```

- [ ] **Step 6: Criar `channels/email.ts`**

```ts
import { buildPacingEmail } from '../pacing-email'
import { buildPacingSummaryEmail } from '../pacing-summary-email'
import { signUnsubscribeToken } from '../unsubscribe-token'
import type { SendEmailInput, SendEmailResult } from '../send-email'
import type { ChannelAdapter } from './types'

export function createEmailChannel(deps: {
  appUrl: string
  secret: string | undefined
  send: (input: SendEmailInput) => Promise<SendEmailResult>
}): ChannelAdapter {
  return {
    async send(r, m) {
      const token = signUnsubscribeToken(r.userId, deps.secret, m.orgId)
      const unsubscribeUrl = `${deps.appUrl}/api/email/unsubscribe?token=${token}`
      const email =
        m.kind === 'alert'
          ? buildPacingEmail({
              orgName: m.orgName,
              month: m.month,
              daysElapsed: m.daysElapsed,
              daysInMonth: m.daysInMonth,
              alerts: m.alerts,
              categoryNames: m.categoryNames,
              pacingUrl: m.pacingUrl,
              unsubscribeUrl,
            })
          : buildPacingSummaryEmail(m.summary, unsubscribeUrl)
      return deps.send({ to: r.email, ...email, unsubscribeUrl })
    },
  }
}
```

- [ ] **Step 7: Criar `channels/whatsapp.ts`**

```ts
/**
 * Canal de WhatsApp: só templates aprovados na Meta (mensagem iniciada pelo
 * floow). O texto de cada template está em docs/notificacoes/whatsapp-meta.md e precisa bater
 * com a quantidade de parâmetros montada aqui.
 */
import { brl, oneLine } from '../format'
import { projectionPhrase, type PacingSummary } from '../pacing-summary'
import type { TemplateMessage } from '../send-whatsapp'
import type { ChannelAdapter, ChannelMessage, SendResult } from './types'

export const WA_TEMPLATES = {
  code: 'floow_codigo',
  summary: 'floow_resumo_ritmo',
  alert: 'floow_alerta_ritmo',
} as const

/** {{1}}…{{12}} do floow_resumo_ritmo. */
export function summaryParams(s: PacingSummary): string[] {
  return [
    s.orgName,
    s.monthName,
    String(s.day),
    String(s.daysInMonth),
    brl(s.plannedCents),
    brl(s.expectedCents),
    brl(s.spentCents),
    `${s.pctOfExpected}%`,
    brl(s.projectedCents),
    projectionPhrase(s.projectedDiffCents),
    s.flagged,
    s.pacingUrl,
  ].map(oneLine)
}

/** {{1}}…{{3}} do floow_alerta_ritmo. */
export function alertParams(m: ChannelMessage): string[] {
  const line = m.alerts
    .map((a) => {
      const name = m.categoryNames[a.categoryId] ?? 'Categoria sem nome'
      return `${name} ${a.status === 'estourado' ? 'estourou o teto' : 'vai estourar no ritmo atual'}`
    })
    .join(' · ')
  return [m.orgName, line, m.pacingUrl].map(oneLine)
}

export function createWhatsAppChannel(deps: {
  sendTemplate: (msg: TemplateMessage) => Promise<SendResult>
}): ChannelAdapter {
  return {
    async send(r, m) {
      if (!r.whatsappPhone) return { ok: false, error: 'no_phone' }
      return deps.sendTemplate(
        m.kind === 'summary'
          ? { to: r.whatsappPhone, template: WA_TEMPLATES.summary, bodyParams: summaryParams(m.summary) }
          : { to: r.whatsappPhone, template: WA_TEMPLATES.alert, bodyParams: alertParams(m) },
      )
    },
  }
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications`
Expected: PASS em tudo.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add apps/web/lib/notifications/format.ts apps/web/lib/notifications/pacing-email.ts apps/web/lib/notifications/pacing-summary-email.ts apps/web/lib/notifications/channels/types.ts apps/web/lib/notifications/channels/email.ts apps/web/lib/notifications/channels/whatsapp.ts apps/web/__tests__/notifications/channels.test.ts
git commit -m "feat(notificacoes): canais de e-mail e WhatsApp para o ritmo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
