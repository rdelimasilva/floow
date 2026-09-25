# Ritmo no WhatsApp — Parte 6: Job

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 8: Job `runPacingAlertsForOrg`

**Files:**
- Create: `apps/web/lib/notifications/pacing-alerts-job.ts`
- Test: `apps/web/__tests__/notifications/pacing-alerts-job.test.ts`

**Interfaces:**
- Consumes: `Recipient`, `ChannelAdapter` (Tarefa 7); `buildPacingSummary` (Tarefa 4); `CHANNELS`, `decideSend`, `weekdayOf`, `Channel` (Tarefa 3); `selectPacingAlerts`, `PacingAlert` (já existem).
- Produces:
  ```ts
  // pacing-alerts-job.ts
  export interface PacingAlertsDeps {
    loadPacing(orgId: string): Promise<BudgetPacingAnalyzerInput | undefined>
    loadLastSent(orgId: string, month: string): Promise<Record<Channel, Record<string, PacingStatus>>>
    loadRecipients(orgId: string): Promise<Recipient[]>
    loadOrgName(orgId: string): Promise<string>
    saveSent(orgId: string, month: string, channel: Channel, alerts: PacingAlert[]): Promise<void>
    channels: Record<Channel, ChannelAdapter>
    appUrl: string
  }
  runPacingAlertsForOrg(orgId: string, deps: PacingAlertsDeps): Promise<{ sent: Record<Channel, number> }>
  ```

- [ ] **Step 1: Escrever o teste do job**

`apps/web/__tests__/notifications/pacing-alerts-job.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { BudgetPacingAnalyzerInput } from '@floow/core-finance'
import { runPacingAlertsForOrg, type PacingAlertsDeps } from '@/lib/notifications/pacing-alerts-job'
import type { Recipient } from '@/lib/notifications/channels/types'

const SEGUNDA = 28 // 28/09/2026
const TERCA = 29

function input(day: number, over: { plannedCents?: number } = {}): BudgetPacingAnalyzerInput {
  return {
    month: '2026-09',
    categoryNames: { a: 'Alimentação' },
    pacing: {
      series: [],
      total: {
        plannedCents: over.plannedCents ?? 100000, spentCents: 90000, unbudgetedCents: 0,
        projectedCents: 180000, confidence: 'normal', daysElapsed: day, daysInMonth: 30,
      },
      byCategory: [{ categoryId: 'a', plannedCents: 100000, spentCents: 120000, projectedCents: 240000, status: 'estourado' }],
    },
  } as BudgetPacingAnalyzerInput
}

const rec = (userId: string, email: Recipient['frequencies']['email'], whatsapp: Recipient['frequencies']['whatsapp']): Recipient => ({
  userId, email: `${userId}@x.com`, whatsappPhone: '+5511999998888', frequencies: { email, whatsapp },
})
const okSend = () => vi.fn(async () => ({ ok: true as const, id: '1' }))
const JA_ENVIADO = { email: { a: 'estourado' as const }, whatsapp: { a: 'estourado' as const } }

function deps(over: Partial<PacingAlertsDeps> = {}): PacingAlertsDeps {
  return {
    loadPacing: vi.fn(async () => input(TERCA)),
    loadLastSent: vi.fn(async () => ({ email: {}, whatsapp: {} })),
    loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'off')]),
    loadOrgName: vi.fn(async () => 'Casa'),
    saveSent: vi.fn(async () => {}),
    channels: { email: { send: okSend() }, whatsapp: { send: okSend() } },
    appUrl: 'https://app.test',
    ...over,
  }
}

describe('runPacingAlertsForOrg', () => {
  it('piora nova: e-mail em "alerts" recebe alerta e o estado do e-mail é gravado', async () => {
    const d = deps()
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 1, whatsapp: 0 })
    expect(vi.mocked(d.channels.email.send).mock.calls[0][1]).toMatchObject({
      kind: 'alert', orgName: 'Casa', pacingUrl: 'https://app.test/budgets/pacing',
    })
    expect(d.saveSent).toHaveBeenCalledTimes(1)
    expect(d.saveSent).toHaveBeenCalledWith('org', '2026-09', 'email', [expect.objectContaining({ categoryId: 'a' })])
  })

  it('segunda: WhatsApp semanal recebe resumo mesmo sem piora, e nada é gravado', async () => {
    const d = deps({
      loadPacing: vi.fn(async () => input(SEGUNDA)),
      loadLastSent: vi.fn(async () => JA_ENVIADO),
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'weekly')]),
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 0, whatsapp: 1 })
    expect(vi.mocked(d.channels.whatsapp.send).mock.calls[0][1].kind).toBe('summary')
    expect(d.saveSent).not.toHaveBeenCalled()
  })

  it('terça sem piora: semanal e alertas não recebem nada', async () => {
    const d = deps({
      loadLastSent: vi.fn(async () => JA_ENVIADO),
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'weekly')]),
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 0, whatsapp: 0 })
  })

  it('diário recebe resumo todo dia', async () => {
    const d = deps({
      loadLastSent: vi.fn(async () => JA_ENVIADO),
      loadRecipients: vi.fn(async () => [rec('u1', 'off', 'daily')]),
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 0, whatsapp: 1 })
  })

  it('e-mail falha e WhatsApp não: só o estado do WhatsApp é gravado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'alerts')]),
      channels: {
        email: { send: vi.fn(async () => ({ ok: false as const, error: 'x' })) },
        whatsapp: { send: okSend() },
      },
    })
    await runPacingAlertsForOrg('org', d)
    expect(d.saveSent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(d.saveSent).mock.calls[0][2]).toBe('whatsapp')
  })

  it('canal que lança exceção não derruba o outro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'alerts')]),
      channels: {
        email: { send: vi.fn(async () => { throw new Error('boom') }) },
        whatsapp: { send: okSend() },
      },
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 0, whatsapp: 1 })
  })

  it('cada destinatário segue a própria frequência', async () => {
    const d = deps({ loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'off'), rec('u2', 'off', 'off')]) })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 1, whatsapp: 0 })
    expect(vi.mocked(d.channels.email.send).mock.calls[0][0].userId).toBe('u1')
  })

  it('org sem orçamento no mês não envia nem o resumo diário', async () => {
    const d = deps({
      loadPacing: vi.fn(async () => input(TERCA, { plannedCents: 0 })),
      loadRecipients: vi.fn(async () => [rec('u1', 'daily', 'daily')]),
    })
    expect((await runPacingAlertsForOrg('org', d)).sent).toEqual({ email: 0, whatsapp: 0 })
    expect(d.loadRecipients).not.toHaveBeenCalled()
  })

  it('mês não iniciado (daysElapsed 0) não envia', async () => {
    const d = deps({ loadPacing: vi.fn(async () => input(0)) })
    expect((await runPacingAlertsForOrg('org', d)).sent).toEqual({ email: 0, whatsapp: 0 })
  })

  it('sem teto definido (loadPacing undefined) não faz nada', async () => {
    const d = deps({ loadPacing: vi.fn(async () => undefined) })
    expect((await runPacingAlertsForOrg('org', d)).sent).toEqual({ email: 0, whatsapp: 0 })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/pacing-alerts-job.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar `pacing-alerts-job.ts`**

```ts
/**
 * Ritmo de gasto diário, por org e por canal. Chamado pelo cron /api/cfo/run-daily.
 *
 * Fluxo: calcula o ritmo UMA vez -> por canal, acha o que piorou desde o último
 * envio daquele canal -> para cada membro, decideSend(frequência, dia, piora)
 * -> envia -> grava o estado do canal se algo saiu e havia piora. Estado por
 * canal: se o e-mail sai e o WhatsApp falha, só o WhatsApp repete amanhã.
 */
