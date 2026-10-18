/**
 * Formatação dos números que vão no texto dos insights do consultor.
 *
 * Quando o LLM não reescreve o insight (sem chave, ou a síntese falhou), o
 * texto do template é o que o usuário lê. `toFixed` dava "R$1850.98" e o
 * percentual saía com quinze casas.
 */

const formatadores = new Map<number, Intl.NumberFormat>()

function formatadorBRL(casas: number): Intl.NumberFormat {
  let f = formatadores.get(casas)
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    })
    formatadores.set(casas, f)
  }
  return f
}

/** Centavos em reais no formato brasileiro: brl(185098) => "R$ 1.851". */
export function brl(cents: number, casas = 0): string {
  return formatadorBRL(casas).format(cents / 100)
}

/** Percentual arredondado com vírgula: pct(52.2976) => "52%". */
export function pct(valor: number, casas = 0): string {
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}
