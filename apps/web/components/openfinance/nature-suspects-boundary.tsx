'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Cerca de erro em volta do detector de natureza.
 *
 * O `<Suspense>` da página de transações cobre a latência do detector, e o erro
 * dele passava direto: qualquer falha em `getNatureSuspects` subia até o
 * `error.tsx` da rota e substituía a página inteira — extrato, saldo, filtros e
 * paginação — por uma tela de erro. O gatilho real foi a coluna `polp_type`
 * ausente do banco enquanto a migration 00034 não chegava lá, e o detector tem
 * mais de um caminho para falhar do mesmo jeito: varre treze meses de extrato
 * sem paginação, o que expõe timeout de statement, e depende de tabela nova
 * (`transaction_nature_rules`) que pode faltar em ambiente atrasado.
 *
 * O banner é acessório. Falhando ele, a página continua servindo o que o
 * usuário veio ver, e o erro sai pelo Sentry.
 */
export class NatureSuspectsBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A tela fica muda de propósito; sem este report a falha ficaria invisível
    // para quem opera o app.
    Sentry.captureException(error, {
      tags: { feature: 'openfinance-nature-suspects' },
      extra: { componentStack: info.componentStack },
    })
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
