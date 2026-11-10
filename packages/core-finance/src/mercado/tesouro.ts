import Papa from 'papaparse'
import { dataBr, numeroBr } from './util'

// CSV de preços e taxas do Tesouro Direto (Tesouro Transparente): `;`, vírgula
// decimal, datas dd/MM/aaaa, histórico inteiro desde 2002 num arquivo só.

export type PrecoTesouro = {
  tipo: string
  vencimento: string
  data: string
  taxaCompra: number | null
  taxaVenda: number | null
  puCompra: number | null
  puVenda: number | null
}

/** `aPartirDe`: última data já gravada; só volta o que vem depois dela. `null` traz tudo. */
export function parseTesouro(csv: string, aPartirDe: string | null): { linhas: PrecoTesouro[]; invalidas: number } {
  const linhas: PrecoTesouro[] = []
  let invalidas = 0
  const { data } = Papa.parse<Record<string, string>>(csv, { delimiter: ';', header: true, skipEmptyLines: true })
  for (const l of data) {
    const tipo = l['Tipo Titulo']?.trim()
    const vencimento = dataBr(l['Data Vencimento'] ?? '')
    const dia = dataBr(l['Data Base'] ?? '')
    if (!tipo || !vencimento || !dia) {
      invalidas++
      continue
    }
    if (aPartirDe && dia <= aPartirDe) continue
    linhas.push({
      tipo,
      vencimento,
      data: dia,
      taxaCompra: numeroBr(l['Taxa Compra Manha'] ?? ''),
      taxaVenda: numeroBr(l['Taxa Venda Manha'] ?? ''),
      puCompra: numeroBr(l['PU Compra Manha'] ?? ''),
      puVenda: numeroBr(l['PU Venda Manha'] ?? ''),
    })
  }
  return { linhas, invalidas }
}
