/**
 * Como o dinheiro se moveu, no texto que o usuário vê no extrato do banco.
 *
 * Entrada é o `polp_type` cru (AccountTransactionType do BCB, ver
 * `packages/core-finance/src/openfinance/polp-types.ts`). `OUTROS` e valor
 * desconhecido viram null: um rótulo "Outros" ao lado do lançamento não ajuda
 * ninguém a achá-lo no extrato.
 */
const MEIOS: Record<string, string> = {
  TED: 'TED',
  DOC: 'DOC',
  PIX: 'Pix',
  TRANSFERENCIA_MESMA_INSTITUICAO: 'Transferência no mesmo banco',
  BOLETO: 'Boleto',
  CONVENIO_ARRECADACAO: 'Convênio/arrecadação',
  PACOTE_TARIFA_SERVICOS: 'Pacote de tarifas',
  TARIFA_SERVICOS_AVULSOS: 'Tarifa avulsa',
  FOLHA_PAGAMENTO: 'Folha de pagamento',
  DEPOSITO: 'Depósito',
  SAQUE: 'Saque',
  CARTAO: 'Cartão',
  ENCARGOS_JUROS_CHEQUE_ESPECIAL: 'Juros de cheque especial',
  RENDIMENTO_APLIC_FINANCEIRA: 'Rendimento de aplicação',
  PORTABILIDADE_SALARIO: 'Portabilidade de salário',
  APLICACAO_FINANCEIRA: 'Aplicação',
  RESGATE_APLIC_FINANCEIRA: 'Resgate de aplicação',
  OPERACAO_CREDITO: 'Operação de crédito',
  TRANSFERENCIA_SALDO_RESERVADO: 'Saldo reservado',
}

export function meioDoLancamento(polpType: string | null | undefined): string | null {
  if (!polpType) return null
  return MEIOS[polpType] ?? null
}
