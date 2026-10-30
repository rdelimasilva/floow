import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { getGastosDosCartoes } from '@/lib/finance/queries-gastos-cartao'
import { getCategories } from '@/lib/finance/queries-categories'
import { getSpendingPlanForMonth } from '@/lib/finance/recurring-budget-queries'
import { CartoesDoMes, type MesDosCartoes } from './cartoes-do-mes'

// Soma as faturas de todos os cartões pelo mês do fechamento, como a tela de cartões.
async function mesesDosCartoes(orgId: string): Promise<MesDosCartoes[]> {
  const meses = new Map<string, MesDosCartoes>()
  for (const c of await getGastosDosCartoes(orgId)) {
    for (const f of c.faturas) {
      const chave = f.fechamento.slice(0, 7)
      const m = meses.get(chave) ?? { mes: chave, totalCents: 0, porCategoria: {}, lancamentos: [] }
      m.totalCents += f.totalCents
      for (const [cat, v] of Object.entries(f.porCategoria)) m.porCategoria[cat] = (m.porCategoria[cat] ?? 0) + v
      m.lancamentos.push(...f.lancamentos)
      meses.set(chave, m)
    }
  }
  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes))
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
  const meses = await mesesDosCartoes(orgId)
  const metas = await metasDosMeses(orgId, meses.map((m) => m.mes))
  return <CartoesDoMes meses={meses} metas={metas} />
}

export default async function LightPage() {
  const orgId = await getOrgId()
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-gray-100" />}>
      <Conteudo orgId={orgId} />
    </Suspense>
  )
}
