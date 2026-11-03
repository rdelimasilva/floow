import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { getGastosDosCartoes } from '@/lib/finance/queries-gastos-cartao'
import { getCategories } from '@/lib/finance/queries-categories'
import { getSpendingPlanForMonth } from '@/lib/finance/recurring-budget-queries'
import { SEM_CATEGORIA } from '@floow/core-finance/src/gastos-do-cartao'
import { CartoesDoMes, type MesDosCartoes } from './cartoes-do-mes'

// Mês-calendário pela data do lançamento: a meta é do mês, não do ciclo da
// fatura. A parcela do banco vem com a data em que cai, então entra no mês dela.
// Só até hoje: o que tem data futura é parcela prevista.
async function mesesDosCartoes(orgId: string): Promise<MesDosCartoes[]> {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const meses = new Map<string, MesDosCartoes>()
  for (const c of await getGastosDosCartoes(orgId)) {
    for (const l of c.faturas.flatMap((f) => f.lancamentos)) {
      if (l.date > hoje) continue
      const chave = l.date.slice(0, 7)
      const m = meses.get(chave) ?? { mes: chave, totalCents: 0, porCategoria: {}, lancamentos: [] }
      const cat = l.categoryName ?? SEM_CATEGORIA
      m.totalCents -= l.amountCents
      m.porCategoria[cat] = (m.porCategoria[cat] ?? 0) - l.amountCents
      m.lancamentos.push(l)
      meses.set(chave, m)
    }
  }
  // O primeiro mês vem pela metade: a janela começa numa fatura, não no dia 1.
  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(1)
}

// Meta de subcategoria soma na categoria de cima, que é como o gasto vem agrupado.
async function metasDosMeses(orgId: string, meses: string[]) {
  const porId = new Map((await getCategories(orgId)).map((c) => [c.id, c]))
  const planos = await Promise.all(meses.map((mes) => {
    const [y, m] = mes.split('-').map(Number)
    return getSpendingPlanForMonth(orgId, new Date(y, m - 1, 1), new Date(y, m, 0))
  }))
  return Object.fromEntries(meses.map((mes, i) => {
    const porCategoria: Record<string, number> = {}
    for (const linha of planos[i]) {
      const c = porId.get(linha.categoryId ?? '')
      const nome = (c?.parentId ? porId.get(c.parentId)?.name : undefined) ?? c?.name
      if (nome) porCategoria[nome] = (porCategoria[nome] ?? 0) + linha.plannedCents
    }
    return [mes, porCategoria]
  }))
}

async function Conteudo({ orgId }: { orgId: string }) {
  const [meses, todas] = await Promise.all([mesesDosCartoes(orgId), getCategories(orgId)])
  const metas = await metasDosMeses(orgId, meses.map((m) => m.mes))
  const categorias = todas.filter((c) => c.type === 'expense').map(({ id, name, parentId }) => ({ id, name, parentId }))
  return <CartoesDoMes meses={meses} metas={metas} categorias={categorias} />
}

export default async function LightPage() {
  const orgId = await getOrgId()
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-gray-100" />}>
      <Conteudo orgId={orgId} />
    </Suspense>
  )
}
