import { and, eq, ne } from 'drizzle-orm'
import { recurringTemplates, transactions, type getDb } from '@floow/db'
import type { RecurringFrequency } from '@floow/core-finance'
import { condicoesDeParcelasPendentes } from '@/lib/finance/recurring-reschedule'
import { dataDeCalendario } from '@/lib/finance/recurring-dates'

type Db = ReturnType<typeof getDb>

/**
 * O dia em que o banco cobrou vira o dia da série.
 *
 * A recorrência nasce com o dia que o usuário digitou; o banco cobra no dia
 * dele. Fora da janela de 7 dias da conciliação, a previsão nunca casa
 * sozinha e conta em dobro com o lançamento real, todo mês, sem aviso
 * (Livelo cadastrada no dia 1, cobrada no dia 16). Quando o usuário liga uma
 * previsão ao lançamento do banco, as parcelas em aberto da mesma série
 * passam a cair no dia da cobrança — a próxima já casa sozinha.
 */

function partes(data: string): [number, number, number] {
  const [a, m, d] = data.split('-').map(Number)
  return [a, m, d]
}

function iso(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Dia `dia` do mês `mes` (pode passar de 12 ou ficar abaixo de 1), preso ao fim do mês. */
function diaNoMes(ano: number, mes: number, dia: number): string {
  const total = ano * 12 + (mes - 1)
  const a = Math.floor(total / 12)
  const m = (((total % 12) + 12) % 12) + 1
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return iso(a, m, Math.min(dia, ultimo))
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = partes(data)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = partes(de)
  const [a2, m2, d2] = partes(ate)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

/**
 * Onde a parcela `pendente` cai depois que a parcela prevista em `previsao`
 * foi cobrada em `real`. Nas séries por mês, o dia da cobrança no mesmo
 * deslocamento de meses (cobrança que virou o mês empurra as próximas
 * junto); nas séries por dia, o mesmo número de dias.
 */
export function dataRealinhada(pendente: string, previsao: string, real: string, frequencia: RecurringFrequency): string {
  if (frequencia === 'daily' || frequencia === 'weekly' || frequencia === 'biweekly') {
    return somarDias(pendente, diasEntre(previsao, real))
  }
  const [ap, mp] = partes(previsao)
  const [ar, mr, dr] = partes(real)
  const meses = ar * 12 + mr - (ap * 12 + mp)
  const [a, m] = partes(pendente)
  return diaNoMes(a, m + meses, dr)
}

/**
 * Move as parcelas em aberto da série da previsão (as mesmas que a edição
 * da recorrência move, `condicoesDeParcelasPendentes`) e o `next_due_date`
 * do template. Chamado na mesma transação que grava o vínculo. Devolve
 * quantas parcelas mudaram de data.
 */
export async function realinharSerie(
  tx: Db,
  orgId: string,
  previsao: { id: string; recurringTemplateId: string | null; date: Date | string | null },
  dataDoBanco: Date | string | null,
  hojeStr: string,
): Promise<number> {
  if (!previsao.recurringTemplateId || !previsao.date || !dataDoBanco) return 0
  const prevista = dataDeCalendario(previsao.date)
  const cobrada = dataDeCalendario(dataDoBanco)
  if (prevista === cobrada) return 0

  const [template] = await tx
    .select({ frequency: recurringTemplates.frequency, nextDueDate: recurringTemplates.nextDueDate })
    .from(recurringTemplates)
    .where(and(eq(recurringTemplates.id, previsao.recurringTemplateId), eq(recurringTemplates.orgId, orgId)))
    .limit(1)
  if (!template) return 0
  const frequencia = template.frequency as RecurringFrequency

  const pendentes = await tx
    .select({ id: transactions.id, date: transactions.date })
    .from(transactions)
    .where(and(...condicoesDeParcelasPendentes(orgId, previsao.recurringTemplateId, hojeStr), ne(transactions.id, previsao.id)))

  let movidas = 0
  for (const p of pendentes) {
    const atual = dataDeCalendario(p.date)
    const nova = dataRealinhada(atual, prevista, cobrada, frequencia)
    if (nova === atual) continue
    await tx
      .update(transactions)
      .set({ date: new Date(`${nova}T00:00:00Z`) })
      .where(and(eq(transactions.id, p.id), eq(transactions.orgId, orgId)))
    movidas++
  }

  if (template.nextDueDate) {
    const proxima = dataRealinhada(dataDeCalendario(template.nextDueDate), prevista, cobrada, frequencia)
    await tx
      .update(recurringTemplates)
      .set({ nextDueDate: new Date(`${proxima}T00:00:00Z`) })
      .where(and(eq(recurringTemplates.id, previsao.recurringTemplateId), eq(recurringTemplates.orgId, orgId)))
  }
  return movidas
}
