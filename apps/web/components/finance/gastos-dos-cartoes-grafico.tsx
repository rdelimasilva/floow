'use client'

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { formatBRL } from '@floow/core-finance/src/balance'
import { nomeDoMes } from '@/lib/finance/nome-do-mes'

export interface MesDoGrafico {
  mes: string
  totalCents: number
  aberta: boolean
}

const chartConfig = { gasto: { label: 'Gasto', theme: { light: '#eb6834', dark: '#d95926' } } }

const eixoY = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1,
})

function Dica({ active, payload }: { active?: boolean; payload?: { payload: MesDoGrafico }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{nomeDoMes(d.mes)}{d.aberta && ' (aberta)'}</p>
      <p className="tabular-nums text-muted-foreground">{formatBRL(d.totalCents)}</p>
    </div>
  )
}

/** Uma barra por fatura; a aberta mais clara, porque ainda vai crescer. */
export function GastosDosCartoesGrafico({
  meses, mediaCents, selecionado, onSelecionar, mostrarValores,
}: {
  meses: MesDoGrafico[]
  mediaCents: number
  selecionado: string | null
  onSelecionar: (mes: string) => void
  mostrarValores: boolean
}) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <BarChart data={meses} margin={{ top: mostrarValores ? 20 : 5 }} onClick={(e) => e?.activeLabel && onSelecionar(String(e.activeLabel))}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(m) => nomeDoMes(m, 'short')} minTickGap={8} />
        <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(c: number) => eixoY.format(c / 100)} />
        {mediaCents > 0 && (
          <ReferenceLine
            y={mediaCents}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            label={{ value: 'média', position: 'insideTopRight', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
        )}
        <ChartTooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} content={<Dica />} />
        <Bar dataKey="totalCents" maxBarSize={32} radius={[4, 4, 0, 0]} className="cursor-pointer">
          {meses.map((m) => (
            <Cell
              key={m.mes}
              fill="var(--color-gasto)"
              fillOpacity={m.aberta ? 0.35 : selecionado && selecionado !== m.mes ? 0.55 : 1}
            />
          ))}
          {mostrarValores && (
            <LabelList
              dataKey="totalCents" position="top" offset={6} fontSize={10} fill="hsl(var(--muted-foreground))"
              formatter={(v: number) => (v ? eixoY.format(v / 100) : '')}
            />
          )}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
