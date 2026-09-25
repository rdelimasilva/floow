# Ritmo no WhatsApp — Parte 9: Verificação do número

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 11: Verificação do número de WhatsApp

**Files:**
- Create: `apps/web/lib/notifications/whatsapp-verification.ts` (regras, com deps injetadas)
- Create: `apps/web/lib/notifications/whatsapp-verification-actions.ts` (`'use server'`, liga as deps reais)
- Test: `apps/web/__tests__/notifications/whatsapp-verification.test.ts`

**Interfaces:**
- Consumes: `normalizePhone` (Tarefa 2); `sendWhatsAppTemplate`, `SendResult` (Tarefa 5); `WA_TEMPLATES` (Tarefa 7); `whatsappVerifications`, `profiles` (Tarefa 1); `consumeRateLimit` (`@/lib/rate-limit/consume`, já existe).
- Produces:
  ```ts
  // whatsapp-verification.ts
  export const CODE_TTL_MS = 600_000, MAX_ATTEMPTS = 5, MAX_SENDS_PER_HOUR = 3
  export interface PendingCode { phone: string; codeHash: string; expiresAt: Date; attempts: number }
  export interface VerificationDeps { ... ver código ... }
  export type RequestCodeResult = { ok: true; phone: string } | { ok: false; error: 'invalid_phone' | 'in_use' | 'rate_limited' | 'send_failed' }
  export type ConfirmCodeResult = { ok: true; phone: string } | { ok: false; error: 'no_pending' | 'expired' | 'too_many_attempts' | 'wrong_code' | 'in_use' }
  export function hashCode(userId: string, phone: string, code: string, secret: string): string
  export function requestCode(userId: string, rawPhone: string, deps: VerificationDeps): Promise<RequestCodeResult>
  export function confirmCode(userId: string, code: string, deps: VerificationDeps): Promise<ConfirmCodeResult>
  // whatsapp-verification-actions.ts
  requestWhatsAppCode(rawPhone: string): Promise<RequestCodeResult>
  confirmWhatsAppCode(code: string): Promise<ConfirmCodeResult>
  removeWhatsApp(): Promise<void>
  ```

Confirmar o número **não mexe nas preferências**. Sem linha gravada, o padrão já é `weekly` em todas as orgs, que é o opt-in combinado. Se o usuário tinha respondido SAIR (linhas `off`), essa escolha continua valendo até ele mudar na tela.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  requestCode, confirmCode, hashCode, MAX_ATTEMPTS, type VerificationDeps, type PendingCode,
} from '@/lib/notifications/whatsapp-verification'

const U = 'u1'
const PHONE = '+5511999998888'
const NOW = new Date('2026-09-25T12:00:00Z')

function deps(over: Partial<VerificationDeps> = {}): VerificationDeps {
  return {
    isVerifiedByOther: vi.fn(async () => false),
    consumeSendQuota: vi.fn(async () => true),
    savePending: vi.fn(async () => {}),
    loadPending: vi.fn(async () => undefined),
    bumpAttempts: vi.fn(async () => {}),
    markVerified: vi.fn(async () => 'ok' as const),
    deletePending: vi.fn(async () => {}),
    sendCode: vi.fn(async () => ({ ok: true as const, id: 'w' })),
    secret: 's',
    now: () => NOW,
    generateCode: () => '123456',
    ...over,
  }
}
const pending = (over: Partial<PendingCode> = {}): PendingCode => ({
  phone: PHONE, codeHash: hashCode(U, PHONE, '123456', 's'),
  expiresAt: new Date(NOW.getTime() + 60_000), attempts: 0, ...over,
})

