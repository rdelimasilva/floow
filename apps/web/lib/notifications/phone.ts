/**
 * Telefone para WhatsApp, em E.164.
 *
 * Sem biblioteca: o caso real é celular brasileiro, e a regra dele cabe numa
 * regex. Número com "+" é aceito de qualquer país (8 a 15 dígitos, o limite
 * do E.164) sem validação extra: quem digita DDI sabe o que está fazendo, e
 * o código de verificação prova o resto.
 */

/** DDD (11–99, sem zero) + 9 + 8 dígitos. */
const BR_MOBILE = /^[1-9][1-9]9\d{8}$/

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  let full: string
  if (trimmed.startsWith('+')) full = digits
  else if (digits.length === 10 || digits.length === 11) full = `55${digits}`
  else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) full = digits
  else return null

  if (full.startsWith('55')) return BR_MOBILE.test(full.slice(2)) ? `+${full}` : null
  return full.length >= 8 && full.length <= 15 ? `+${full}` : null
}

/**
 * Formas E.164 possíveis para o `from` (wa_id) de uma mensagem recebida. A Meta
 * manda alguns celulares brasileiros sem o nono dígito; o cadastro tem o 9.
 */
export function phoneCandidatesFromWaId(waId: string): string[] {
  const digits = waId.replace(/\D/g, '')
  const asIs = `+${digits}`
  if (digits.startsWith('55') && digits.length === 12) {
    return [asIs, `+55${digits.slice(2, 4)}9${digits.slice(4)}`]
  }
  return [asIs]
}

export function formatPhoneDisplay(e164: string): string {
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164)
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : e164
}
