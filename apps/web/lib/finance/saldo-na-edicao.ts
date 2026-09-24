/**
 * Se a linha editada deve estar no saldo da conta depois da edição.
 *
 * Saiu de `updateTransaction`, que aplicava no saldo toda linha sem template.
 * Duas linhas escapavam da regra e entravam no saldo sem ter acontecido:
 *  - a previsão de parcela (`is_installment_forecast`), que nunca entra no
 *    saldo — quem soma é a parcela real que a ocupa;
 *  - a parcela futura do banco (`external_id` com `balance_applied = false`),
 *    que só entra quando a data chega, pelo `applyDueBankTransactions`.
 *
 * `dataEditada` e `hoje` em AAAA-MM-DD; `hoje` é o dia em São Paulo.
 */
export function deveAplicarSaldoNaEdicao(
  linha: {
    recurringTemplateId: string | null
    isInstallmentForecast?: boolean | null
    externalId?: string | null
    balanceApplied: boolean
  },
  dataEditada: string,
  hoje: string,
): boolean {
  if (linha.isInstallmentForecast) return false
  const dataChegou = dataEditada <= hoje
  if (linha.recurringTemplateId) return dataChegou
  if (linha.externalId && !linha.balanceApplied) return dataChegou
  return true
}
