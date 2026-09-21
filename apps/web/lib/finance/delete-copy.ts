interface AlvoDeRemocao {
  description?: string
  balanceApplied?: boolean | null
  transferGroupId?: string | null
  recurringTemplateId?: string | null
}

/**
 * O que a confirmação de remoção diz, conforme o que está sendo removido.
 *
 * O texto era um só e prometia "o saldo da conta será revertido". Numa
 * previsão de template isso é falso: ela nunca entrou em `accounts.balance_-
 * cents` — é justamente o que a migration 00046 consertou — e prometer
 * reversão convida a não apagar por medo de mexer no saldo.
 *
 * Também diz o que NÃO vai acontecer: apagar uma parcela não cancela o
 * template. Quem quer isso tem o ✕ ao lado, que é outro gesto (e que deixa as
 * parcelas vencidas para trás, ver `cancelRecurring`).
 */
export function textoDeRemocao(alvo: AlvoDeRemocao | null | undefined): {
  title: string
  description: string
} {
  if (!alvo) {
    return { title: 'Excluir lançamento', description: 'Tem certeza que deseja remover este lançamento?' }
  }

  const nome = alvo.description ? `"${alvo.description}"` : 'este lançamento'

  if (alvo.transferGroupId) {
    return {
      title: 'Excluir transferência',
      description: `Tem certeza que deseja remover a transferência ${nome}? As duas pernas serão removidas e os saldos revertidos.`,
    }
  }

  if (alvo.balanceApplied === false) {
    const sobreOTemplate = alvo.recurringTemplateId
      ? ' A recorrência continua ativa, e as outras parcelas ficam.'
      : ''
    return {
      title: 'Excluir previsão',
      description: `Tem certeza que deseja remover a previsão ${nome}? Ela não entrou em saldo nenhum, então nenhum saldo muda.${sobreOTemplate}`,
    }
  }

  return {
    title: 'Excluir lançamento',
    description: `Tem certeza que deseja remover ${nome}? O saldo da conta será revertido.`,
  }
}

/** Rótulo do botão da lixeira, que muda com o que a linha é. */
export function rotuloDeRemocao(alvo: AlvoDeRemocao): string {
  return alvo.balanceApplied === false ? 'Excluir previsão' : 'Excluir lançamento'
}
