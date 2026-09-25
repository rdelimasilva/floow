# Ritmo no WhatsApp — Parte 7: Cron

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 9: Dependências reais e troca no cron

**Files:**
- Create: `apps/web/lib/notifications/recipients.ts`
- Create: `apps/web/lib/notifications/pacing-alerts-deps.ts`
- Modify: `apps/web/app/api/cfo/run-daily/route.ts`
- Modify: `apps/web/__tests__/auth/rls-ledger.test.ts` (entrada de `SERVICO`)
- Modify: `apps/web/lib/finance/category-suggestions/job.ts:4` (comentário que cita `pacing-email-job.ts`)
- Delete: `apps/web/lib/notifications/pacing-email-job.ts`, `apps/web/lib/notifications/pacing-email-deps.ts`, `apps/web/__tests__/notifications/pacing-email-job.test.ts`
- Test: `apps/web/__tests__/notifications/recipients.test.ts`

**Interfaces:**
- Consumes: `PacingAlertsDeps`, `runPacingAlertsForOrg` (Tarefa 8); `createEmailChannel`, `createWhatsAppChannel` (Tarefa 7); `resolveFrequency`, `CHANNELS` (Tarefa 3); tabelas da Tarefa 1.
- Produces:
  - `recipients.ts`:
    ```ts
    export interface MemberRow { userId: string; email: string; whatsappPhone: string | null; whatsappVerifiedAt: Date | null }
    export interface PrefRow { userId: string; channel: Channel; frequency: Frequency }
    export function mergeRecipients(members: MemberRow[], prefs: PrefRow[]): Recipient[]
    ```
  - `pacing-alerts-deps.ts`: `defaultPacingAlertsDeps(): PacingAlertsDeps`

- [ ] **Step 1: Escrever o teste de `mergeRecipients`**

```ts
import { describe, it, expect } from 'vitest'
import { mergeRecipients, type MemberRow } from '@/lib/notifications/recipients'

const m = (userId: string, phone: string | null, verified: boolean): MemberRow => ({
  userId, email: `${userId}@x.com`, whatsappPhone: phone, whatsappVerifiedAt: verified ? new Date() : null,
})

describe('mergeRecipients', () => {
  it('sem preferência gravada: e-mail alerts, WhatsApp weekly se verificado', () => {
    const [r] = mergeRecipients([m('u1', '+5511999998888', true)], [])
    expect(r).toEqual({
      userId: 'u1', email: 'u1@x.com', whatsappPhone: '+5511999998888',
      frequencies: { email: 'alerts', whatsapp: 'weekly' },
    })
  })

  it('número não verificado: WhatsApp off e telefone omitido', () => {
    const [r] = mergeRecipients([m('u1', '+5511999998888', false)], [])
    expect(r.whatsappPhone).toBeNull()
    expect(r.frequencies.whatsapp).toBe('off')
  })

  it('preferência gravada vence o padrão, só para o próprio usuário', () => {
    const rs = mergeRecipients(
      [m('u1', null, false), m('u2', null, false)],
      [{ userId: 'u1', channel: 'email', frequency: 'daily' }],
    )
    expect(rs.find((r) => r.userId === 'u1')!.frequencies.email).toBe('daily')
    expect(rs.find((r) => r.userId === 'u2')!.frequencies.email).toBe('alerts')
  })

  it('quem está com tudo desligado nem entra na lista', () => {
    const rs = mergeRecipients([m('u1', null, false)], [{ userId: 'u1', channel: 'email', frequency: 'off' }])
    expect(rs).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/recipients.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Criar `recipients.ts`**

```ts
/**
 * Junta membros da org com as preferências gravadas e aplica os padrões.
 * Pura; a consulta fica em pacing-alerts-deps.ts.
 */
import { CHANNELS, resolveFrequency, type Channel, type Frequency } from './schedule'
import type { Recipient } from './channels/types'

export interface MemberRow {
  userId: string
  email: string
  whatsappPhone: string | null
  whatsappVerifiedAt: Date | null
}

export interface PrefRow {
  userId: string
  channel: Channel
  frequency: Frequency
}

