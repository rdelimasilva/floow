/**
 * Orquestra a troca de senha com o "Secure password change" do Supabase ligado.
 *
 * Com o toggle ligado, `updateUser({ password })` só passa direto se a sessão
 * tiver menos de 24h. Acima disso o Supabase exige um nonce, enviado por e-mail
 * via `reauthenticate()`. Como o refresh token mantém a sessão viva por tempo
 * indeterminado, passar de 24h é o caso comum — sem este tratamento, trocar a
 * senha em Configurações falharia para quase todo mundo.
 *
 * O desenho tenta primeiro e só pede o código se o Supabase reclamar: quem tem
 * sessão recente nunca vê o passo extra.
 */

interface AuthErrorLike {
  code?: string
  message?: string
}

interface SupabaseAuthLike {
  auth: {
    updateUser(attrs: { password: string; nonce?: string }): Promise<{ error: AuthErrorLike | null }>
    reauthenticate(): Promise<{ error: AuthErrorLike | null }>
  }
}

export type ChangePasswordResult =
  | { status: 'success' }
  /** Código enviado por e-mail; chamar de novo com `nonce`. */
  | { status: 'nonce_required' }
  | { status: 'error'; message: string }

const MENSAGEM_PADRAO = 'Não foi possível alterar a senha.'

/**
 * O `code` é o sinal confiável, mas nem toda versão do gotrue o preenche — daí
 * o fallback pela mensagem. Sem ele, um projeto com o toggle ligado mostraria
 * o erro cru ao usuário em vez de pedir o código.
 */
function exigeReautenticacao(error: AuthErrorLike): boolean {
  if (error.code === 'reauthentication_needed') return true
  return /reauthentication.*needed/i.test(error.message ?? '')
}

export async function changePassword(
  supabase: SupabaseAuthLike,
  { password, nonce }: { password: string; nonce?: string },
): Promise<ChangePasswordResult> {
  const { error } = await supabase.auth.updateUser(
    nonce ? { password, nonce } : { password },
  )

  if (!error) return { status: 'success' }

  // Com nonce já informado, outro pedido de reautenticação significa código
  // errado ou vencido. Reenviar aqui viraria laço e mais um e-mail por tentativa.
  if (!nonce && exigeReautenticacao(error)) {
    const { error: erroEnvio } = await supabase.auth.reauthenticate()
    if (erroEnvio) {
      return { status: 'error', message: erroEnvio.message ?? MENSAGEM_PADRAO }
    }
    return { status: 'nonce_required' }
  }

  return { status: 'error', message: error.message ?? MENSAGEM_PADRAO }
}
