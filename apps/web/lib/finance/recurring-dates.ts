import { generateInstallmentDates } from '@floow/core-finance'
import type { RecurringFrequency } from '@floow/core-finance'

/**
 * Datas de calendário das recorrências, sem fuso.
 *
 * `next_due_date` e `transactions.date` são colunas `date`: o driver as entrega
 * como meia-noite UTC. Lidas com `getDate()` num navegador em UTC-3 viravam o
 * dia anterior — a lista mostrava a véspera, o campo de edição vinha com a
 * véspera e salvar gravava a véspera. Aqui tudo trafega como 'YYYY-MM-DD'.
 */

/** 'YYYY-MM-DD' de uma coluna `date`, lendo o dia em UTC. */
export function dataDeCalendario(valor: Date | string | null | undefined): string {
  if (!valor) return ''
  if (typeof valor === 'string') return valor.slice(0, 10)
  return valor.toISOString().slice(0, 10)
}

/** 'DD/MM/YYYY' sem passar por `Date`, portanto sem fuso. */
export function formatarDataDeCalendario(valor: Date | string | null | undefined): string {
  const iso = dataDeCalendario(valor)
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * As datas de `quantidade` parcelas a partir de `inicio`, espaçadas pela
 * frequência. Usa o mesmo gerador da criação da recorrência para o corte de
 * fim de mês ser idêntico (31/01 → 28/02 → 28/03).
 *
 * As contas são feitas num `Date` local montado das partes da data e lidas de
 * volta com getters locais, então o resultado não depende do fuso da máquina.
 */
export function redistribuirParcelas(
  inicio: string,
  frequencia: RecurringFrequency,
  quantidade: number,
): string[] {
  if (quantidade <= 0) return []
  const [ano, mes, dia] = inicio.split('-').map(Number)
  return generateInstallmentDates({
    startDate: new Date(ano, mes - 1, dia),
    frequency: frequencia,
    endMode: 'count',
    installmentCount: quantidade,
  }).map((d) => {
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${dd}`
  })
}
