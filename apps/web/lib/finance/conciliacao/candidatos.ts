import { temPalavraEmComum } from '@floow/core-finance/src/forecast-match'
import { JANELA_BUSCA_DIAS } from '@/lib/finance/forecast-match-db'

/** Sem nome em comum, só vale como palpite o valor praticamente igual. */
export const TOLERANCIA_VALOR_IGUAL = 0.02
export const MAX_CANDIDATAS = 3

/**
 * Previsão de recorrência vencida há mais de `JANELA_BUSCA_DIAS` sem vínculo:
 * o banco pode ter cobrado bem antes ou depois (Jussara prevista 15/01, Pix
 * em 01/01). Busca ampliada — mesmo mês ou até 20 dias, e até 20% de
 * diferença quando o nome ou a contraparte batem. Só sugere na fila; o sync
 * nunca propõe nem casa com esta janela.
 */
export const JANELA_PREVISAO_ANTIGA_DIAS = 20
export const TOLERANCIA_VALOR_ANTIGA = 0.2

export interface LancamentoDoBanco {
  id: string
  accountId: string
  date: string
  amountCents: number
  description: string
  counterpartyId?: string | null
}

export interface PrevisaoAberta {
  id: string
  accountId: string
  contaNome: string
  date: string
  amountCents: number
  description: string
  categoriaNome: string | null
  /** Recorrência vencida sem vínculo: busca ampliada. Não vai para a tela. */
  antiga?: boolean
  /** Contrapartes dos lançamentos que já cumpriram a série. Não vai para a tela. */
  contrapartes?: string[]
}

export interface Candidata extends Omit<PrevisaoAberta, 'antiga' | 'contrapartes'> {
  diasDeDiferenca: number
  diferencaCents: number
  outraConta: boolean
  propostaId: string | null
  nomeParecido: boolean
}

const DIA_EM_MS = 24 * 60 * 60 * 1000

const dia = (iso: string) => Date.parse(iso.slice(0, 10))
const mesmoMes = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7)

/**
 * Quais previsões abertas parecem ser este lançamento do banco. Pura: a
 * consulta mora em `fila-db.ts`. Spec 2026-10-01 §4, card v2 §A.
 *
 * Mesma conta, mesmo sinal, ±10 dias e — o que segura palpite ruim — nome
 * com palavra em comum OU valor até 2% diferente. Previsão antiga também
 * entra pela busca ampliada (`JANELA_PREVISAO_ANTIGA_DIAS`). Ordem: mesma
 * contraparte da série, nome parecido, diferença de valor, dias. A proposta
 * que o sync gravou é a candidata 1 se passar nesse filtro: é o palpite que
 * o motor já fez.
 */
export function escolherCandidatas(
  lancamento: LancamentoDoBanco,
  previsoes: PrevisaoAberta[],
  opcoes: { proposta?: { id: string; previsaoId: string } | null; recusadas?: Set<string> } = {},
): Candidata[] {
  const valor = Math.abs(lancamento.amountCents)
  const quaseIgual = valor * TOLERANCIA_VALOR_IGUAL
  const elegiveis = previsoes
    .filter((p) => p.accountId === lancamento.accountId)
    .filter((p) => Math.sign(p.amountCents) === Math.sign(lancamento.amountCents))
    .filter((p) => !opcoes.recusadas?.has(p.id))
    .map(({ antiga, contrapartes, ...p }) => ({
      candidata: {
        ...p,
        diasDeDiferenca: Math.round(Math.abs(dia(p.date) - dia(lancamento.date)) / DIA_EM_MS),
        diferencaCents: Math.abs(p.amountCents - lancamento.amountCents),
        outraConta: false,
        propostaId: opcoes.proposta?.previsaoId === p.id ? opcoes.proposta.id : null,
        nomeParecido: temPalavraEmComum(lancamento.description, p.description),
      },
      antiga: Boolean(antiga),
      mesmaContraparte: Boolean(lancamento.counterpartyId && contrapartes?.includes(lancamento.counterpartyId)),
    }))
    .filter(({ candidata: c, antiga, mesmaContraparte }) => {
      const comum = c.diasDeDiferenca <= JANELA_BUSCA_DIAS && (c.nomeParecido || c.diferencaCents <= quaseIgual)
      if (comum || !antiga) return comum
      const perto = c.diasDeDiferenca <= JANELA_PREVISAO_ANTIGA_DIAS || mesmoMes(c.date, lancamento.date)
      const conhecido = c.nomeParecido || mesmaContraparte
      return perto && (c.diferencaCents <= quaseIgual || (conhecido && c.diferencaCents <= valor * TOLERANCIA_VALOR_ANTIGA))
    })
    .sort((a, b) => Number(b.mesmaContraparte) - Number(a.mesmaContraparte)
      || Number(b.candidata.nomeParecido) - Number(a.candidata.nomeParecido)
      || a.candidata.diferencaCents - b.candidata.diferencaCents
      || a.candidata.diasDeDiferenca - b.candidata.diasDeDiferenca)
    .map((e) => e.candidata)

  const daProposta = elegiveis.findIndex((c) => c.propostaId !== null)
  if (daProposta > 0) elegiveis.unshift(...elegiveis.splice(daProposta, 1))
  return elegiveis.slice(0, MAX_CANDIDATAS)
}
