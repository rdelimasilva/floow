/**
 * Abre a autorização do banco numa aba nova, sem tirar o usuário do floow.
 *
 * O navegador só deixa abrir aba dentro do clique: depois de um `await` o
 * gesto já se perdeu e o pop-up é bloqueado. Por isso a aba abre EM BRANCO
 * antes de pedir o link ao servidor, e só depois recebe o endereço do banco.
 * O link não pode ser guardado para depois — o `request_uri` dentro dele é de
 * uso único e vale dezenas de segundos (ver `recreateBankAuthorization`).
 *
 * Pop-up bloqueado: cai no comportamento antigo, redirecionar esta aba.
 */

interface AbaAberta {
  opener: unknown
  location: { href: string }
  close(): void
}

export interface DependenciasDeAbertura {
  open: (url: string, target: string) => AbaAberta | null
  location: { href: string }
}

export type ResultadoDaAbertura = 'nova-aba' | 'mesma-aba' | 'sem-url'

export async function abrirAutorizacao(
  obterUrl: () => Promise<string | null | undefined>,
  deps: DependenciasDeAbertura = {
    open: (url, target) => window.open(url, target),
    location: window.location,
  },
): Promise<ResultadoDaAbertura> {
  // Antes de qualquer await: ainda dentro do gesto do clique.
  const aba = deps.open('', '_blank')

  let url: string | null | undefined
  try {
    url = await obterUrl()
  } catch (error) {
    aba?.close()
    throw error
  }

  if (!url) {
    aba?.close()
    return 'sem-url'
  }

  if (!aba) {
    deps.location.href = url
    return 'mesma-aba'
  }

  // A página do banco não precisa (nem deve) alcançar a aba do floow.
  aba.opener = null
  aba.location.href = url
  return 'nova-aba'
}
