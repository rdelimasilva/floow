# Ritmo no WhatsApp — Parte 8: Preferências

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 10: Preferências por org × canal (actions)

**Files:**
- Create: `apps/web/lib/notifications/notification-settings.ts` (puro)
- Modify (reescrever): `apps/web/lib/notifications/preferences-actions.ts`
- Test: `apps/web/__tests__/notifications/notification-settings.test.ts`
- Test: `apps/web/__tests__/notifications/preferences-actions.test.ts`

**Interfaces:**
- Consumes: `upsertFrequency` (Tarefa 6); `resolveFrequency`, `CHANNELS`, `isChannel`, `isFrequency` (Tarefa 3).
- Produces:
  ```ts
  // notification-settings.ts
  export interface OrgNotificationRow { orgId: string; orgName: string; frequencies: Record<Channel, Frequency> }
  export interface NotificationSettings { whatsappPhone: string | null; whatsappVerified: boolean; orgs: OrgNotificationRow[] }
  export function buildNotificationSettings(
    profile: { whatsappPhone: string | null; whatsappVerifiedAt: Date | null } | undefined,
    memberOrgs: { orgId: string; orgName: string }[],
    prefs: { orgId: string; channel: Channel; frequency: Frequency }[],
  ): NotificationSettings
  // preferences-actions.ts ('use server')
  getNotificationSettings(): Promise<NotificationSettings>
  setNotificationFrequency(orgId: string, channel: string, frequency: string): Promise<void>
  ```
  `getPacingEmailPreference` e `setPacingEmailPreference` deixam de existir. O único consumidor deles é a tela, que é trocada na Tarefa 13. Até lá, o `page.tsx` e o `pacing-email-toggle.tsx` quebram o typecheck, então **esta tarefa também troca o `page.tsx` para não renderizar o toggle antigo** (Step 6).

- [ ] **Step 1: Escrever o teste do builder puro**

```ts
import { describe, it, expect } from 'vitest'
import { buildNotificationSettings } from '@/lib/notifications/notification-settings'

const orgs = [{ orgId: 'o1', orgName: 'Pessoal' }, { orgId: 'o2', orgName: 'Empresa' }]

describe('buildNotificationSettings', () => {
  it('sem número: WhatsApp off em todas as orgs, e-mail no padrão', () => {
    const s = buildNotificationSettings({ whatsappPhone: null, whatsappVerifiedAt: null }, orgs, [])
    expect(s.whatsappVerified).toBe(false)
    expect(s.orgs).toEqual([
      { orgId: 'o1', orgName: 'Pessoal', frequencies: { email: 'alerts', whatsapp: 'off' } },
      { orgId: 'o2', orgName: 'Empresa', frequencies: { email: 'alerts', whatsapp: 'off' } },
    ])
  })

  it('número verificado liga o WhatsApp semanal em todas as orgs', () => {
    const s = buildNotificationSettings({ whatsappPhone: '+5511999998888', whatsappVerifiedAt: new Date() }, orgs, [])
    expect(s.whatsappPhone).toBe('+5511999998888')
    expect(s.orgs.map((o) => o.frequencies.whatsapp)).toEqual(['weekly', 'weekly'])
  })

  it('linha gravada vale só para a org dela', () => {
    const s = buildNotificationSettings(
      { whatsappPhone: '+5511999998888', whatsappVerifiedAt: new Date() },
      orgs,
      [{ orgId: 'o2', channel: 'whatsapp', frequency: 'off' }],
    )
    expect(s.orgs.map((o) => o.frequencies.whatsapp)).toEqual(['weekly', 'off'])
  })

  it('número pendente (não verificado) não aparece como verificado', () => {
    const s = buildNotificationSettings({ whatsappPhone: '+5511999998888', whatsappVerifiedAt: null }, orgs, [])
    expect(s.whatsappVerified).toBe(false)
    expect(s.whatsappPhone).toBeNull()
  })
})
```

- [ ] **Step 2: Escrever o teste das actions**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock é içado para o topo; o que a fábrica usa precisa vir de vi.hoisted.
const { USER, upsertFrequency } = vi.hoisted(() => ({
  USER: '6f1c2b3a-1111-4222-8333-944455556666',
  upsertFrequency: vi.fn(async (..._a: unknown[]) => {}),
}))
const ORG = '11111111-2222-4333-8444-555566667777'
vi.mock('@/lib/auth/session', () => ({ requireUserId: vi.fn(async () => USER) }))
vi.mock('@/lib/db/rls', () => ({ withUserDb: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})) }))
vi.mock('@/lib/notifications/preferences-store', () => ({ upsertFrequency }))

import { setNotificationFrequency } from '@/lib/notifications/preferences-actions'

