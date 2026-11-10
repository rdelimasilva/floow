import type { ContaDeCaixa, ContextoDiagnostico, PosicaoDiagnostico } from '../../diagnostico'

let seq = 0

export function posicao(parcial: Partial<PosicaoDiagnostico> = {}): PosicaoDiagnostico {
  seq += 1
  return {
    assetId: `a${seq}`,
    nome: `Ativo ${seq}`,
    classe: 'fixed_income',
    subtipo: 'CDB',
    ticker: null,
    valorCents: 1_000_000,
    cnpjEmissor: null,
    emissor: null,
    indexador: 'CDI',
    percentualIndexador: 1,
    taxaPrefixada: null,
    vencimento: null,
    titular: null,
    ...parcial,
  }
}

export function caixa(saldoCents: number, tipo: ContaDeCaixa['tipo'] = 'checking'): ContaDeCaixa {
  return { tipo, saldoCents }
}

export function contexto(parcial: Partial<ContextoDiagnostico> = {}): ContextoDiagnostico {
  return {
    hoje: '2026-11-10',
    posicoes: [],
    caixa: [],
    gastoMensalCents: 1_000_000,
    cdi12m: 0.109,
    perfil: null,
    ...parcial,
  }
}
