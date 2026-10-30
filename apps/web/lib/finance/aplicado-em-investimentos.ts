/**
 * Quanto entrou nas contas de investimento (`brokerage`) por transferência,
 * pela mesma regra do aportado em Metas de Investimento
 * (`getInvestmentContributions`). No fluxo de caixa a transferência fica fora
 * das despesas, então o saldo do período não desconta esse dinheiro.
 */
export function aplicadoEmInvestimentos(
  lancamentos: { type: string; amountCents: number; accountId: string }[],
  contasDeInvestimento: Set<string>,
): number {
  let total = 0
  for (const t of lancamentos) {
    if (t.type === 'transfer' && t.amountCents > 0 && contasDeInvestimento.has(t.accountId)) total += t.amountCents
  }
  return total
}
