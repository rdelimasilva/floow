import type { ChatTool } from '@floow/core-finance'
import type { CanalDaMemoria } from '../memorias'

/** O que toda ferramenta recebe. Nunca a sessão: o WhatsApp (fase 3) não tem. */
export interface ContextoFerramenta {
  orgId: string
  userId: string
  canal: CanalDaMemoria
}

export interface Ferramenta {
  definicao: ChatTool
  /**
   * 'leitura' roda no servidor e o resultado volta ao Claude.
   * 'memoria' também roda no servidor: grava ou apaga só a memória do próprio
   * usuário, por isso sem confirmação.
   * 'sugestao' não roda: vira botão na web (fluxo antigo, até a fase 2).
   */
  tipo: 'leitura' | 'memoria' | 'sugestao'
  executar?: (ctx: ContextoFerramenta, params: unknown) => Promise<string>
}

/** Parâmetro que o Claude mandou errado — volta para ele corrigir. */
export class ParametroInvalido extends Error {}
