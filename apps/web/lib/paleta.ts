/** Evento que abre a paleta de comandos — para quem não usa Ctrl+K. */
export const EVENTO_ABRIR_PALETA = 'floow:abrir-paleta'

export function abrirPaleta() {
  window.dispatchEvent(new Event(EVENTO_ABRIR_PALETA))
}

/** Evento que abre o modal de nova transação em qualquer tela. */
export const EVENTO_NOVA_TRANSACAO = 'floow:nova-transacao'

export function abrirNovaTransacao() {
  window.dispatchEvent(new Event(EVENTO_NOVA_TRANSACAO))
}
