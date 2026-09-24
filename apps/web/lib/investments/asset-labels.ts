import type { assetClassEnum, eventTypeEnum } from '@floow/db'

export type AssetClass = (typeof assetClassEnum.enumValues)[number]
export type EventType = (typeof eventTypeEnum.enumValues)[number]

/** Fonte única do rótulo de classe. Antes eram cinco mapas copiados. */
export const ASSET_CLASS_LABEL = {
  br_equity: 'Ações BR',
  fii: 'FIIs',
  etf: 'ETFs',
  crypto: 'Cripto',
  fixed_income: 'Renda Fixa',
  international: 'Internacional',
  fund: 'Fundos',
  treasury: 'Tesouro Direto',
  credit_fixed_income: 'Crédito Privado',
} as const satisfies Record<AssetClass, string>

export const EVENT_TYPE_LABEL = {
  buy: 'Compra',
  sell: 'Venda',
  dividend: 'Dividendo',
  interest: 'Juros',
  split: 'Desdobramento',
  amortization: 'Amortização',
  come_cotas: 'Come-cotas',
  jcp: 'JCP',
  maturity: 'Vencimento',
  tax: 'Imposto',
  other: 'Outros',
} as const satisfies Record<EventType, string>

/** Título de Tesouro e CDB não têm ticker; o nome é o que identifica. */
export function assetDisplayName(asset: { ticker: string | null; name: string }): string {
  return asset.ticker ?? asset.name
}
