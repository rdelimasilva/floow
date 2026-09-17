import { timingSafeEqual } from 'node:crypto'

/**
 * Autoriza chamadas máquina-a-máquina (cron da Vercel, disparo por evento).
 *
 * A comparação anterior era `authHeader === \`Bearer ${process.env.X!}\``. Com a
 * env var ausente em produção isso vira a string literal "Bearer undefined" —
 * que qualquer um manda, e as duas rotas estão na allowlist pública do
 * middleware. Um segredo não configurado passa a negar tudo, nunca a liberar.
 */
export function isAuthorizedService(
  authHeader: string | null,
  secrets: Array<string | undefined>,
): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false

  const presented = authHeader.slice('Bearer '.length)
  if (!presented) return false

  // Só segredos de fato configurados entram na comparação.
  const configured = secrets.filter((s): s is string => typeof s === 'string' && s.length > 0)
  if (configured.length === 0) return false

  const presentedBytes = Buffer.from(presented, 'utf8')

  return configured.some((secret) => {
    const secretBytes = Buffer.from(secret, 'utf8')
    // timingSafeEqual exige buffers do mesmo tamanho. O tamanho do segredo não
    // é o que se protege aqui — o conteúdo é.
    if (secretBytes.length !== presentedBytes.length) return false
    return timingSafeEqual(secretBytes, presentedBytes)
  })
}
