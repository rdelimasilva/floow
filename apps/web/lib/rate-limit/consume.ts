import { sql } from 'drizzle-orm'

/**
 * Trava de uso com contador no Postgres.
 *
 * Contador em memória não serve aqui: cada instância serverless teria o seu, e
 * o teto real viraria "limite x número de instâncias". O incremento acontece no
 * banco, num UPSERT atômico — sem leitura-depois-escrita, então duas
 * requisições simultâneas não furam o limite.
 *
 * Janela fixa, não deslizante: é mais barato e o objetivo aqui é conter abuso
 * de custo, não medir vazão com precisão. O caso ruim conhecido é o dobro do
 * limite na virada de duas janelas — aceitável para o que isto protege.
 */

interface DbLike {
  execute(query: unknown): Promise<unknown>
}

export interface RateLimitOptions {
  /** Família do limite, ex.: 'cfo.chat'. */
  bucket: string
  /** Quem está sendo limitado — org_id ou user_id. */
  subject: string
  /** Chamadas permitidas por janela. */
  limit: number
  windowSeconds: number
  /** Injetável para teste. */
  now?: Date
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/** Alinha o instante ao início da sua janela, para todos caírem no mesmo balde. */
export function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000
  return new Date(Math.floor(now.getTime() / ms) * ms)
}

export async function consumeRateLimit(
  db: DbLike,
  { bucket, subject, limit, windowSeconds, now = new Date() }: RateLimitOptions,
): Promise<RateLimitResult> {
  const inicio = windowStart(now, windowSeconds)
  const fim = new Date(inicio.getTime() + windowSeconds * 1000)
  const retryAfterSeconds = Math.max(1, Math.ceil((fim.getTime() - now.getTime()) / 1000))

  try {
    const linhas = (await db.execute(sql`
      insert into public.rate_limits (bucket, subject, window_start, count)
      values (${bucket}, ${subject}, ${inicio.toISOString()}::timestamptz, 1)
      on conflict (bucket, subject, window_start)
        do update set count = public.rate_limits.count + 1
      returning count
    `)) as Array<{ count: number }>

    const contagem = Number(linhas[0]?.count ?? 0)

    return {
      allowed: contagem <= limit,
      remaining: Math.max(0, limit - contagem),
      retryAfterSeconds,
    }
  } catch (err) {
    // Fecha em vez de abrir: o que esta trava protege é a fatura da API. E o
    // chat não funcionaria mesmo com o banco fora — ele lê e grava mensagens.
    console.error('[rate-limit] falha ao contabilizar, bloqueando:', err)
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }
}
