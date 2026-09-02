'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, AlertTriangle, TrendingUp, Check } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BudgetPacingChart } from '@/components/finance/budget-pacing-chart'
import { formatBRL } from '@floow/core-finance'
import type { BudgetPacingResult, PacingStatus } from '@floow/core-finance'

interface Props {
  result: BudgetPacingResult
  categoryNames: Record<string, string>
  selectedMonth: string
}

/** Status na ordem em que a lista é apresentada: o pior primeiro. */
const STATUS_RANK: Record<PacingStatus, number> = {
  estourado: 0,
  risco: 1,
  atencao: 2,
  ok: 3,
}

const STATUS_STYLE: Record<PacingStatus, { label: string; fg: string; bg: string }> = {
  estourado: { label: 'Estourado', fg: '#EB5A4F', bg: '#FDECEA' },
  risco: { label: 'Risco', fg: '#C9463C', bg: '#FDECEA' },
  atencao: { label: 'Atenção', fg: '#8A6D1F', bg: '#FAF1DC' },
  ok: { label: 'No ritmo', fg: '#3F7F76', bg: '#E8F3F1' },
}

function StatusBadge({ status }: { status: PacingStatus }) {
  const s = STATUS_STYLE[status]
  const Icon = status === 'ok' ? Check : status === 'atencao' ? TrendingUp : AlertTriangle
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium"
      style={{ color: s.fg, backgroundColor: s.bg, borderRadius: 999 }}
    >
      {/* Ícone + texto: o status nunca depende só da cor. */}
      <Icon className="h-3 w-3" aria-hidden />
      {s.label}
    </span>
  )
}

function formatMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function PacingClient({ result, categoryNames, selectedMonth }: Props) {
  const router = useRouter()
  const { total, byCategory } = result

  const pct = total.plannedCents > 0 ? Math.round((total.spentCents / total.plannedCents) * 100) : 0
  const projPct =
    total.plannedCents > 0 ? Math.round((total.projectedCents / total.plannedCents) * 100) : 0
  const overBudget = total.projectedCents > total.plannedCents && total.plannedCents > 0

  const ordered = [...byCategory].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.projectedCents - a.projectedCents,
  )

  function go(delta: number) {
    router.push(`/budgets/pacing?month=${shiftMonth(selectedMonth, delta)}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ritmo de gastos"
        description="Quanto você já gastou no mês, por onde saiu, e onde isso deve fechar."
      />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => go(-1)} aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-44 text-center text-sm font-medium capitalize">
          {formatMonth(selectedMonth)}
        </span>
        <Button variant="outline" size="icon" onClick={() => go(1)} aria-label="Próximo mês">
          <ChevronRight className="h-4 w-4" />
        </Button>
        {total.daysElapsed > 0 && (
          <span className="ml-2 text-sm" style={{ color: '#6E6E6E' }}>
            dia {total.daysElapsed} de {total.daysInMonth}
          </span>
        )}
      </div>

      <Card style={{ borderRadius: 14 }}>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm" style={{ color: '#6E6E6E' }}>
                Gasto nas categorias orçadas
              </p>
              <p className="text-3xl font-semibold tabular-nums" style={{ color: '#000' }}>
                {formatBRL(total.spentCents)}
                {total.plannedCents > 0 && (
                  <span className="ml-2 text-lg font-normal" style={{ color: '#6E6E6E' }}>
                    de {formatBRL(total.plannedCents)} · {pct}%
                  </span>
                )}
              </p>
            </div>

            {total.plannedCents > 0 && total.daysElapsed > 0 && (
              <div className="text-right">
                <p className="text-sm" style={{ color: '#6E6E6E' }}>
                  Projeção de fechamento
                </p>
                <p
                  className="text-2xl font-semibold tabular-nums"
                  style={{ color: overBudget ? '#EB5A4F' : '#3F7F76' }}
                >
                  {formatBRL(total.projectedCents)}
                  <span className="ml-2 text-base font-normal">({projPct}%)</span>
                </p>
                {total.confidence === 'low' && (
                  <p className="text-xs" style={{ color: '#8A6D1F' }}>
                    Estimativa pouco confiável tão cedo no mês
                  </p>
                )}
                {total.confidence === 'final' && (
                  <p className="text-xs" style={{ color: '#6E6E6E' }}>
                    Mês encerrado — valor final
                  </p>
                )}
              </div>
            )}
          </div>

          <BudgetPacingChart result={result} />

          {total.unbudgetedCents > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              style={{ backgroundColor: '#EEEFF3', borderRadius: 10 }}
            >
              <span style={{ color: '#333' }}>
                <strong className="tabular-nums">{formatBRL(total.unbudgetedCents)}</strong> em
                categorias sem teto definido
              </span>
              <span style={{ color: '#6E6E6E' }}>
                Fora da conta acima — defina um teto para acompanhá-las
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Por categoria</h2>

        {ordered.length === 0 ? (
          <Card style={{ borderRadius: 14 }}>
            <CardContent className="py-8 text-center text-sm" style={{ color: '#6E6E6E' }}>
              Nenhum teto definido para este mês.{' '}
              <a href="/budgets/spending" style={{ color: '#4A5899' }} className="underline">
                Definir metas de gasto
              </a>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {ordered.map((c) => {
              const cpct =
                c.plannedCents > 0 ? Math.min(150, (c.spentCents / c.plannedCents) * 100) : 0
              const style = STATUS_STYLE[c.status]
              return (
                <li key={c.categoryId}>
                  <Card style={{ borderRadius: 14 }}>
                    <CardContent className="space-y-2 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">
                            {categoryNames[c.categoryId] ?? 'Sem nome'}
                          </span>
                          <StatusBadge status={c.status} />
                        </div>
                        <span className="text-sm tabular-nums" style={{ color: '#6E6E6E' }}>
                          <strong style={{ color: '#333' }}>{formatBRL(c.spentCents)}</strong> de{' '}
                          {formatBRL(c.plannedCents)}
                        </span>
                      </div>

                      <div
                        className="h-2 w-full overflow-hidden"
                        style={{ backgroundColor: '#EEEFF3', borderRadius: 999 }}
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${cpct}%`,
                            backgroundColor: style.fg,
                            borderRadius: 999,
                          }}
                        />
                      </div>

                      {total.daysElapsed > 0 && (
                        <p className="text-xs" style={{ color: '#6E6E6E' }}>
                          No ritmo atual, fecha em{' '}
                          <span className="tabular-nums" style={{ color: style.fg }}>
                            {formatBRL(c.projectedCents)}
                          </span>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
