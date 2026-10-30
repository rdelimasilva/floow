import { Suspense } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { getOrgId } from '@/lib/finance/queries'
import { getGastosDosCartoes } from '@/lib/finance/queries-gastos-cartao'
import { buildBudgetPacingInput } from '@/lib/cfo/budget-pacing-input'
import { GastosDosCartoes } from '@/components/finance/gastos-dos-cartoes'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const esqueleto = <div className="h-80 animate-pulse rounded-xl bg-gray-100" />

// Mesma conta do resumo semanal do WhatsApp: quanto de cada meta já foi usado no mês.
async function MetasDoMes({ orgId }: { orgId: string }) {
  const input = await buildBudgetPacingInput(orgId)
  if (!input) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-500">
          Nenhuma meta de gasto cadastrada para este mês.
        </CardContent>
      </Card>
    )
  }
  const { total, byCategory } = input.pacing
  const usado = total.plannedCents > 0 ? Math.round((total.spentCents / total.plannedCents) * 100) : 0
  const categorias = [...byCategory].sort(
    (a, b) => b.spentCents / (b.plannedCents || 1) - a.spentCents / (a.plannedCents || 1),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu mês até agora</CardTitle>
        <p className="text-sm text-gray-500">
          Dia {total.daysElapsed} de {total.daysInMonth}. Você já usou {usado}% das metas:{' '}
          {formatBRL(total.spentCents)} de {formatBRL(total.plannedCents)}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {categorias.map((c) => (
          <BudgetProgressBar
            key={c.categoryId}
            label={input.categoryNames[c.categoryId] ?? 'Sem nome'}
            currentCents={c.spentCents}
            limitCents={c.plannedCents}
          />
        ))}
      </CardContent>
    </Card>
  )
}

async function Cartoes({ orgId }: { orgId: string }) {
  const cartoes = await getGastosDosCartoes(orgId)
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return <GastosDosCartoes cartoes={cartoes} hoje={hoje} />
}

export default async function LightPage() {
  const orgId = await getOrgId()
  return (
    <>
      <Suspense fallback={esqueleto}>
        <MetasDoMes orgId={orgId} />
      </Suspense>
      <Suspense fallback={esqueleto}>
        <Cartoes orgId={orgId} />
      </Suspense>
    </>
  )
}
