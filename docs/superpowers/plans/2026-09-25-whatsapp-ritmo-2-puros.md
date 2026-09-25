# Ritmo no WhatsApp — Parte 2: Funções puras

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 2: Normalização de telefone (`phone.ts`)

**Files:**
- Create: `apps/web/lib/notifications/phone.ts`
- Test: `apps/web/__tests__/notifications/phone.test.ts`

**Interfaces:**
- Produces:
  - `normalizePhone(raw: string): string | null`: E.164 (`+5511999998888`) ou `null`
  - `phoneCandidatesFromWaId(waId: string): string[]`: formas E.164 possíveis para o `from` do webhook
  - `formatPhoneDisplay(e164: string): string`: `+55 11 99999-8888`

Contexto: para números brasileiros antigos, a Meta às vezes manda o `wa_id` **sem o nono dígito** (`551199998888`). O webhook precisa achar o usuário mesmo assim, e é para isso que existe `phoneCandidatesFromWaId`.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest'
import { normalizePhone, phoneCandidatesFromWaId, formatPhoneDisplay } from '@/lib/notifications/phone'

describe('normalizePhone', () => {
  it.each([
    ['(11) 99999-8888', '+5511999998888'],
    ['11999998888', '+5511999998888'],
    ['+55 11 9 9999 8888', '+5511999998888'],
    ['5511999998888', '+5511999998888'],
    ['55999998888', '+5555999998888'], // DDD 55 (Santa Maria/RS) sem DDI
    ['+1 415 555 0101', '+14155550101'],
  ])('%s -> %s', (raw, e164) => {
    expect(normalizePhone(raw)).toBe(e164)
  })

  it.each([
    [''],
    ['abc'],
    ['1199998888'], // fixo / sem o 9
    ['(01) 99999-8888'], // DDD inválido
    ['551199998888'], // BR com DDI, mas sem o 9
    ['+12'], // curto demais
    ['+1234567890123456'], // longo demais
  ])('recusa %s', (raw) => {
    expect(normalizePhone(raw)).toBeNull()
  })
})

describe('phoneCandidatesFromWaId', () => {
  it('número com o 9 vira uma forma só', () => {
    expect(phoneCandidatesFromWaId('5511999998888')).toEqual(['+5511999998888'])
  })
  it('BR sem o 9 tenta também com o 9', () => {
    expect(phoneCandidatesFromWaId('551199998888')).toEqual(['+551199998888', '+5511999998888'])
  })
  it('estrangeiro fica como veio', () => {
    expect(phoneCandidatesFromWaId('14155550101')).toEqual(['+14155550101'])
  })
})

