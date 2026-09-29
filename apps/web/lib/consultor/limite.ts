import { getDb } from '@floow/db'
import { consumeRateLimit } from '@/lib/rate-limit/consume'

/** Rajada: segura o laço. Teto horário: segura o uso sustentado. Vale para todo canal. */
const BURST = Number(process.env.CFO_CHAT_BURST_LIMIT ?? 8)
const HOURLY = Number(process.env.CFO_CHAT_HOURLY_LIMIT ?? 30)

export type ResultadoDoLimite = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export async function consumirLimiteDoConsultor(orgId: string): Promise<ResultadoDoLimite> {
  const db = getDb()
  for (const janela of [
    { bucket: 'cfo.chat.burst', limit: BURST, windowSeconds: 60 },
    { bucket: 'cfo.chat.hour', limit: HOURLY, windowSeconds: 3600 },
  ]) {
    const r = await consumeRateLimit(db, { ...janela, subject: orgId })
    if (!r.allowed) return { allowed: false, retryAfterSeconds: r.retryAfterSeconds }
  }
  return { allowed: true }
}