describe('requestCode', () => {
  it('normaliza, grava só o hash e manda o código', async () => {
    const d = deps()
    expect(await requestCode(U, '(11) 99999-8888', d)).toEqual({ ok: true, phone: PHONE })
    const saved = vi.mocked(d.savePending).mock.calls[0][0]
    expect(saved).toMatchObject({ userId: U, phone: PHONE, codeHash: hashCode(U, PHONE, '123456', 's') })
    expect(saved.expiresAt.getTime()).toBe(NOW.getTime() + 600_000)
    expect(JSON.stringify(saved)).not.toContain('"123456"')
    expect(d.sendCode).toHaveBeenCalledWith(PHONE, '123456')
  })

  it('telefone inválido', async () => {
    const d = deps()
    expect(await requestCode(U, '123', d)).toEqual({ ok: false, error: 'invalid_phone' })
    expect(d.consumeSendQuota).not.toHaveBeenCalled()
  })

  it('número já verificado por outro usuário', async () => {
    const d = deps({ isVerifiedByOther: vi.fn(async () => true) })
    expect(await requestCode(U, PHONE, d)).toEqual({ ok: false, error: 'in_use' })
    expect(d.sendCode).not.toHaveBeenCalled()
  })

  it('passou do limite de envios: não grava nem manda', async () => {
    const d = deps({ consumeSendQuota: vi.fn(async () => false) })
    expect(await requestCode(U, PHONE, d)).toEqual({ ok: false, error: 'rate_limited' })
    expect(d.savePending).not.toHaveBeenCalled()
    expect(d.sendCode).not.toHaveBeenCalled()
  })

  it('falha no envio vira send_failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({ sendCode: vi.fn(async () => ({ ok: false as const, error: 'x' })) })
    expect(await requestCode(U, PHONE, d)).toEqual({ ok: false, error: 'send_failed' })
  })
})

