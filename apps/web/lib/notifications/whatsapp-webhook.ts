/**
 * Peças puras do webhook do WhatsApp: assinatura, leitura do corpo e palavra
 * de saída. A Meta assina o corpo cru com o app secret (X-Hub-Signature-256).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`
  return safeEqual(expected, header)
}

export interface InboundText {
  /** wa_id: só dígitos, com DDI. */
  from: string
  text: string
}

export interface DeliveryError {
  recipient: string
  code?: number
  title?: string
}

type Obj = Record<string, unknown>
const arr = (x: unknown): Obj[] => (Array.isArray(x) ? (x.filter((i) => i && typeof i === 'object') as Obj[]) : [])
const obj = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {})

export function parseWebhook(body: unknown): { texts: InboundText[]; errors: DeliveryError[] } {
  const texts: InboundText[] = []
  const errors: DeliveryError[] = []
  for (const entry of arr(obj(body).entry)) {
    for (const change of arr(entry.changes)) {
      const value = obj(change.value)
      for (const m of arr(value.messages)) {
        const text = obj(m.text).body
        if (m.type === 'text' && typeof m.from === 'string' && typeof text === 'string') {
          texts.push({ from: m.from, text })
        }
      }
      for (const s of arr(value.statuses)) {
        if (s.status !== 'failed' || typeof s.recipient_id !== 'string') continue
        const [e] = arr(s.errors)
        errors.push({
          recipient: s.recipient_id,
          code: typeof e?.code === 'number' ? e.code : undefined,
          title: typeof e?.title === 'string' ? e.title : undefined,
        })
      }
    }
  }
  return { texts, errors }
}

const STOP_WORDS = new Set(['sair', 'parar', 'stop'])

/** "SAIR", "sair!", " Parar. " — a mensagem inteira, não uma palavra dentro dela. */
export function isStopWord(text: string): boolean {
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  return STOP_WORDS.has(t) && text.trim().split(/\s+/).length === 1
}

/** Telefone é dado pessoal: log só com o fim. */
export const maskPhone = (digits: string) => `•••${digits.slice(-4)}`