import type { BudgetPacingAnalyzerInput, PacingStatus } from '@floow/core-finance'
import { selectPacingAlerts, type PacingAlert } from './pacing-alerts'
import { buildPacingSummary } from './pacing-summary'
import { CHANNELS, decideSend, weekdayOf, type Channel } from './schedule'
import type { ChannelAdapter, Recipient } from './channels/types'

export interface PacingAlertsDeps {
  loadPacing(orgId: string): Promise<BudgetPacingAnalyzerInput | undefined>
  loadLastSent(orgId: string, month: string): Promise<Record<Channel, Record<string, PacingStatus>>>
  loadRecipients(orgId: string): Promise<Recipient[]>
  loadOrgName(orgId: string): Promise<string>
  saveSent(orgId: string, month: string, channel: Channel, alerts: PacingAlert[]): Promise<void>
  channels: Record<Channel, ChannelAdapter>
  appUrl: string
}

export async function runPacingAlertsForOrg(
  orgId: string,
  deps: PacingAlertsDeps,
): Promise<{ sent: Record<Channel, number> }> {
  const sent: Record<Channel, number> = { email: 0, whatsapp: 0 }

  const input = await deps.loadPacing(orgId)
  if (!input) return { sent }
  const { total } = input.pacing
  if (total.daysElapsed === 0 || total.plannedCents === 0) return { sent }

  const lastSent = await deps.loadLastSent(orgId, input.month)
  const recipients = await deps.loadRecipients(orgId)
  if (recipients.length === 0) return { sent }

  const orgName = await deps.loadOrgName(orgId)
  const pacingUrl = `${deps.appUrl}/budgets/pacing`
  const summary = buildPacingSummary(input, orgName, pacingUrl)
  const weekday = weekdayOf(input.month, total.daysElapsed)

  for (const channel of CHANNELS) {
    const alerts = selectPacingAlerts(input.pacing, lastSent[channel] ?? {})

    for (const r of recipients) {
      const kind = decideSend(r.frequencies[channel], weekday, alerts.length > 0)
      if (kind === 'none') continue
      try {
        const res = await deps.channels[channel].send(r, {
          kind,
          orgId,
          orgName,
          month: input.month,
          daysElapsed: total.daysElapsed,
          daysInMonth: total.daysInMonth,
          summary,
          alerts,
          categoryNames: input.categoryNames,
          pacingUrl,
        })
        if (res.ok) sent[channel]++
        else console.error(`[ritmo:${channel}] falha org=${orgId} user=${r.userId}: ${res.error}`)
      } catch (err) {
        console.error(`[ritmo:${channel}] erro org=${orgId} user=${r.userId}:`, err)
      }
    }

    // O resumo também mostra as categorias que pioraram, então conta como aviso.
    if (sent[channel] > 0 && alerts.length > 0) {
      await deps.saveSent(orgId, input.month, channel, alerts)
    }
  }

  return { sent }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/pacing-alerts-job.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/notifications/pacing-alerts-job.ts apps/web/__tests__/notifications/pacing-alerts-job.test.ts
git commit -m "feat(notificacoes): job de ritmo por canal e frequência

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
