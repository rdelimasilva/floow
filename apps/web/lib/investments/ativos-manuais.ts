/**
 * Ativo do Open Finance é somente leitura na tela: o banco é a fonte e o
 * evento manual nele criaria lançamento em `transactions` (quebra D3). Os
 * seletores de ativo dos formulários de evento só oferecem ativos manuais.
 */
export function ativosManuais<T extends { source: 'manual' | 'openfinance' }>(lista: T[]): T[] {
  return lista.filter((a) => a.source !== 'openfinance')
}
