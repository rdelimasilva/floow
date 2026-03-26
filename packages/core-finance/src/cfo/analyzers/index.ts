import type { InsightCategory, InsightResult } from '../types'
import type {
  CashFlowAnalyzerInput,
  BudgetAnalyzerInput,
  DebtAnalyzerInput,
  InvestmentAnalyzerInput,
  PatrimonyAnalyzerInput,
  RetirementAnalyzerInput,
  BehaviorAnalyzerInput,
} from '../types'
import { analyzeCashFlow } from './cash-flow'
import { analyzeBudget } from './budget'
import { analyzeDebt } from './debt'
import { analyzeInvestment } from './investment'
import { analyzePatrimony } from './patrimony'
import { analyzeRetirement } from './retirement'
import { analyzeBehavior } from './behavior'

export interface AllAnalyzerInputs {
  cashFlow?: CashFlowAnalyzerInput
  budget?: BudgetAnalyzerInput
  debt?: DebtAnalyzerInput
  investment?: InvestmentAnalyzerInput
  patrimony?: PatrimonyAnalyzerInput
  retirement?: RetirementAnalyzerInput
  behavior?: BehaviorAnalyzerInput
}

/**
 * Run selected analyzers and return all insights.
 * If `categories` is provided, only those analyzers run.
 */
export function runAnalyzers(
  inputs: AllAnalyzerInputs,
  categories?: InsightCategory[],
): InsightResult[] {
  const insights: InsightResult[] = []
  const shouldRun = (cat: InsightCategory) => !categories || categories.includes(cat)

  if (shouldRun('cash_flow') && inputs.cashFlow) {
    insights.push(...analyzeCashFlow(inputs.cashFlow))
  }
  if (shouldRun('budget') && inputs.budget) {
    insights.push(...analyzeBudget(inputs.budget))
  }
  if (shouldRun('debt') && inputs.debt) {
    insights.push(...analyzeDebt(inputs.debt))
  }
  if (shouldRun('investment') && inputs.investment) {
    insights.push(...analyzeInvestment(inputs.investment))
  }
  if (shouldRun('patrimony') && inputs.patrimony) {
    insights.push(...analyzePatrimony(inputs.patrimony))
  }
  if (shouldRun('retirement') && inputs.retirement) {
    insights.push(...analyzeRetirement(inputs.retirement))
  }
  if (shouldRun('behavior') && inputs.behavior) {
    insights.push(...analyzeBehavior(inputs.behavior))
  }

  return insights
}

export {
  analyzeCashFlow,
  analyzeBudget,
  analyzeDebt,
  analyzeInvestment,
  analyzePatrimony,
  analyzeRetirement,
  analyzeBehavior,
}
