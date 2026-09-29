import { z } from 'zod'
import { apagarMemoria, gravarMemoria } from '@/lib/consultor/memorias'
import { ParametroInvalido, type Ferramenta } from './tipos'
import { validar } from './utils'

/**
 * CPF, cartão, conta: 11 a 19 dígitos seguidos depois de tirar separadores.
 * Valores em reais ficam de fora porque a vírgula quebra a sequência.
 */
export function pareceSensivel(texto: string): boolean {
  return /\d{11,19}/.test(texto.replace(/[\s.\-/]/g, '')) || /senha/i.test(texto)
}

const ParamsLembrar = z.object({ fato: z.string().trim().min(1).max(300) })
const ParamsEsquecer = z.object({ id: z.string().uuid() })

export const lembrar: Ferramenta = {
  tipo: 'memoria',
  definicao: {
    name: 'lembrar',
    description:
      'Guarda um fato duradouro sobre o usuário: objetivo, preferência, restrição ou contexto de vida ' +
      '(ex.: "quer quitar o cartão até dezembro", "prefere respostas curtas"). ' +
      'Uma frase curta por fato. Nunca dado sensível nem números que estão nas contas.',
    inputSchema: {
      type: 'object',
      properties: { fato: { type: 'string', description: 'O fato, em uma frase (até 300 caracteres)' } },
      required: ['fato'],
    },
  },
  async executar(ctx, params) {
    const { fato } = validar(ParamsLembrar, params)
    if (pareceSensivel(fato)) {
      throw new ParametroInvalido('parece dado sensível (documento, cartão, conta ou senha); não grave isso')
    }
    await gravarMemoria({ orgId: ctx.orgId, userId: ctx.userId, canal: ctx.canal, conteudo: fato })
    return 'Anotado.'
  },
}

export const esquecer: Ferramenta = {
  tipo: 'memoria',
  definicao: {
    name: 'esquecer',
    description: 'Apaga uma memória pelo id mostrado em "O que você sabe sobre o usuário". Use quando o usuário pedir ou quando o fato mudou.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id da memória' } },
      required: ['id'],
    },
  },
  async executar(ctx, params) {
    const { id } = validar(ParamsEsquecer, params)
    if (!(await apagarMemoria(ctx.orgId, ctx.userId, id))) {
      throw new ParametroInvalido(`não existe memória com id ${id}`)
    }
    return 'Esquecido.'
  },
}
