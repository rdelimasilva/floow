/** Hoje em São Paulo, YYYY-MM-DD: o servidor roda em UTC. */
export function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Primeiro dia do mês, 12 meses atrás (janela da análise). */
export function inicioDaJanela(hoje: string): string {
  const [y, m] = hoje.split('-').map(Number)
  const d = new Date(y, m - 1 - 11, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
