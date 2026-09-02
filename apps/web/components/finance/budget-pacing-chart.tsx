'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { formatBRL } from '@floow/core-finance'
import type { AccountKind, BudgetPacingResult } from '@floow/core-finance'

/**
 * Paleta categórica por tipo de conta, em ordem fixa (nunca ciclada).
 *
 * Ancorada nas hues do design system do floow, com chroma elevado onde a cor de
 * marca não servia: o Teal (#5DA89E) e o Steel (#607D8B) originais reprovam no
 * piso de chroma — leem como cinza num gráfico — e o Goldenrod (#D4A93F) não
 * alcança 3:1 contra a superfície branca. Cor de marca serve identidade; série
 * de gráfico precisa de separação. As hues são as mesmas, os tons foram
 * ajustados até passarem na validação em modo claro e escuro.
 *
 * No escuro o pior par adjacente fica em ΔE 7.8 (deutan), o que só é aceitável
 * com codificação secundária — daí os rótulos diretos abaixo do gráfico serem
 * obrigatórios, não decoração.
 */
const ACCOUNT_COLORS: Record<AccountKind, string> = {
  credit_card: '#4A5899', // Indigo Blue — token de marca, sem alteração
  checking: '#A67C10', // Goldenrod escurecido para alcançar contraste
  cash: '#00897B', // Teal saturado para alcançar o piso de chroma
  savings: '#8D5BA8', // derivado do brand-purple (#6B3B86)
  brokerage: '#607D8B', // Steel — informacional, raro em despesa
}

const ACCOUNT_LABELS: Record<AccountKind, string> = {
  credit_card: 'Cartão de crédito',
  checking: 'Conta corrente',
  cash: 'Dinheiro',
  savings: 'Poupança',
  brokerage: 'Investimento',
}

/** Coral Red do DS — reservado para o teto e para o estouro. */
const CORAL = '#EB5A4F'
/** Steel do DS — a projeção é informacional, nunca compete com as séries. */
const STEEL = '#607D8B'

const STACK_ORDER: AccountKind[] = ['credit_card', 'checking', 'cash', 'savings', 'brokerage']

interface Props {
  result: BudgetPacingResult
}

type Point = { day: number; projecao: number | null } & Partial<Record<AccountKind, number>>

export function BudgetPacingChart({ result }: Props) {
  const { series, total } = result
  const { daysElapsed, daysInMonth, plannedCents, spentCents, projectedCents } = total

  const last = series[series.length - 1]
  // Só os tipos que tiveram gasto entram: uma série achatada em zero polui a leitura.
  const activeKinds = STACK_ORDER.filter((kind) => (last?.byAccountTypeCum[kind] ?? 0) > 0)

  const chartData: Point[] = series.map((pt, i) => {
    const day = i + 1
    // A curva de realizado para hoje. Estendê-la sugeriria gasto que não ocorreu.
    const realized = daysElapsed > 0 && day <= daysElapsed

    let projecao: number | null = null
    if (daysElapsed > 0 && day >= daysElapsed) {
      const span = daysInMonth - daysElapsed
      const t = span > 0 ? (day - daysElapsed) / span : 0
      projecao = Math.round(spentCents + (projectedCents - spentCents) * t)
    }

    const point: Point = { day, projecao }
    if (realized) {
      for (const kind of activeKinds) point[kind] = pt.byAccountTypeCum[kind]
    }
    return point
  })

  if (daysElapsed === 0 || activeKinds.length === 0) {
    return (
      <div
        className="flex min-h-[280px] w-full items-center justify-center border border-dashed text-sm"
        style={{ borderRadius: 14, borderColor: '#E0E0E0', color: '#6E6E6E' }}
      >
        {daysElapsed === 0
          ? 'Mês futuro — ainda não há gasto para acompanhar.'
          : 'Nenhum gasto registrado neste mês ainda.'}
      </div>
    )
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#E0E0E0" strokeOpacity={0.7} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            tick={{ fontSize: 12, fill: '#6E6E6E' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={80}
            tickFormatter={(v: number) => formatBRL(v)}
            tick={{ fontSize: 12, fill: '#6E6E6E' }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatBRL(value),
              name === 'projecao' ? 'Projeção' : (ACCOUNT_LABELS[name as AccountKind] ?? name),
            ]}
            labelFormatter={(day: number) => `Dia ${day}`}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #E0E0E0',
              boxShadow: '0 4px 14px rgba(10,12,30,0.08)',
              fontSize: 13,
            }}
          />

          {plannedCents > 0 && (
            <ReferenceLine
              y={plannedCents}
              stroke={CORAL}
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{
                value: `Teto ${formatBRL(plannedCents)}`,
                position: 'insideTopRight',
                fontSize: 11,
                fill: CORAL,
              }}
            />
          )}

          {activeKinds.map((kind) => (
            <Area
              key={kind}
              type="monotone"
              dataKey={kind}
              stackId="realizado"
              stroke={ACCOUNT_COLORS[kind]}
              strokeWidth={2}
              fill={ACCOUNT_COLORS[kind]}
              fillOpacity={0.32}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}

          <Line
            type="monotone"
            dataKey="projecao"
            stroke={STEEL}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Rótulos diretos — a codificação secundária que a validação de daltonismo exige. */}
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {activeKinds.map((kind) => (
          <li key={kind} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-3 w-3"
              style={{ backgroundColor: ACCOUNT_COLORS[kind], borderRadius: 4 }}
            />
            <span style={{ color: '#6E6E6E' }}>{ACCOUNT_LABELS[kind]}</span>
            <span className="font-medium tabular-nums" style={{ color: '#333333' }}>
              {formatBRL(last?.byAccountTypeCum[kind] ?? 0)}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4"
            style={{ backgroundColor: STEEL }}
          />
          <span style={{ color: '#6E6E6E' }}>Projeção</span>
          <span className="font-medium tabular-nums" style={{ color: '#333333' }}>
            {formatBRL(projectedCents)}
          </span>
        </li>
      </ul>
    </div>
  )
}
