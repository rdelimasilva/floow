/** O WhatsApp aceita até 4096 caracteres por mensagem; sobra folga. */
export const MAX_PARTE = 4000

export type OrgDoWhatsApp = { tipo: 'ok'; orgId: string } | { tipo: 'escolher' } | { tipo: 'sem-org' }

/**
 * A escolhida vale enquanto o usuário for membro dela; fora disso, a regra de
 * org vazia: uma org só → ela; várias → pedir para escolher.
 */
export function escolherOrgDoWhatsApp(orgIds: string[], preferida: string | null): OrgDoWhatsApp {
  if (preferida && orgIds.includes(preferida)) return { tipo: 'ok', orgId: preferida }
  if (orgIds.length === 1) return { tipo: 'ok', orgId: orgIds[0] }
  if (orgIds.length === 0) return { tipo: 'sem-org' }
  return { tipo: 'escolher' }
}

/** Quebra em parágrafos; parágrafo maior que o limite é cortado em pedaços. */
export function dividirMensagem(texto: string, max = MAX_PARTE): string[] {
  const partes: string[] = []
  let atual = ''
  for (const paragrafo of texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    const pedacos: string[] = []
    for (let i = 0; i < paragrafo.length; i += max) pedacos.push(paragrafo.slice(i, i + max))
    for (const pedaco of pedacos) {
      if (!atual) atual = pedaco
      else if (atual.length + 2 + pedaco.length <= max) atual += `\n\n${pedaco}`
      else {
        partes.push(atual)
        atual = pedaco
      }
    }
  }
  if (atual) partes.push(atual)
  return partes
}
