import type { ContaDeCaixa, ContextoDiagnostico, Perfil, PosicaoDiagnostico } from '@floow/core-finance'
import { estaEncerrada } from '@/lib/investments/encerrados'
import type { EnrichedPosition } from '@/lib/investments/queries'

export interface AtivoDoDiagnostico {
  id: string
  ticker: string | null
  assetSubtype: string | null
  cnpj: string | null
  issuerName: string | null
  indexer: string | null
  indexerPercentage: number | null
  preFixedRate: number | null
  dueDate: string | null
}

export interface ContaDoDiagnostico {
  id: string
  type: string
  balanceCents: number
  titular: string | null
  isActive: boolean
}

export interface DadosDoDiagnostico {
  hoje: string
  posicoes: Pick<EnrichedPosition, 'assetId' | 'name' | 'assetClass' | 'currentValueCents' | 'quantityHeld' | 'source'>[]
  ativos: AtivoDoDiagnostico[]
  contas: ContaDoDiagnostico[]
  porAtivo: Map<string, Set<string>>
  gastoMensalCents: number | null
  cdi12m: number | null
  perfil: Perfil | null
}

const TIPOS_DE_CAIXA = new Set<string>(['checking', 'savings', 'cash'])

/**
 * Junta o que veio do banco no contexto das regras.
 *
 * A conta corretora fica fora do caixa: o saldo dela repete as posições
 * (ver `account-kind.ts` no core-finance).
 */
export function montarContexto(d: DadosDoDiagnostico): ContextoDiagnostico {
  const ativos = new Map(d.ativos.map((a) => [a.id, a]))
  const contas = new Map(d.contas.map((c) => [c.id, c]))

  const titularDo = (assetId: string): string | null => {
    const ids = [...(d.porAtivo.get(assetId) ?? [])].sort()
    for (const id of ids) {
      const titular = contas.get(id)?.titular
      if (titular) return titular
    }
    return null
  }

  const posicoes: PosicaoDiagnostico[] = d.posicoes
    .filter((p) => !estaEncerrada(p))
    .map((p) => {
      const a = ativos.get(p.assetId)
      return {
        assetId: p.assetId,
        nome: p.name,
        classe: p.assetClass,
        subtipo: a?.assetSubtype ?? null,
        ticker: a?.ticker ?? null,
        valorCents: p.currentValueCents,
        cnpjEmissor: a?.cnpj ?? null,
        emissor: a?.issuerName ?? null,
        indexador: a?.indexer ?? null,
        percentualIndexador: a?.indexerPercentage ?? null,
        taxaPrefixada: a?.preFixedRate ?? null,
        vencimento: a?.dueDate ?? null,
        titular: titularDo(p.assetId),
      }
    })

  const caixa: ContaDeCaixa[] = d.contas
    .filter((c) => c.isActive && TIPOS_DE_CAIXA.has(c.type))
    .map((c) => ({ tipo: c.type as ContaDeCaixa['tipo'], saldoCents: c.balanceCents }))

  return {
    hoje: d.hoje,
    posicoes,
    caixa,
    gastoMensalCents: d.gastoMensalCents,
    cdi12m: d.cdi12m,
    perfil: d.perfil,
  }
}
