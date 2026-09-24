/**
 * O que a lista de conexões diz depois de reler uma conexão.
 *
 * Pelo botão, o usuário pediu — sempre responde. Na volta automática para a
 * aba, só fala se algo mudou: "Contas atualizadas." a cada troca de aba, sem
 * nada novo, vira ruído que ensina a ignorar o aviso.
 */
export function avisoDaAtualizacao(
  antes: { status: string; recursos: number },
  depois: { status: string; resources: unknown[]; pendingResourceCount: number },
  automatico: boolean,
): string | null {
  const mudou = depois.status !== antes.status || depois.resources.length > antes.recursos
  if (automatico && !mudou) return null
  return depois.pendingResourceCount > 0
    ? 'Contas atualizadas. O banco ainda está preparando parte delas.'
    : 'Contas atualizadas.'
}
