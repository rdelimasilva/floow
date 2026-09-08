/**
 * Como chamar a outra conta de uma transferência, do ponto de vista do
 * usuário.
 *
 * A segunda perna sempre inverte o sinal da origem (ver
 * `buildTransferLegRow` em `transfer-leg.ts`), então a direção não é uma
 * escolha: ela é consequência do sinal do lançamento que o banco mandou.
 *
 * - Banco debitou a conta (saída, valor negativo) → a perna credita a outra
 *   conta, que é o **destino** do dinheiro.
 * - Banco creditou a conta (entrada, valor positivo) → a perna debita a
 *   outra conta, que é a **origem** do dinheiro. É o caso do resgate de CDB:
 *   a corrente recebe, o CDB é debitado.
 *
 * O texto era fixo em "Conta de destino", o que invertia o sentido para toda
 * entrada.
 */
export function transferAccountLabel(amountCents: number): string {
  return amountCents > 0 ? 'Conta de origem' : 'Conta de destino'
}
