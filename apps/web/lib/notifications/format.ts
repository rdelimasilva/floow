/** Formatação compartilhada pelas mensagens de ritmo (e-mail e WhatsApp). */

/** R$ 1.234,56 com espaço comum (o Intl usa espaço não separável). */
export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

/**
 * Uma linha só. Variável de template do WhatsApp recusa quebra de linha, tab e
 * mais de 4 espaços seguidos — e nome de categoria é texto livre do usuário.
 */
export const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
