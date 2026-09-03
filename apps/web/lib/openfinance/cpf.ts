import { createHash } from 'node:crypto'

/**
 * CPF na conexão Open Finance.
 *
 * O CPF é necessário apenas para CRIAR o consentimento: `recreate` e `revoke`
 * usam o `consent_id`. Por isso ele nunca é armazenado em claro. O que fica é:
 *
 * - `cpf_hash` — existe por uma razão operacional concreta, não por zelo
 *   abstrato: o teto de reconexão do Open Finance é regulatório POR CPF, e
 *   reconectar o mesmo par CPF + instituição queima cota mensal. O hash detecta
 *   isso antes da chamada, em vez de descobrir quando a Polp recusar.
 * - `cpf_masked` — só para a interface dizer de quem é a conexão.
 *
 * Ver D4 em docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md
 */

/** Só os dígitos, sem pontuação. Não valida. */
export function stripCpf(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * O CPF é válido segundo os dois dígitos verificadores?
 *
 * Vale a checagem local porque criar consentimento com CPF inválido não é só
 * um erro devolvido: a tentativa custa uma chamada dentro de um teto
 * regulatório mensal que não se recupera.
 */
export function isValidCpf(raw: string): boolean {
  const digits = stripCpf(raw)
  if (digits.length !== 11) return false

  // 11111111111 e afins passam na conta dos dígitos verificadores, mas não são
  // CPFs — é o caso clássico que a fórmula sozinha deixa passar.
  if (/^(\d)\1{10}$/.test(digits)) return false

  for (const [length, position] of [
    [9, 10],
    [10, 11],
  ]) {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (position - i)

    const remainder = (sum * 10) % 11
    const check = remainder === 10 ? 0 : remainder
    if (check !== Number(digits[length])) return false
  }

  return true
}

/**
 * "***.456.789-**" — o suficiente para o usuário reconhecer de quem é a
 * conexão, insuficiente para reconstruir o número.
 */
export function maskCpf(raw: string): string {
  const digits = stripCpf(raw)
  if (digits.length !== 11) throw new Error('CPF precisa de 11 dígitos para ser mascarado')

  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
}

/**
 * SHA-256 do CPF com o salt da aplicação.
 *
 * O salt não é opcional: sem ele, o espaço de CPFs é pequeno o bastante para
 * ser varrido inteiro, e o hash deixaria de proteger o que se propõe a
 * proteger. Faltando a variável, a conexão falha — o que é melhor que gravar
 * um hash reversível achando que está tudo certo.
 */
export function hashCpf(raw: string, salt: string): string {
  const digits = stripCpf(raw)
  if (digits.length !== 11) throw new Error('CPF precisa de 11 dígitos para ser hasheado')
  if (!salt) throw new Error('POLP_CPF_SALT ausente: sem salt o hash de CPF não protege nada')

  return createHash('sha256').update(`${salt}:${digits}`).digest('hex')
}
