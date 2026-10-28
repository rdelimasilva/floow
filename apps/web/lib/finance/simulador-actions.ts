'use server'
import { getDb, budgetEntries } from '@floow/db'
import { and, eq, inArray } from 'drizzle-orm'
import { getOrgId, getCategories } from './queries'
import { getSpendingPlanForMonth } from './recurring-budget-queries'
import { planejarAplicacao, type LinhaParaAplicar } from './simulador-orcamento'
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'
import { budgetEntriesTag, budgetSpendingTag, invalidateTag } from '@/lib/cache-tags'

const MES = /^\d{4}-\d{2}-01$/

function dia(valor: Date | string): string {
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10)
}

/**
 * Grava a simulação no Plano de Gastos de `mes` em diante. O vigente e as metas
 * saem do banco aqui, não do cliente: a tela só manda categoria e valor.
 */
export async function aplicarSimulacao(
  mes: string,
  simulacao: { categoryId: string; simuladoCents: number }[],
): Promise<{ alteradas: number } | { error: string }> {
  if (!MES.test(mes)) return { error: 'Mês inválido' }
  const orgId = await getOrgId()

  const despesas = new Set((await getCategories(orgId)).filter((c) => c.type === 'expense').map((c) => c.id))
  for (const s of simulacao) {
    if (!despesas.has(s.categoryId)) return { error: 'Categoria inválida na simulação' }
    if (!Number.isSafeInteger(s.simuladoCents) || s.simuladoCents < 0) return { error: 'Valor inválido na simulação' }
  }

  const [y, m] = mes.split('-').map(Number)
  const plano = await getSpendingPlanForMonth(orgId, new Date(y, m - 1, 1), new Date(y, m, 0))
  const vigente = new Map(plano.filter((l) => l.categoryId).map((l) => [l.categoryId as string, l]))

  const ids = plano.map((l) => l.entryId).filter((id): id is string => !!id)
  const db = getDb()
  const entradas = ids.length
    ? await db
        .select()
        .from(budgetEntries)
        .where(and(eq(budgetEntries.orgId, orgId), inArray(budgetEntries.id, ids)))
    : []
  const porId = new Map(entradas.map((e) => [e.id, e]))

  const linhas: LinhaParaAplicar[] = simulacao.map((s) => {
    const linha = vigente.get(s.categoryId)
    const e = linha?.entryId ? porId.get(linha.entryId) : undefined
    return {
      categoryId: s.categoryId,
      simuladoCents: s.simuladoCents,
      vigenteCents: linha?.plannedCents ?? 0,
      entrada: e ? { id: e.id, startMonth: dia(e.startMonth), endMonth: e.endMonth ? dia(e.endMonth) : null } : null,
    }
  })

  const ops = planejarAplicacao(linhas, mes)
  if (ops.length === 0) return { alteradas: 0 }

  await db.transaction(async (tx) => {
    for (const op of ops) {
      const daOrg = (id: string) => and(eq(budgetEntries.id, id), eq(budgetEntries.orgId, orgId))
      if (op.tipo === 'atualizar') await tx.update(budgetEntries).set({ plannedCents: op.plannedCents }).where(daOrg(op.id))
      else if (op.tipo === 'encerrar') await tx.update(budgetEntries).set({ endMonth: new Date(op.endMonth) }).where(daOrg(op.id))
      else if (op.tipo === 'apagar') await tx.delete(budgetEntries).where(daOrg(op.id))
      else
        await tx.insert(budgetEntries).values({
          orgId,
          type: 'spending',
          categoryId: op.categoryId,
          plannedCents: op.plannedCents,
          startMonth: new Date(op.startMonth),
          endMonth: op.endMonth ? new Date(op.endMonth) : null,
        })
    }
  })

  invalidateTag(budgetEntriesTag(orgId, 'spending'))
  invalidateTag(budgetSpendingTag(orgId))
  triggerCfoAnalysis(orgId, 'budget_changed', ['budget'])
  return { alteradas: new Set(linhas.filter((l) => l.simuladoCents !== l.vigenteCents).map((l) => l.categoryId)).size }
}
