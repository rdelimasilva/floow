/**
 * Texto de erro para mostrar ao usuário.
 *
 * Em produção o Next oculta a mensagem de todo erro lançado no servidor e põe
 * no lugar um texto genérico em inglês. Esse texto — e falhas de rede como
 * "Failed to fetch" — não dizem nada a quem usa o app, então cai no fallback,
 * que cada tela escreve em pt-BR dizendo o que falhou.
 */
const MENSAGENS_TECNICAS = ['omitted in production', 'Failed to fetch', 'NetworkError', 'Load failed']

export function mensagemDeErro(erro: unknown, fallback: string): string {
  if (!(erro instanceof Error)) return fallback
  const mensagem = erro.message.trim()
  if (!mensagem) return fallback
  if (MENSAGENS_TECNICAS.some((t) => mensagem.includes(t))) return fallback
  return mensagem
}
