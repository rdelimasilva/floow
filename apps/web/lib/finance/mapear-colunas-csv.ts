import type { CsvColumnMapping } from '@floow/core-finance'

// Nomes de coluna comuns nos extratos, para o mapeamento automático.
const DATE_HEADERS = ['data', 'date', 'dt', 'data lançamento', 'data lancamento']
const AMOUNT_HEADERS = ['valor', 'amount', 'value', 'vlr', 'valor (em r$)', 'debit', 'credit']
const DESC_HEADERS = ['descricao', 'descrição', 'description', 'memo', 'historico', 'histórico', 'nome', 'name']

function detectColumn(headers: string[], candidates: string[]): string {
  const normalized = headers.map((h) => h.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = normalized.findIndex((h) => h === candidate || h.includes(candidate))
    if (idx >= 0) return headers[idx]
  }
  return headers[0] ?? ''
}

/** Primeiro palpite de mapeamento; o usuário ajusta na tela se errar. */
export function mapeamentoAutomatico(headers: string[]): Required<CsvColumnMapping> {
  return {
    dateColumn: detectColumn(headers, DATE_HEADERS),
    amountColumn: detectColumn(headers, AMOUNT_HEADERS),
    descriptionColumn: detectColumn(headers, DESC_HEADERS),
    dateFormat: 'dd/MM/yyyy',
  }
}
