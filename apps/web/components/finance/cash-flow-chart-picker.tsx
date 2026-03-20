'use client'

import { BarChart3, LineChart, AreaChart, TrendingUp, PieChart } from 'lucide-react'

export type ChartType = 'bar' | 'stacked' | 'line' | 'area' | 'waterfall' | 'pie'

const CHART_OPTIONS: { type: ChartType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'bar', label: 'Barras', Icon: BarChart3 },
  { type: 'stacked', label: 'Empilhado', Icon: BarChart3 },
  { type: 'line', label: 'Linha', Icon: LineChart },
  { type: 'area', label: 'Área', Icon: AreaChart },
  { type: 'waterfall', label: 'Cascata', Icon: TrendingUp },
  { type: 'pie', label: 'Pizza', Icon: PieChart },
]

interface CashFlowChartPickerProps {
  activeType: ChartType
  onChange: (type: ChartType) => void
}

export function CashFlowChartPicker({ activeType, onChange }: CashFlowChartPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHART_OPTIONS.map(({ type, label, Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            activeType === type
              ? 'border border-blue-500 bg-blue-50 text-blue-700'
              : 'border border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  )
}
