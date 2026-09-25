/** Número com `casas` decimais no formato brasileiro — o `toFixed` em pt-BR. */
export function formatarNumero(valor: number, casas: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
