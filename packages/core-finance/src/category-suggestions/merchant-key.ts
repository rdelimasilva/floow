/**
 * Chave de agrupamento por estabelecimento, a partir da descrição do lançamento.
 * Ver docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md.
 */

/** Prefixos de adquirente/subadquirente que antecedem o nome real. */
const PREFIXOS = new Set(['pag', 'pg', 'mp', 'ec', 'ifd'])

/** Palavras que aparecem em qualquer lançamento e não identificam ninguém. */
const GENERICAS = new Set([
  'pix', 'ted', 'doc', 'tef', 'compra', 'pagamento', 'pagto', 'pgto', 'pagam', 'enviado', 'enviada',
  'recebido', 'recebida', 'transferencia', 'transf', 'debito', 'credito', 'cartao', 'parcela', 'boleto',
  'qr', 'qrs', 'code', 'saida', 'entrada', 'tarifa', 'estorno', 'agendado', 'agendamento', 'valor',
  'de', 'da', 'do', 'das', 'dos', 'em', 'para', 'com', 'br', 'ltda', 'sa', 'me', 'eireli', 'www',
])

/**
 * Movimentação de investimento que o banco manda como saída. Não é gasto de
 * estabelecimento nenhum: a descrição inteira é descartada.
 */
const INVESTIMENTO = new Set(['aplicacao', 'resgate', 'cofrinho', 'cofrinhos', 'cdb', 'lci', 'lca', 'tesouro'])

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Número vira separador, não descarta o token: "Maraisa05" e "Maraisa Ramos"
 * precisam cair no mesmo grupo.
 */
function tokens(description: string): string[] {
  const todos = semAcento(description).toLowerCase().split(/[^a-z]+/)
  if (todos.some((t) => INVESTIMENTO.has(t))) return []
  return todos.filter((t) => t.length >= 2 && !PREFIXOS.has(t) && !GENERICAS.has(t))
}

export function normalizeMerchant(description: string): string {
  const t = tokens(description)
  if (t.length === 0) return ''
  if (t[0].length >= 5 || t.length === 1) return t[0]
  return `${t[0]} ${t[1]}`
}

/**
 * Termo para `category_rules` (match `contains` sobre a descrição crua em
 * minúsculas). Precisa ser substring de todas as descrições do grupo, senão a
 * regra nunca dispara.
 */
export function ruleTermFor(key: string, descriptions: string[]): string | null {
  const lower = descriptions.map((d) => d.toLowerCase())
  const casaComTodas = (term: string) => term.length >= 3 && lower.every((d) => d.includes(term))
  if (casaComTodas(key)) return key
  const primeiro = key.split(' ')[0]
  if (casaComTodas(primeiro)) return primeiro
  return null
}

export function normalizeCategoryName(name: string): string {
  return semAcento(name).toLowerCase().trim().replace(/\s+/g, ' ')
}
