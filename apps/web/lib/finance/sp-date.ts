/**
 * Dia-calendário do usuário em São Paulo, expresso como Date em UTC.
 *
 * `computeBudgetPacing` pede exatamente isso, e passar `new Date()` cru quebra
 * em produção: Vercel e Netlify rodam em UTC, então entre 21h e meia-noite no
 * Brasil o servidor já está no dia seguinte. A contagem de dias decorridos
 * ficaria um a mais toda noite, e na última noite do mês o mês corrente seria
 * tratado como encerrado três horas antes da hora.
 *
 * Meio-dia UTC é deliberado: afasta o valor de qualquer borda de fuso.
 */
export function saoPauloToday(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 12, 0, 0))
}

/** Primeiro dia do mês de `date`, em UTC. */
export function monthStartUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

/** Último dia do mês de `date`, em UTC. */
export function monthEndUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

/** YYYY-MM do mês de `date`, em UTC. */
export function monthKeyUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
