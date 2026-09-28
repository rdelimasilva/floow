import type { ChatTool } from '@floow/core-finance'

/** O que toda ferramenta recebe. Nunca a sessão: o WhatsApp (fase 3) não tem. */
export interface ContextoFerramenta {
  orgId: string
  userId: string
}

export interface Ferramenta {
  definicao: ChatTool
  /**
   * 'leitura' roda no servidor e o resultado volta ao Claude.
   * 'sugestao' não roda: vira botão na web (fluxo antigo, até a fase 2).
   */
  tipo: 'leitura' | 'sugestao'
  executar?: (ctx: ContextoFerramenta, params: unknown) => Promise<string>
}

/** Parâmetro que o Claude mandou errado — volta para ele corrigir. */
export class ParametroInvalido extends Error {}
