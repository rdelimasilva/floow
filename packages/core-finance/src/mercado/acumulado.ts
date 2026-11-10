/**
 * Retorno composto de uma sequência de taxas em percentual por período
 * (CDI em % ao dia, IPCA em % ao mês). Devolve fração: 0.1365 = 13,65%.
 */
export function acumular(taxasPct: number[]): number {
  return taxasPct.reduce((fator, t) => fator * (1 + t / 100), 1) - 1
}
