import { createPolpClient, type PolpClient } from '@floow/core-finance'

/**
 * Acesso às credenciais da Polp.
 *
 * São UMA credencial para o floow inteiro — a API não é multi-tenant. Nada
 * aqui recebe org: a segregação por tenant é feita depois, no código que grava,
 * e é por isso que ela precisa ser explícita em vez de confiada ao provedor.
 */

/** Lança quando a variável não existe, em vez de falhar fundo com header vazio. */
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} ausente. As credenciais da Polp vivem no .env — o secret é exibido uma única vez, na criação, no dashboard.`,
    )
  }
  return value
}

export function getPolpClient(): PolpClient {
  return createPolpClient({
    apiClient: required('POLP_API_CLIENT'),
    apiSecret: required('POLP_API_SECRET'),
  })
}

/** Salt do hash de CPF. Ver `cpf.ts` para por que ele não é opcional. */
export function getCpfSalt(): string {
  return required('POLP_CPF_SALT')
}

/**
 * As credenciais existem neste ambiente?
 *
 * A tela de conexão precisa saber disso antes de tentar listar instituições:
 * sem credencial, o certo é dizer que a integração não está configurada, não
 * estourar um 500 na cara de quem clicou em "conectar banco".
 */
export function isPolpConfigured(): boolean {
  return Boolean(process.env.POLP_API_CLIENT && process.env.POLP_API_SECRET && process.env.POLP_CPF_SALT)
}