describe('setNotificationFrequency', () => {
  beforeEach(() => upsertFrequency.mockClear())

  it('grava para o usuário da sessão, só na org pedida', async () => {
    await setNotificationFrequency(ORG, 'whatsapp', 'daily')
    expect(upsertFrequency).toHaveBeenCalledWith({}, USER, [ORG], 'whatsapp', 'daily')
  })

  it.each([
    [ORG, 'sms', 'daily'],
    [ORG, 'email', 'hourly'],
    ['nao-uuid', 'email', 'off'],
  ])('recusa entrada inválida (%s, %s, %s)', async (org, ch, fr) => {
    await expect(setNotificationFrequency(org, ch, fr)).rejects.toThrow('Preferência inválida')
    expect(upsertFrequency).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/notification-settings.test.ts __tests__/notifications/preferences-actions.test.ts`
Expected: FAIL

- [ ] **Step 4: Criar `notification-settings.ts`**

```ts
/** Monta o que a tela de Notificações mostra. Pura; a consulta fica na action. */
import { CHANNELS, resolveFrequency, type Channel, type Frequency } from './schedule'

export interface OrgNotificationRow {
  orgId: string
  orgName: string
  frequencies: Record<Channel, Frequency>
}

export interface NotificationSettings {
  /** Só o número verificado; pendente não aparece. */
  whatsappPhone: string | null
  whatsappVerified: boolean
  orgs: OrgNotificationRow[]
}

export function buildNotificationSettings(
  profile: { whatsappPhone: string | null; whatsappVerifiedAt: Date | null } | undefined,
  memberOrgs: { orgId: string; orgName: string }[],
  prefs: { orgId: string; channel: Channel; frequency: Frequency }[],
): NotificationSettings {
  const verified = Boolean(profile?.whatsappPhone && profile?.whatsappVerifiedAt)
  return {
    whatsappPhone: verified ? profile!.whatsappPhone : null,
    whatsappVerified: verified,
    orgs: memberOrgs.map(({ orgId, orgName }) => ({
      orgId,
      orgName,
      frequencies: Object.fromEntries(
        CHANNELS.map((ch) => [
          ch,
          resolveFrequency(ch, prefs.find((p) => p.orgId === orgId && p.channel === ch)?.frequency, verified),
        ]),
      ) as Record<Channel, Frequency>,
    })),
  }
}
```

- [ ] **Step 5: Reescrever `preferences-actions.ts`**

```ts
'use server'
import { orgs, orgMembers, profiles, notificationPreferences } from '@floow/db'
import { asc, eq } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/session'
import { withUserDb } from '@/lib/db/rls'
import { upsertFrequency } from './preferences-store'
import { isChannel, isFrequency } from './schedule'
import { buildNotificationSettings, type NotificationSettings } from './notification-settings'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Preferências do usuário logado. A chave é o `sub` verificado, nunca um id do cliente. */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  const userId = await requireUserId()
  return withUserDb(async (tx) => {
    const [profile] = await tx
      .select({ whatsappPhone: profiles.whatsappPhone, whatsappVerifiedAt: profiles.whatsappVerifiedAt })
      .from(profiles)
      .where(eq(profiles.id, userId))
    const memberOrgs = await tx
      .select({ orgId: orgs.id, orgName: orgs.name })
      .from(orgMembers)
      .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, userId))
      .orderBy(asc(orgs.name))
    const prefs = await tx
      .select({
        orgId: notificationPreferences.orgId,
        channel: notificationPreferences.channel,
        frequency: notificationPreferences.frequency,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
    return buildNotificationSettings(profile, memberOrgs, prefs)
  })
}

/**
 * Grava a frequência de um canal numa org. O RLS garante que o usuário é
 * membro da org (policy de INSERT/UPDATE de notification_preferences).
 */
export async function setNotificationFrequency(
  orgId: string,
  channel: string,
  frequency: string,
): Promise<void> {
  const userId = await requireUserId()
  if (!UUID.test(orgId) || !isChannel(channel) || !isFrequency(frequency)) {
    throw new Error('Preferência inválida')
  }
  await withUserDb((tx) => upsertFrequency(tx, userId, [orgId], channel, frequency))
}
```

- [ ] **Step 6: Desligar o toggle antigo da tela (temporário até a Tarefa 13)**

Em `apps/web/app/(app)/settings/page.tsx`, remova o import de `PacingEmailToggle`, o de `getPacingEmailPreference`, a linha `const pacingEmailEnabled = ...` e o `<PacingEmailToggle ... />`. Apague `apps/web/app/(app)/settings/pacing-email-toggle.tsx` com `git rm`.

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications`
Expected: PASS

Run: `pnpm --filter @floow/web typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git rm "apps/web/app/(app)/settings/pacing-email-toggle.tsx"
git add apps/web/lib/notifications/notification-settings.ts apps/web/lib/notifications/preferences-actions.ts "apps/web/app/(app)/settings/page.tsx" apps/web/__tests__/notifications/notification-settings.test.ts apps/web/__tests__/notifications/preferences-actions.test.ts
git commit -m "feat(notificacoes): preferência de ritmo por org e canal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

