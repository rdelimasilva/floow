/**
 * Formata um dia de calendário vindo de coluna `date` do Postgres.
 *
 * O Drizzle entrega essas colunas como `Date` à meia-noite UTC. Formatar no
 * fuso local — o padrão de `toLocaleDateString` — em Brasília (UTC-3) cai às
 * 21h do dia anterior: a lista mostrava 12/09 para um lançamento de 13/09, e
 * o snapshot do dia 1º aparecia no mês anterior. No servidor da Vercel (UTC)
 * o mesmo código acertava, por isso o erro só aparecia nos componentes client.
 *
 * Formatar em UTC devolve o dia gravado. Também acerta datas montadas no fuso
 * local (`new Date(y, m, d)` = 03h UTC do mesmo dia no Brasil).
 *
 * Não use para timestamp (`created_at`): aí o fuso local é o certo.
 */
export function formatarDia(
  dia: Date | string,
  opcoes: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
): string {
  const d = typeof dia === 'string' ? new Date(dia) : dia
  return d.toLocaleDateString('pt-BR', { ...opcoes, timeZone: 'UTC' })
}
