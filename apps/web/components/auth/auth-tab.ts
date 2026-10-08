export type AuthTab = 'login' | 'signup'

/** Lê `?tab=` da URL — a landing usa `/auth?tab=signup` no CTA de cadastro. */
export function parseAuthTab(value: string | string[] | undefined): AuthTab {
  const tab = Array.isArray(value) ? value[0] : value
  return tab === 'signup' ? 'signup' : 'login'
}
