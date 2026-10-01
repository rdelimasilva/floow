import { JANELA_BUSCA_DIAS } from '@/lib/finance/forecast-match-db'

export const TETO_DIFERENCA_RELATIVA = 0.2
export const MAX_CANDIDATAS = 3

export interface LancamentoDoBanco {
  id: string
  accountId: string
  date: string
  amountCents: number
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
}

const DIA_EM_MS = 24 * 60 * 60 * 1000

const dia = (iso: string) => Date.parse(iso.slice(0, 10))

/**
 * Quais previsões abertas parecem ser este lançamento do banco. Pura: a
 * consulta mora em `fila-db.ts`. Spec 2026-10-01 §4.
 *
 * Mesma conta, mesmo sinal, ±10 dias, até 20% de diferença. Ordem: valor,
 * depois dias. A proposta que o sync gravou (se houver) é a candidata 1: é o
 * palpite que o motor já fez com regras de descrição que esta pontuação não tem.
 */
export function escolherCandidatas(
  lancamento: LancamentoDoBanco,
  previsoes: PrevisaoAberta[],
  opcoes: { proposta?: { id: string; previsaoId: string } | null; recusadas?: Set<string> } = {},
): Candidata[] {
  const teto = Math.abs(lancamento.amountCents) * TETO_DIFERENCA_RELATIVA
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
    }))
    .filter((c) => c.diasDeDiferenca <= JANELA_BUSCA_DIAS && c.diferencaCents <= teto)
    .sort((a, b) => a.diferencaCents - b.diferencaCents || a.diasDeDiferenca - b.diasDeDiferenca)

  const daProposta = elegiveis.findIndex((c) => c.propostaId !== null)
  if (daProposta > 0) elegiveis.unshift(...elegiveis.splice(daProposta, 1))
  return elegiveis.slice(0, MAX_CANDIDATAS)
}
