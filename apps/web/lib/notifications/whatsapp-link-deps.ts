/**
 * Deps reais da ligação do WhatsApp (whatsapp-verification.ts), todas pela
 * conexão de serviço: whatsapp_verifications e rate_limits não têm policy (só
 * backend), e a trigger de profiles barra o papel authenticated escrevendo
 * whatsapp_phone/whatsapp_verified_at de propósito (ver migration 00065).
 */
import { getServiceDb, profiles, whatsappVerifications } from '@floow/db'
import { and, eq, gt, sql } from 'drizzle-orm'
import { consumeRateLimit } from '@/lib/rate-limit/consume'
import { generateLinkCode, type CompleteLinkDeps, type StartLinkDeps } from './whatsapp-verification'

const HOUR = 3600
const MAX_STARTS_PER_HOUR = 5
const MAX_LINK_MESSAGES_PER_HOUR = 5

function linkSecret(): string {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET ausente — ligação do WhatsApp indisponível')
  return secret
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export function startLinkDeps(): StartLinkDeps {
  const db = getServiceDb()
  return {
    async consumeStartQuota(userId) {
      const r = await consumeRateLimit(db, {
        bucket: 'whatsapp.link.start', subject: userId, limit: MAX_STARTS_PER_HOUR, windowSeconds: HOUR,
      })
      return r.allowed
    },
    async savePending({ userId, codeHash, expiresAt }) {
      await db
        .insert(whatsappVerifications)
        .values({ userId, phone: null, codeHash, expiresAt, attempts: 0 })
        .onConflictDoUpdate({
          target: whatsappVerifications.userId,
          set: { phone: null, codeHash, expiresAt, attempts: 0, createdAt: sql`now()` },
        })
    },
    secret: linkSecret(),
    now: () => new Date(),
    generateCode: generateLinkCode,
  }
}

export function completeLinkDeps(): CompleteLinkDeps {
  const db = getServiceDb()
  return {
    async consumeSenderQuota(waId) {
      const r = await consumeRateLimit(db, {
        bucket: 'whatsapp.link', subject: waId, limit: MAX_LINK_MESSAGES_PER_HOUR, windowSeconds: HOUR,
      })
      return r.allowed
    },
    async claimCode(codeHash) {
      // DELETE ... RETURNING é atômico: duas mensagens com o mesmo código não
      // conseguem as duas levar a linha. A validade é julgada pelo relógio do
      // banco, o mesmo lado que compara em toda reivindicação.
      const [row] = await db
        .delete(whatsappVerifications)
        .where(and(eq(whatsappVerifications.codeHash, codeHash), gt(whatsappVerifications.expiresAt, sql`now()`)))
        .returning({ userId: whatsappVerifications.userId })
      return row?.userId
    },
    async markVerified(userId, phone) {
      try {
        const rows = await db
          .update(profiles)
          .set({ whatsappPhone: phone, whatsappVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(profiles.id, userId))
          .returning({ id: profiles.id })
        if (rows.length === 0) throw new Error(`profiles: usuário ${userId} não encontrado ao ligar o WhatsApp`)
        return 'ok'
      } catch (err) {
        if (isUniqueViolation(err)) return 'in_use'
        throw err
      }
    },
    secret: linkSecret(),
  }
}
