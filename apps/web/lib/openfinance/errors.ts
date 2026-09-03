import { PolpApiError } from '@floow/core-finance'

/**
 * Traduz uma falha da Polp para algo que o usuário possa agir.
 *
 * O cliente HTTP levanta `PolpApiError` com o status cru, o que é certo para
 * quem lê log e inútil para quem está na tela: "respondeu 402" não diz se o
 * problema é o CPF, a credencial, o banco fora do ar ou a nossa assinatura.
 * Cada status abaixo aponta para um lugar diferente — e três deles não são
 * problema nosso, o que muda completamente o que a pessoa faz em seguida.
 */
export function describePolpError(error: unknown): string {
  if (!(error instanceof PolpApiError)) {
    return error instanceof Error ? error.message : 'Não foi possível falar com o banco agora.'
  }

  const detalhe = extrairMensagem(error.body)
  const sufixo = detalhe ? ` (${detalhe})` : ''

  switch (error.status) {
    case 401:
    case 403:
      // Credencial recusada. Nada que o usuário final possa resolver.
      return `A integração com Open Finance está com credenciais inválidas. Fale com o suporte.${sufixo}`

    case 402:
      // Operação cobrada e conta sem plano ativo ou com pendência.
      return `A conta da integração não tem plano ativo para criar novas conexões.${sufixo}`

    case 404:
      return `Este banco ou consentimento não foi encontrado na integração.${sufixo}`

    case 409:
      return `Já existe uma conexão para este CPF nesta instituição.${sufixo}`

    case 422:
      // Payload recusado: CPF, instituição ou produtos.
      return `O banco recusou os dados informados. Confira o CPF e tente outra vez.${sufixo}`

    case 429:
      // Rate limit é por credencial, ou seja, compartilhado por todos os
      // clientes do floow — esperar é a única saída correta.
      return error.retryAfterSeconds
        ? `Muitas requisições à integração agora. Tente de novo em ${error.retryAfterSeconds} segundos.`
        : `Muitas requisições à integração agora. Tente de novo em alguns instantes.`

    default:
      if (error.status >= 500) {
        return `A integração ou o banco está indisponível neste momento. Tente mais tarde.${sufixo}`
      }
      return `A integração recusou a operação (HTTP ${error.status}).${sufixo}`
  }
}

/** A Polp costuma responder `{ "message": "..." }`; aproveita quando vier. */
function extrairMensagem(body: string): string | null {
  if (!body) return null

  try {
    const json = JSON.parse(body) as { message?: unknown; error?: unknown }
    const texto = typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : null
    return texto ? texto.slice(0, 160) : null
  } catch {
    // Corpo que não é JSON: só serve se for curto o bastante para caber num aviso.
    const limpo = body.trim()
    return limpo.length > 0 && limpo.length <= 160 ? limpo : null
  }
}
