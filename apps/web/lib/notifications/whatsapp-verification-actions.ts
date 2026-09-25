'use server'
/**
 * Server actions da verificação do WhatsApp. O userId vem sempre da sessão.
 *
 * whatsapp_verifications e rate_limits não têm policy (só backend), então usam
 * getServiceDb. Confirmar o código também grava profiles pelo serviço — uma
 * trigger em profiles barra o papel authenticated nessas duas colunas de
 * propósito, então withUserDb nunca conseguiria (ver migration 00065). Só
 * remover o número (limpar as duas colunas) continua sob o RLS do usuário.
 */
import { getServiceDb, profiles, whatsappVerifications } from '@floow/db'
import { and, eq, gt, isNotNull, lt, ne, sql } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/session'
import { withUserDb } from '@/lib/db/rls'
import { consumeRateLimit } from '@/lib/rate-limit/consume'
import { sendWhatsAppTemplate } from './send-whatsapp'
import { WA_TEMPLATES } from './channels/whatsapp'
import {
  confirmCode, generateCode, requestCode, MAX_ATTEMPTS, MAX_SENDS_PER_HOUR,
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
    async claimAttempt(userId) {
      // UPDATE ... RETURNING é atômico no Postgres: duas confirmações
      // concorrentes não conseguem as duas ler attempts=0 e ganhar uma
      // tentativa cada — só uma linha sai daqui por vez, já com o incremento.
      const [row] = await db
        .update(whatsappVerifications)
        .set({ attempts: sql`${whatsappVerifications.attempts} + 1` })
        .where(and(
          eq(whatsappVerifications.userId, userId),
          lt(whatsappVerifications.attempts, MAX_ATTEMPTS),
          gt(whatsappVerifications.expiresAt, sql`now()`),
        ))
        .returning({
          phone: whatsappVerifications.phone,
          codeHash: whatsappVerifications.codeHash,
          expiresAt: whatsappVerifications.expiresAt,
          attempts: whatsappVerifications.attempts,
        })
      return row
    },
    async markVerified(userId, phone) {
      // Serviço, não withUserDb: a trigger de profiles bloqueia o papel
      // authenticated escrevendo whatsapp_phone/whatsapp_verified_at de
      // propósito (ver migration 00065) — só o backend grava aqui, e só
      // depois de confirmar o código.
      try {
        const rows = await db
          .update(profiles)
          .set({ whatsappPhone: phone, whatsappVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(profiles.id, userId))
          .returning({ id: profiles.id })
        if (rows.length === 0) throw new Error(`profiles: usuário ${userId} não encontrado ao verificar WhatsApp`)
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
