import { formatBRL } from '@floow/core-finance/src/balance'
import type { ContaDoItem, ItemDaFila } from '@/lib/finance/conciliacao/fila'

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

/** Valor com sinal explícito: entrada precisa se distinguir de saída à primeira vista. */
export function valorComSinal(cents: number): string {
  return cents > 0 ? `+${formatBRL(cents)}` : formatBRL(cents)
}

/**
 * De qual conta veio (spec §2.2): quem tem duas contas no mesmo banco só
 * concilia com o extrato certo se souber de qual delas é o lançamento.
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

/** Coluna esquerda do card (card v2 §C): o lançamento do banco em destaque, a conta como linha secundária. */
export function BlocoDoBanco({ item }: { item: ItemDaFila }) {
  const { titulo, detalhe } = rotuloDaConta(item.conta, item.cardLastDigits)
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Veio do banco</p>
      <p className="mt-2 break-words text-base font-semibold text-gray-900">{item.description}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{valorComSinal(item.amountCents)}</p>
      <div className="mt-2 space-y-0.5 text-sm text-gray-600">
        <p>{[diaMes(item.date), item.meio].filter(Boolean).join(' · ')}</p>
        <p>{detalhe ? `${titulo} · ${detalhe}` : titulo}</p>
      </div>
    </div>
  )
}
