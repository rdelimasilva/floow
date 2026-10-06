import { temPalavraEmComum } from '@floow/core-finance/src/forecast-match'
import { JANELA_BUSCA_DIAS } from '@/lib/finance/forecast-match-db'

/** Sem nome em comum, só vale como palpite o valor praticamente igual. */
export const TOLERANCIA_VALOR_IGUAL = 0.02
export const MAX_CANDIDATAS = 3

export interface LancamentoDoBanco {
  id: string
  accountId: string
  date: string
  amountCents: number
  description: string
}

export interface PrevisaoAberta {
  id: string
  accountId: string
  contaNome: string
  date: string
  amountCents: number
  description: string
  categoriaNome: string | null
}

export interface Candidata extends PrevisaoAberta {
  diasDeDiferenca: number
  diferencaCents: number
  outraConta: boolean
  propostaId: string | null
  nomeParecido: boolean
}

const DIA_EM_MS = 24 * 60 * 60 * 1000

const dia = (iso: string) => Date.parse(iso.slice(0, 10))

/**
 * Quais previsões abertas parecem ser este lançamento do banco. Pura: a
 * consulta mora em `fila-db.ts`. Spec 2026-10-01 §4, card v2 §A.
 *
 * Mesma conta, mesmo sinal, ±10 dias e — o que segura palpite ruim — nome
 * com palavra em comum OU valor até 2% diferente. Ordem: nome parecido,
 * diferença de valor, dias. A proposta que o sync gravou é a candidata 1 se
 * passar nesse filtro: é o palpite que o motor já fez.
 */
export function escolherCandidatas(
  lancamento: LancamentoDoBanco,
  previsoes: PrevisaoAberta[],
  opcoes: { proposta?: { id: string; previsaoId: string } | null; recusadas?: Set<string> } = {},
): Candidata[] {
  const quaseIgual = Math.abs(lancamento.amountCents) * TOLERANCIA_VALOR_IGUAL
  const elegiveis = previsoes
    .filter((p) => p.accountId === lancamento.accountId)
    .filter((p) => Math.sign(p.amountCents) === Math.sign(lancamento.amountCents))
    .filter((p) => !opcoes.recusadas?.has(p.id))
    .map((p) => ({
      ...p,
      diasDeDiferenca: Math.round(Math.abs(dia(p.date) - dia(lancamento.date)) / DIA_EM_MS),
      diferencaCents: Math.abs(p.amountCents - lancamento.amountCents),
      outraConta: false,
      propostaId: opcoes.proposta?.previsaoId === p.id ? opcoes.proposta.id : null,
      nomeParecido: temPalavraEmComum(lancamento.description, p.description),
    }))
    .filter((c) => c.diasDeDiferenca <= JANELA_BUSCA_DIAS && (c.nomeParecido || c.diferencaCents <= quaseIgual))
    .sort((a, b) => Number(b.nomeParecido) - Number(a.nomeParecido)
      || a.diferencaCents - b.diferencaCents || a.diasDeDiferenca - b.diasDeDiferenca)

  const daProposta = elegiveis.findIndex((c) => c.propostaId !== null)
  if (daProposta > 0) elegiveis.unshift(...elegiveis.splice(daProposta, 1))
  return elegiveis.slice(0, MAX_CANDIDATAS)
}