export function mergeRecipients(members: MemberRow[], prefs: PrefRow[]): Recipient[] {
  return members
    .map((m) => {
      const verified = Boolean(m.whatsappPhone && m.whatsappVerifiedAt)
      const stored = (ch: Channel) =>
        prefs.find((p) => p.userId === m.userId && p.channel === ch)?.frequency
      const frequencies = Object.fromEntries(
        CHANNELS.map((ch) => [ch, resolveFrequency(ch, stored(ch), verified)]),
      ) as Record<Channel, Frequency>
      return {
        userId: m.userId,
        email: m.email,
        whatsappPhone: verified ? m.whatsappPhone : null,
        frequencies,
      }
    })
    .filter((r) => CHANNELS.some((ch) => r.frequencies[ch] !== 'off'))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/recipients.test.ts`
Expected: PASS

- [ ] **Step 5: Criar `pacing-alerts-deps.ts`**

```ts
/**
 * Implementação real (Drizzle + Resend + Meta) das dependências do job de
 * ritmo. Separada do job para ele ser testável sem banco.
 */
import {
  getDb, orgs, orgMembers, profiles, pacingAlertState, notificationPreferences,
} from '@floow/db'
import { and, eq, sql } from 'drizzle-orm'
import type { PacingStatus } from '@floow/core-finance'
import { buildBudgetPacingInput } from '@/lib/cfo/budget-pacing-input'
import { getAppUrl } from '@/lib/app-url'
import { sendEmail } from './send-email'
import { sendWhatsAppTemplate } from './send-whatsapp'
import { createEmailChannel } from './channels/email'
import { createWhatsAppChannel } from './channels/whatsapp'
import { mergeRecipients } from './recipients'
import type { Channel } from './schedule'
import type { PacingAlertsDeps } from './pacing-alerts-job'

export function defaultPacingAlertsDeps(): PacingAlertsDeps {
  const db = getDb()
  const appUrl = getAppUrl()
  return {
    loadPacing: buildBudgetPacingInput,

    async loadLastSent(orgId, month) {
      const rows = await db
        .select({
          categoryId: pacingAlertState.categoryId,
          status: pacingAlertState.status,
          channel: pacingAlertState.channel,
        })
        .from(pacingAlertState)
        .where(and(eq(pacingAlertState.orgId, orgId), eq(pacingAlertState.month, month)))
      const out: Record<Channel, Record<string, PacingStatus>> = { email: {}, whatsapp: {} }
      for (const r of rows) out[r.channel][r.categoryId] = r.status as PacingStatus
      return out
    },

    async loadRecipients(orgId) {
      const members = await db
        .select({
          userId: profiles.id,
          email: profiles.email,
          whatsappPhone: profiles.whatsappPhone,
          whatsappVerifiedAt: profiles.whatsappVerifiedAt,
        })
        .from(orgMembers)
        .innerJoin(profiles, eq(profiles.id, orgMembers.userId))
        .where(eq(orgMembers.orgId, orgId))
      const prefs = await db
        .select({
          userId: notificationPreferences.userId,
          channel: notificationPreferences.channel,
          frequency: notificationPreferences.frequency,
        })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.orgId, orgId))
      return mergeRecipients(members, prefs)
    },

    async loadOrgName(orgId) {
      const [row] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId))
      return row?.name ?? 'sua conta'
    },

    async saveSent(orgId, month, channel, alerts) {
      await db
        .insert(pacingAlertState)
        .values(alerts.map((a) => ({ orgId, month, categoryId: a.categoryId, status: a.status, channel })))
        .onConflictDoUpdate({
          target: [
            pacingAlertState.orgId, pacingAlertState.month,
            pacingAlertState.categoryId, pacingAlertState.channel,
          ],
          set: { status: sql`excluded.status`, sentAt: sql`now()` },
        })
    },

    channels: {
      email: createEmailChannel({ appUrl, secret: process.env.CRON_SECRET, send: (i) => sendEmail(i) }),
      whatsapp: createWhatsAppChannel({ sendTemplate: (m) => sendWhatsAppTemplate(m) }),
    },
    appUrl,
  }
}
```

- [ ] **Step 6: Trocar no cron `app/api/cfo/run-daily/route.ts`**

Troque os dois imports de `pacing-email-*` por:

```ts
import { runPacingAlertsForOrg } from '@/lib/notifications/pacing-alerts-job'
import { defaultPacingAlertsDeps } from '@/lib/notifications/pacing-alerts-deps'
```

Troque `const emailDeps = defaultPacingEmailDeps()` por:

```ts
    let whatsappSent = 0
    const alertDeps = defaultPacingAlertsDeps()
```

Troque o bloco `const sent = await Promise.all(...)` + `emailsSent += ...` por:

```ts
      // Ritmo roda depois do engine e isolado dele: falha de envio não pode
      // apagar os insights do dia, nem o contrário.
      const sent = await Promise.all(
        batch.map((row) =>
          runPacingAlertsForOrg(row.orgId, alertDeps)
            .then((r) => r.sent)
            .catch((err) => {
              console.error(`[ritmo] falhou para org=${row.orgId}:`, err)
              return { email: 0, whatsapp: 0 }
            })
        )
      )
      emailsSent += sent.reduce((s, n) => s + n.email, 0)
      whatsappSent += sent.reduce((s, n) => s + n.whatsapp, 0)
```

E no JSON de resposta: `{ ok: true, orgs: activeOrgs.length, insights: totalInsights, emailsSent, whatsappSent }`.

- [ ] **Step 7: Apagar o job antigo e atualizar as referências**

```bash
git rm apps/web/lib/notifications/pacing-email-job.ts apps/web/lib/notifications/pacing-email-deps.ts apps/web/__tests__/notifications/pacing-email-job.test.ts
```

Em `apps/web/__tests__/auth/rls-ledger.test.ts`, dentro de `SERVICO`, troque a entrada de `pacing-email-deps.ts` por:

```ts
  'lib/notifications/pacing-alerts-deps.ts':
    'só é chamado por run-daily: lê membros e preferências de todas as orgs para o aviso de ritmo',
```

Em `apps/web/lib/finance/category-suggestions/job.ts`, linha 4, troque `notifications/pacing-email-job.ts` por `notifications/pacing-alerts-job.ts`.

- [ ] **Step 8: Rodar a suíte e o typecheck**

Run: `pnpm --filter @floow/web test -- __tests__/notifications __tests__/auth`
Expected: PASS (incluindo `rls-ledger` e `cron-routes-get`)

Run: `pnpm --filter @floow/web typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

Os arquivos apagados já entraram no índice pelo `git rm` do Step 7.

```bash
git branch --show-current
git add apps/web/lib/notifications/recipients.ts apps/web/lib/notifications/pacing-alerts-deps.ts apps/web/app/api/cfo/run-daily/route.ts apps/web/__tests__/auth/rls-ledger.test.ts apps/web/lib/finance/category-suggestions/job.ts apps/web/__tests__/notifications/recipients.test.ts
git commit -m "feat(notificacoes): cron diário usa o job de ritmo por canal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
