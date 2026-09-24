/**
 * Transferência de uma conta para ela mesma não existe. Estas mensagens saem
 * iguais na tela e no servidor (em produção o Next esconde a do servidor), e
 * o arquivo não importa banco para poder ir ao bundle do cliente.
 */

export function mensagemNaContaNova(n: number): string {
  return n === 1
    ? '1 lançamento desta regra está na própria conta escolhida. Escolha outra conta para a transferência.'
    : `${n} lançamentos desta regra estão na própria conta escolhida. Escolha outra conta para a transferência.`
}

export const MSG_CONTA_DA_REGRA = 'Esta regra vale para os lançamentos da própria conta escolhida. Escolha outra conta para a transferência.'

/** Selecionados na conta nova; a prévia e `corrigirRegra` contam do mesmo jeito. */
export function contarNaContaNova(linhas: { accountId: string }[], contaNova: string | null): number {
  if (!contaNova) return 0
  return linhas.filter((l) => l.accountId === contaNova).length
}