describe('confirmCode', () => {
  it('código certo verifica o número e apaga o pendente', async () => {
    const d = deps({ loadPending: vi.fn(async () => pending()) })
    expect(await confirmCode(U, ' 123456 ', d)).toEqual({ ok: true, phone: PHONE })
    expect(d.markVerified).toHaveBeenCalledWith(U, PHONE)
    expect(d.deletePending).toHaveBeenCalledWith(U)
  })

  it('sem código pendente', async () => {
    expect(await confirmCode(U, '123456', deps())).toEqual({ ok: false, error: 'no_pending' })
  })

  it('expirado', async () => {
    const d = deps({ loadPending: vi.fn(async () => pending({ expiresAt: new Date(NOW.getTime() - 1) })) })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'expired' })
    expect(d.markVerified).not.toHaveBeenCalled()
  })

  it('código errado soma tentativa', async () => {
    const d = deps({ loadPending: vi.fn(async () => pending()) })
    expect(await confirmCode(U, '000000', d)).toEqual({ ok: false, error: 'wrong_code' })
    expect(d.bumpAttempts).toHaveBeenCalledWith(U)
  })

  it('esgotou as tentativas: nem o código certo passa', async () => {
    const d = deps({ loadPending: vi.fn(async () => pending({ attempts: MAX_ATTEMPTS })) })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'too_many_attempts' })
    expect(d.markVerified).not.toHaveBeenCalled()
  })

  it('outro usuário verificou o número no meio do caminho', async () => {
    const d = deps({
      loadPending: vi.fn(async () => pending()),
      markVerified: vi.fn(async () => 'in_use' as const),
    })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'in_use' })
  })

  it('o hash amarra usuário e número: código de outro usuário não serve', async () => {
    const d = deps({ loadPending: vi.fn(async () => pending({ codeHash: hashCode('u2', PHONE, '123456', 's') })) })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'wrong_code' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/whatsapp-verification.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar `whatsapp-verification.ts`**

```ts
/**
 * Verificação do número de WhatsApp por código de 6 dígitos.
 *
 * Regras aqui, I/O nas deps (mesmo padrão do job de ritmo), para testar sem
 * banco nem Meta. Guarda só o HMAC do código, amarrado a usuário + número:
 * vazamento da tabela não entrega códigos, e código de um não serve para outro.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { normalizePhone } from './phone'
import type { SendResult } from './send-whatsapp'

export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_ATTEMPTS = 5
export const MAX_SENDS_PER_HOUR = 3

export interface PendingCode {
  phone: string
  codeHash: string
  expiresAt: Date
  attempts: number
}

export interface VerificationDeps {
  isVerifiedByOther(userId: string, phone: string): Promise<boolean>
  /** true se ainda cabe um envio nesta hora. */
  consumeSendQuota(userId: string): Promise<boolean>
  savePending(p: { userId: string; phone: string; codeHash: string; expiresAt: Date }): Promise<void>
  loadPending(userId: string): Promise<PendingCode | undefined>
  bumpAttempts(userId: string): Promise<void>
  /** 'in_use' quando o índice único recusa (outro usuário verificou antes). */
  markVerified(userId: string, phone: string): Promise<'ok' | 'in_use'>
  deletePending(userId: string): Promise<void>
  sendCode(phone: string, code: string): Promise<SendResult>
  secret: string
  now(): Date
  generateCode(): string
}

export type RequestCodeResult =
  | { ok: true; phone: string }
  | { ok: false; error: 'invalid_phone' | 'in_use' | 'rate_limited' | 'send_failed' }

export type ConfirmCodeResult =
  | { ok: true; phone: string }
  | { ok: false; error: 'no_pending' | 'expired' | 'too_many_attempts' | 'wrong_code' | 'in_use' }

export function hashCode(userId: string, phone: string, code: string, secret: string): string {
  return createHmac('sha256', `whatsapp-code:${secret}`).update(`${userId}:${phone}:${code}`).digest('hex')
}

export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

export async function requestCode(
  userId: string,
  rawPhone: string,
  deps: VerificationDeps,
): Promise<RequestCodeResult> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return { ok: false, error: 'invalid_phone' }
  if (await deps.isVerifiedByOther(userId, phone)) return { ok: false, error: 'in_use' }
  // Cada código custa dinheiro e chega no celular de alguém: a trava vem
  // antes de gravar e de enviar.
  if (!(await deps.consumeSendQuota(userId))) return { ok: false, error: 'rate_limited' }

  const code = deps.generateCode()
  await deps.savePending({
    userId,
    phone,
    codeHash: hashCode(userId, phone, code, deps.secret),
    expiresAt: new Date(deps.now().getTime() + CODE_TTL_MS),
  })
  const res = await deps.sendCode(phone, code)
  if (!res.ok) {
    console.error(`[whatsapp-codigo] falha user=${userId}: ${res.error}`)
    return { ok: false, error: 'send_failed' }
  }
  return { ok: true, phone }
}

export async function confirmCode(
  userId: string,
  code: string,
  deps: VerificationDeps,
): Promise<ConfirmCodeResult> {
  const pending = await deps.loadPending(userId)
  if (!pending) return { ok: false, error: 'no_pending' }
  if (pending.expiresAt.getTime() <= deps.now().getTime()) return { ok: false, error: 'expired' }
  if (pending.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'too_many_attempts' }

  const expected = Buffer.from(pending.codeHash, 'utf8')
  const presented = Buffer.from(hashCode(userId, pending.phone, code.trim(), deps.secret), 'utf8')
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    await deps.bumpAttempts(userId)
    return { ok: false, error: 'wrong_code' }
  }

  if ((await deps.markVerified(userId, pending.phone)) === 'in_use') return { ok: false, error: 'in_use' }
  await deps.deletePending(userId)
  return { ok: true, phone: pending.phone }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/whatsapp-verification.test.ts`
Expected: PASS

- [ ] **Step 5: Criar `whatsapp-verification-actions.ts`**

```ts
'use server'
/**
 * Server actions da verificação do WhatsApp. O userId vem sempre da sessão.
 *
 * whatsapp_verifications e rate_limits não têm policy (só backend), então usam
 * getServiceDb. A escrita em profiles vai sob o RLS do próprio usuário.
 */
import { getServiceDb, profiles, whatsappVerifications } from '@floow/db'
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/session'
import { withUserDb } from '@/lib/db/rls'
import { consumeRateLimit } from '@/lib/rate-limit/consume'
import { sendWhatsAppTemplate } from './send-whatsapp'
import { WA_TEMPLATES } from './channels/whatsapp'
import {
  confirmCode, generateCode, requestCode, MAX_SENDS_PER_HOUR,
  type ConfirmCodeResult, type RequestCodeResult, type VerificationDeps,
} from './whatsapp-verification'

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

function realDeps(): VerificationDeps {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET ausente — verificação do WhatsApp indisponível')
  const db = getServiceDb()
  return {
    async isVerifiedByOther(userId, phone) {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.whatsappPhone, phone), isNotNull(profiles.whatsappVerifiedAt), ne(profiles.id, userId)))
        .limit(1)
      return rows.length > 0
    },
    async consumeSendQuota(userId) {
      const r = await consumeRateLimit(db, {
        bucket: 'whatsapp.code', subject: userId, limit: MAX_SENDS_PER_HOUR, windowSeconds: 3600,
      })
      return r.allowed
    },
    async savePending({ userId, phone, codeHash, expiresAt }) {
      await db
        .insert(whatsappVerifications)
        .values({ userId, phone, codeHash, expiresAt, attempts: 0 })
        .onConflictDoUpdate({
          target: whatsappVerifications.userId,
          set: { phone, codeHash, expiresAt, attempts: 0, createdAt: sql`now()` },
        })
    },
    async loadPending(userId) {
      const [row] = await db
        .select({
          phone: whatsappVerifications.phone,
          codeHash: whatsappVerifications.codeHash,
          expiresAt: whatsappVerifications.expiresAt,
          attempts: whatsappVerifications.attempts,
        })
        .from(whatsappVerifications)
        .where(eq(whatsappVerifications.userId, userId))
      return row
    },
    async bumpAttempts(userId) {
      await db
        .update(whatsappVerifications)
        .set({ attempts: sql`${whatsappVerifications.attempts} + 1` })
        .where(eq(whatsappVerifications.userId, userId))
    },
    async markVerified(userId, phone) {
      try {
        await withUserDb((tx) =>
          tx
            .update(profiles)
            .set({ whatsappPhone: phone, whatsappVerifiedAt: new Date(), updatedAt: new Date() })
            .where(eq(profiles.id, userId)),
        )
        return 'ok'
      } catch (err) {
        if (isUniqueViolation(err)) return 'in_use'
        throw err
      }
    },
    async deletePending(userId) {
      await db.delete(whatsappVerifications).where(eq(whatsappVerifications.userId, userId))
    },
    sendCode: (phone, code) =>
      sendWhatsAppTemplate({ to: phone, template: WA_TEMPLATES.code, bodyParams: [code], buttonParams: [code] }),
    secret,
    now: () => new Date(),
    generateCode,
  }
}

export async function requestWhatsAppCode(rawPhone: string): Promise<RequestCodeResult> {
  const userId = await requireUserId()
  return requestCode(userId, String(rawPhone ?? ''), realDeps())
}

export async function confirmWhatsAppCode(code: string): Promise<ConfirmCodeResult> {
  const userId = await requireUserId()
  return confirmCode(userId, String(code ?? ''), realDeps())
}

export async function removeWhatsApp(): Promise<void> {
  const userId = await requireUserId()
  await withUserDb((tx) =>
    tx
      .update(profiles)
      .set({ whatsappPhone: null, whatsappVerifiedAt: null, updatedAt: new Date() })
      .where(eq(profiles.id, userId)),
  )
  await getServiceDb().delete(whatsappVerifications).where(eq(whatsappVerifications.userId, userId))
}
```

- [ ] **Step 6: Typecheck, suíte e commit**

Run: `pnpm --filter @floow/web typecheck`
Expected: PASS

Run: `pnpm --filter @floow/web test -- __tests__/notifications __tests__/auth`
Expected: PASS (o `rls-ledger` só olha `getDb()`; aqui é `getServiceDb()`)

```bash
git branch --show-current
git add apps/web/lib/notifications/whatsapp-verification.ts apps/web/lib/notifications/whatsapp-verification-actions.ts apps/web/__tests__/notifications/whatsapp-verification.test.ts
git commit -m "feat(notificacoes): verificação do número de WhatsApp por código

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
