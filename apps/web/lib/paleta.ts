/** Evento que abre a paleta de comandos — para quem não usa Ctrl+K. */
export const EVENTO_ABRIR_PALETA = 'floow:abrir-paleta'

export function abrirPaleta() {
  window.dispatchEvent(new Event(EVENTO_ABRIR_PALETA))
}
