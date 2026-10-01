import type { ContaDoItem } from '@/lib/finance/conciliacao/fila'

const TIPO_LEGIVEL: Record<string, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão',
  brokerage: 'Investimentos',
  cash: 'Dinheiro',
}

/** "12/09" de uma data ISO (só a parte do dia, sem fuso). */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** Dia de um instante, no fuso de quem usa o app: a importação das 23h UTC ainda é "ontem" no Brasil. */
function diaMesDoInstante(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

/**
 * A conta é a primeira coisa do card (spec §2.2): quem tem duas contas no
 * mesmo banco só concilia com o extrato certo se souber de qual delas veio.
 */
export function rotuloDaConta(conta: ContaDoItem, cardLastDigits: string | null): { titulo: string; detalhe: string | null } {
  const tipo = TIPO_LEGIVEL[conta.tipo] ?? conta.tipo
  const titulo = [conta.instituicao ?? conta.nome, tipo].join(' · ')
  if (conta.tipo === 'credit_card') {
    return { titulo, detalhe: cardLastDigits ? `Cartão ••••${cardLastDigits}` : null }
  }
  const partes = [
    conta.agencia ? `ag ${conta.agencia}` : null,
    conta.numero ? `cc ••••${conta.numero.slice(-4)}` : null,
  ].filter(Boolean)
  return { titulo, detalhe: partes.length > 0 ? partes.join(' · ') : null }
}

export function CardConta({ conta, cardLastDigits, importedAt }: {
  conta: ContaDoItem
  cardLastDigits: string | null
  importedAt: string | null
}) {
  const { titulo, detalhe } = rotuloDaConta(conta, cardLastDigits)
  const inicial = (conta.instituicao ?? conta.nome).trim().charAt(0).toUpperCase()
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
      <div
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-200 text-xs font-bold text-gray-700"
      >
        {inicial}
      </div>
      <div className="min-w-0 text-sm">
        <p>
          <span className="font-semibold text-gray-900">{titulo}</span>
          {detalhe && <span className="text-gray-600"> · {detalhe}</span>}
        </p>
        {importedAt && (
          <p className="text-xs text-gray-500">veio do Open Finance em {diaMesDoInstante(importedAt)}</p>
        )}
      </div>
    </div>
  )
}
