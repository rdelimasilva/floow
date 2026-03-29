'use client'

import Link from 'next/link'
import { TrendingUp, Target, Wallet, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBRL } from '@floow/core-finance/src/balance'

interface PlanningSummaryRowProps {
  currentPassiveIncomeCents: number
  fiProgressPercent: number | null
  retirementReadiness: string | null
  hasWithdrawalStrategy: boolean
  hasSuccessionPlan: boolean
}

/**
 * PlanningSummaryRow — 4 summary cards for the planning hub dashboard.
 *
 * Shows: current passive income, FI progress, withdrawal strategy status, succession plan status.
 * Each card links to its detail page.
 * Follows the PatrimonySummary card pattern from the financial dashboard.
 */
export function PlanningSummaryRow({
  currentPassiveIncomeCents,
  fiProgressPercent,
  retirementReadiness,
  hasWithdrawalStrategy,
  hasSuccessionPlan,
}: PlanningSummaryRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Current passive income */}
      <Link href="/planning/simulation" className="block">
        <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Renda Passiva Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900">
              {formatBRL(currentPassiveIncomeCents)}
            </p>
            <p className="text-xs text-gray-500 mt-1">/mes (media dos ultimos 12 meses)</p>
          </CardContent>
        </Card>
      </Link>

      {/* 2. FI progress */}
      <Link href="/planning/fi-calculator" className="block">
        <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              Progresso FI
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fiProgressPercent != null ? (
              <>
                <p className="text-2xl font-bold text-gray-900">{fiProgressPercent}%</p>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min(100, fiProgressPercent)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-lg font-medium text-blue-600">Calcular</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {retirementReadiness ?? 'Nenhum plano salvo'}
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* 3. Withdrawal strategy */}
      <Link href="/planning/withdrawal" className="block">
        <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-orange-600" />
              Estrategia de Retirada
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasWithdrawalStrategy ? (
              <p className="text-lg font-semibold text-green-700">Configurada</p>
            ) : (
              <p className="text-lg font-medium text-orange-600">Definir</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {hasWithdrawalStrategy
                ? 'Estrategia de retirada salva'
                : 'Como voce vai usar seu patrimonio'}
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* 4. Succession plan */}
      <Link href="/planning/succession" className="block">
        <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              Plano Sucessorio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasSuccessionPlan ? (
              <p className="text-lg font-semibold text-green-700">Configurado</p>
            ) : (
              <p className="text-lg font-medium text-purple-600">Criar</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {hasSuccessionPlan
                ? 'Plano sucessorio salvo'
                : 'Herdeiros e distribuicao do patrimonio'}
            </p>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
