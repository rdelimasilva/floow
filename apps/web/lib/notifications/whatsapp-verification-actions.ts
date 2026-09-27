'use server'
/**
 * Server actions da ligação do WhatsApp. O userId vem sempre da sessão.
 *
 * Gerar o código usa a conexão de serviço (whatsapp_verifications e
 * rate_limits não têm policy — ver whatsapp-link-deps). Ler o status e
 * remover o número (limpar as duas colunas) ficam sob o RLS do usuário.
 */
import { getServiceDb, profiles, whatsappVerifications } from '@floow/db'
import { eq } from 'drizzle-orm'
import QRCode from 'qrcode'
import { requireUserId } from '@/lib/auth/session'
import { withUserDb } from '@/lib/db/rls'
import { startLink, formatLinkCode } from './whatsapp-verification'
import { startLinkDeps } from './whatsapp-link-deps'

export type StartWhatsAppLinkResult =
  | { ok: true; code: string; link: string; qrSvg: string; expiresAt: string }
  | { ok: false; error: 'rate_limited' | 'not_configured' }

/** Número do floow no WhatsApp, só dígitos com DDI (ex.: 5511971773256). */
function floowNumber(): string | null {
  const digits = (process.env.WHATSAPP_DISPLAY_NUMBER ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

export async function startWhatsAppLink(): Promise<StartWhatsAppLinkResult> {
  const userId = await requireUserId()
  const number = floowNumber()
  if (!number) return { ok: false, error: 'not_configured' }

  const r = await startLink(userId, startLinkDeps())
  if (!r.ok) return r

  const code = formatLinkCode(r.code)
  const link = `https://wa.me/${number}?text=${encodeURIComponent(`floow ${code}`)}`
  const qrSvg = await QRCode.toString(link, { type: 'svg', margin: 1 })
  return { ok: true, code, link, qrSvg, expiresAt: r.expiresAt.toISOString() }
}

export async function getWhatsAppStatus(): Promise<{ verified: boolean; phone: string | null }> {
  const userId = await requireUserId()
  const [row] = await withUserDb((tx) =>
    tx
      .select({ phone: profiles.whatsappPhone, verifiedAt: profiles.whatsappVerifiedAt })
      .from(profiles)
      .where(eq(profiles.id, userId)),
  )
  const verified = Boolean(row?.phone && row.verifiedAt)
  return { verified, phone: verified ? row!.phone : null }
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
