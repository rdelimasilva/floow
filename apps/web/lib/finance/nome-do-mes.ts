/**
 * "2026-10" -> "Outubro de 2026". Só a primeira letra sobe: a classe CSS
 * `capitalize` subia o "de" junto ("Outubro De 2026"). O curto ("out. de 26")
 * fica minúsculo, como nos eixos dos outros gráficos.
 */
export function nomeDoMes(mes: string, formato: 'short' | 'long' = 'long'): string {
  const [a, m] = mes.split('-').map(Number)
  const nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: formato, year: formato === 'short' ? '2-digit' : 'numeric' })
  return formato === 'long' ? nome.charAt(0).toUpperCase() + nome.slice(1) : nome
}
