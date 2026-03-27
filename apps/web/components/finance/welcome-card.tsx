'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Wallet, ArrowLeftRight, BarChart3, X, CheckCircle2 } from 'lucide-react'

interface WelcomeStep {
  id: string
  label: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  done: boolean
}

interface WelcomeCardProps {
  hasAccounts: boolean
  hasTransactions: boolean
}

export function WelcomeCard({ hasAccounts, hasTransactions }: WelcomeCardProps) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(localStorage.getItem('floow:onboarding-dismissed') === 'true')
    }
  }, [])

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem('floow:onboarding-dismissed', 'true')
  }

  // Don't show if all steps done or user dismissed
  if (dismissed || (hasAccounts && hasTransactions)) return null

  const steps: WelcomeStep[] = [
    {
      id: 'account',
      label: 'Crie sua primeira conta',
      description: 'Cadastre sua conta corrente, poupança ou cartão de crédito.',
      href: '/accounts',
      icon: Wallet,
      done: hasAccounts,
    },
    {
      id: 'transaction',
      label: 'Registre uma transação',
      description: 'Adicione manualmente ou importe um extrato bancário.',
      href: '/transactions',
      icon: ArrowLeftRight,
      done: hasTransactions,
    },
    {
      id: 'dashboard',
      label: 'Acompanhe seus resultados',
      description: 'O dashboard se atualiza automaticamente com seus dados.',
      href: '/dashboard',
      icon: BarChart3,
      done: hasAccounts && hasTransactions,
    },
  ]

  const completedCount = steps.filter((s) => s.done).length

  return (
    <div className="relative rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Fechar guia"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Bem-vindo ao Floow!
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Comece em 3 passos simples para organizar suas finanças.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>{completedCount} de {steps.length} concluídos</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-200">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step) => (
          <Link
            key={step.id}
            href={step.href}
            className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
              step.done
                ? 'border-green-200 bg-green-50/50'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
            }`}
          >
            <div className={`mt-0.5 rounded-lg p-2 ${
              step.done ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {step.done ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <step.icon className="h-4 w-4 text-gray-600" />
              )}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${step.done ? 'text-green-700 line-through' : 'text-gray-900'}`}>
                {step.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
