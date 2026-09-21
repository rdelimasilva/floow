interface LancamentoComConta {
  id: string
  accountId: string
}

interface ContaComNome {
  id: string
  name: string
}

/**
 * Transferência para a própria conta do lançamento: avisar antes de enviar.
 *
 * `applyTransferSingle` (counterparty-actions.ts) recusa destino igual à conta
 * de origem — e está certo, seria dinheiro saindo e entrando no mesmo lugar.
 * Só que a fila de revisão oferece TODAS as contas no seletor, então a escolha
 * inválida era possível e o lote inteiro morria no servidor depois de enviado
 * ("A conta da transferência não pode ser a mesma conta do lançamento", em
 * produção em 16/09/2026).
 *
 * O aviso conta quantos lançamentos batem porque o grupo de uma contraparte
 * pode ter lançamentos de contas diferentes: com 2 de 5 no Itaú, escolher Itaú
 * quebra só aqueles dois, e quem lê precisa saber disso.
 *
 * Devolve `null` quando não há conflito — o chamador usa isso tanto para
 * mostrar o texto quanto para desabilitar o "Confirmar".
 */
export function avisoDeContaDeDestino(
  lancamentos: readonly LancamentoComConta[],
  contaDeDestino: string | null | undefined,
  contas: readonly ContaComNome[],
): string | null {
  if (!contaDeDestino || lancamentos.length === 0) return null

  const conflitantes = lancamentos.filter((l) => l.accountId === contaDeDestino)
  if (conflitantes.length === 0) return null

  const nome = contas.find((c) => c.id === contaDeDestino)?.name
  const onde = nome ? `no ${nome}` : 'nesta conta'
  const feche = 'Escolha outra conta de destino.'

  if (conflitantes.length === lancamentos.length) {
    return lancamentos.length === 1
      ? `O lançamento desta contraparte está ${onde}. ${feche}`
      : `Os ${lancamentos.length} lançamentos desta contraparte estão ${onde}. ${feche}`
  }

  return `${conflitantes.length} dos ${lancamentos.length} lançamentos desta contraparte estão ${onde}. ${feche}`
}