describe('formatPhoneDisplay', () => {
  it('formata celular BR', () => {
    expect(formatPhoneDisplay('+5511999998888')).toBe('+55 11 99999-8888')
  })
  it('estrangeiro fica como está', () => {
    expect(formatPhoneDisplay('+14155550101')).toBe('+14155550101')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/phone.test.ts`
Expected: FAIL (módulo `@/lib/notifications/phone` não existe)

- [ ] **Step 3: Implementar**

```ts
/**
 * Telefone para WhatsApp, em E.164.
 *
 * Sem biblioteca: o caso real é celular brasileiro, e a regra dele cabe numa
 * regex. Número com "+" é aceito de qualquer país (8 a 15 dígitos, o limite
 * do E.164) sem validação extra: quem digita DDI sabe o que está fazendo, e
 * o código de verificação prova o resto.
 */

/** DDD (11–99, sem zero) + 9 + 8 dígitos. */
const BR_MOBILE = /^[1-9][1-9]9\d{8}$/

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  let full: string
  if (trimmed.startsWith('+')) full = digits
  else if (digits.length === 10 || digits.length === 11) full = `55${digits}`
  else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) full = digits
  else return null

  if (full.startsWith('55')) return BR_MOBILE.test(full.slice(2)) ? `+${full}` : null
  return full.length >= 8 && full.length <= 15 ? `+${full}` : null
}

/**
 * Formas E.164 possíveis para o `from` (wa_id) de uma mensagem recebida. A Meta
 * manda alguns celulares brasileiros sem o nono dígito; o cadastro tem o 9.
 */
export function phoneCandidatesFromWaId(waId: string): string[] {
  const digits = waId.replace(/\D/g, '')
  const asIs = `+${digits}`
  if (digits.startsWith('55') && digits.length === 12) {
    return [asIs, `+55${digits.slice(2, 4)}9${digits.slice(4)}`]
  }
  return [asIs]
}

export function formatPhoneDisplay(e164: string): string {
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164)
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : e164
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/phone.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/notifications/phone.ts apps/web/__tests__/notifications/phone.test.ts
git commit -m "feat(notificacoes): normaliza telefone de WhatsApp para E.164

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: O que sai hoje (`schedule.ts`)

**Files:**
- Create: `apps/web/lib/notifications/schedule.ts`
- Test: `apps/web/__tests__/notifications/schedule.test.ts`

**Interfaces:**
- Consumes: os tipos `NotificationChannel` e `NotificationFrequency` de `@floow/db` (Tarefa 1).
- Produces:
  - `type Channel = NotificationChannel`, `type Frequency = NotificationFrequency`, `type SendKind = 'summary' | 'alert' | 'none'`
  - `CHANNELS: readonly Channel[]`, `FREQUENCIES: readonly Frequency[]`
  - `DEFAULT_FREQUENCY: Record<Channel, Frequency>`
  - `isChannel(x: unknown): x is Channel`, `isFrequency(x: unknown): x is Frequency`
  - `resolveFrequency(channel: Channel, stored: Frequency | undefined, whatsappVerified: boolean): Frequency`
  - `weekdayOf(month: string, day: number): number`, com 0 = domingo
  - `decideSend(frequency: Frequency, weekday: number, hasWorsening: boolean): SendKind`

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest'
import {
  decideSend, resolveFrequency, weekdayOf, isChannel, isFrequency, DEFAULT_FREQUENCY,
} from '@/lib/notifications/schedule'

const SEG = 1
const TER = 2

describe('decideSend', () => {
  it.each([
    ['daily', SEG, false, 'summary'],
    ['daily', TER, false, 'summary'],
    ['daily', TER, true, 'summary'],
    ['weekly', SEG, false, 'summary'],
    ['weekly', SEG, true, 'summary'],
    ['weekly', TER, true, 'alert'],
    ['weekly', TER, false, 'none'],
    ['alerts', SEG, true, 'alert'],
    ['alerts', SEG, false, 'none'],
    ['alerts', TER, true, 'alert'],
    ['off', SEG, true, 'none'],
    ['off', TER, true, 'none'],
  ] as const)('%s, dia %i, piora=%s -> %s', (freq, dia, piora, esperado) => {
    expect(decideSend(freq, dia, piora)).toBe(esperado)
  })
})

describe('resolveFrequency', () => {
  it('sem linha usa o padrão do canal', () => {
    expect(resolveFrequency('email', undefined, false)).toBe('alerts')
    expect(resolveFrequency('whatsapp', undefined, true)).toBe('weekly')
    expect(DEFAULT_FREQUENCY).toEqual({ email: 'alerts', whatsapp: 'weekly' })
  })
  it('linha gravada vence o padrão', () => {
    expect(resolveFrequency('email', 'off', false)).toBe('off')
    expect(resolveFrequency('whatsapp', 'daily', true)).toBe('daily')
  })
  it('WhatsApp sem número verificado é sempre off', () => {
    expect(resolveFrequency('whatsapp', 'daily', false)).toBe('off')
    expect(resolveFrequency('whatsapp', undefined, false)).toBe('off')
  })
})

describe('weekdayOf', () => {
  it('28/09/2026 é segunda', () => expect(weekdayOf('2026-09', 28)).toBe(1))
  it('27/09/2026 é domingo', () => expect(weekdayOf('2026-09', 27)).toBe(0))
  it('01/03/2028 (ano bissexto) é quarta', () => expect(weekdayOf('2028-03', 1)).toBe(3))
})

describe('guards', () => {
  it('isChannel', () => {
    expect(isChannel('email')).toBe(true)
    expect(isChannel('sms')).toBe(false)
    expect(isChannel(undefined)).toBe(false)
  })
  it('isFrequency', () => {
    expect(isFrequency('weekly')).toBe(true)
    expect(isFrequency('hourly')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/schedule.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar**

```ts
/**
 * Decide o que cada pessoa recebe hoje, por canal. Função pura.
 *
 * - daily: resumo todo dia
 * - weekly: resumo na segunda; nos outros dias, só se alguma categoria piorou
 * - alerts: só quando alguma categoria piorou (comportamento original do e-mail)
 * - off: nada
 */
import type { NotificationChannel, NotificationFrequency } from '@floow/db'

export type Channel = NotificationChannel
export type Frequency = NotificationFrequency
export type SendKind = 'summary' | 'alert' | 'none'

export const CHANNELS: readonly Channel[] = ['email', 'whatsapp']
export const FREQUENCIES: readonly Frequency[] = ['daily', 'weekly', 'alerts', 'off']

/** Vale quando não há linha em notification_preferences. */
export const DEFAULT_FREQUENCY: Record<Channel, Frequency> = { email: 'alerts', whatsapp: 'weekly' }

/** Segunda-feira (Date#getUTCDay). */
const SUMMARY_WEEKDAY = 1

export const isChannel = (x: unknown): x is Channel => CHANNELS.includes(x as Channel)
export const isFrequency = (x: unknown): x is Frequency => FREQUENCIES.includes(x as Frequency)

export function resolveFrequency(
  channel: Channel,
  stored: Frequency | undefined,
  whatsappVerified: boolean,
): Frequency {
  if (channel === 'whatsapp' && !whatsappVerified) return 'off'
  return stored ?? DEFAULT_FREQUENCY[channel]
}

/**
 * Dia da semana do dia `day` de `month` (YYYY-MM). Montado em UTC a partir do
 * dia já resolvido em America/Sao_Paulo, para não depender do fuso do servidor.
 */
export function weekdayOf(month: string, day: number): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay()
}

export function decideSend(frequency: Frequency, weekday: number, hasWorsening: boolean): SendKind {
  switch (frequency) {
    case 'daily':
      return 'summary'
    case 'weekly':
      if (weekday === SUMMARY_WEEKDAY) return 'summary'
      return hasWorsening ? 'alert' : 'none'
    case 'alerts':
      return hasWorsening ? 'alert' : 'none'
    default:
      return 'none'
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/schedule.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/notifications/schedule.ts apps/web/__tests__/notifications/schedule.test.ts
git commit -m "feat(notificacoes): regra de frequência (diário, semanal, só alertas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

