/** Insight categories matching the 7 analyzers */
export type InsightCategory =
  | 'cash_flow'
  | 'budget'
  | 'debt'
  | 'investment'
  | 'patrimony'
  | 'retirement'
  | 'behavior'

/** Severity levels ordered by priority */
export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive'

/** Output of a single analyzer rule */
export interface InsightResult {
  type: string
  category: InsightCategory
  severity: InsightSeverity
  title: string
  body: string
  metric: Record<string, number>
  suggestedAction?: {
    type: string
    params: Record<string, unknown>
  }
}

// -- Analyzer Inputs (one per analyzer, pure function contracts) --

export interface CashFlowAnalyzerInput {
  monthlyTotals: { month: string; income: number; expense: number }[]
  accountBalances: { accountId: string; name: string; balance: number }[]
}

export interface BudgetAnalyzerInput {
  goals: { category: string; limit: number; spent: number; period: string }[]
  historicalUsage: { category: string; month: string; spent: number }[]
}

export interface DebtAnalyzerInput {
  debts: {
    name: string
    balance: number
    monthlyPayment: number
    interestRate: number
    isOverdraft: boolean
  }[]
  monthlyIncome: number
}

export interface InvestmentAnalyzerInput {
  positions: { asset: string; class: string; allocation: number; pnlPercent: number }[]
  totalInvested: number
  dividendsReceived: number
  dividendsExpected: number
}

export interface PatrimonyAnalyzerInput {
  snapshots: { month: string; netWorth: number; liquidAssets: number }[]
  fixedAssets: { name: string; currentValue: number; previousValue: number }[]
}

export interface RetirementAnalyzerInput {
  plan: {
    targetAge: number
    currentAge: number
    monthlyContribution: number
    desiredIncome: number
  } | null
  currentSavingsRate: number
  netWorth: number
}

export interface BehaviorAnalyzerInput {
  transactions: { date: string; amount: number; category: string; dayOfWeek: number }[]
  averageTransactionAmount: { current: number; previous: number }
}

// -- LLM Layer Types (used in Phase 2, defined now for forward-compatibility) --

export interface SynthesisInput {
  insights: InsightResult[]
  financialContext: {
    monthlyIncome: number
    monthlyExpenses: number
    netWorth: number
    debtTotal: number
    investmentTotal: number
    savingsRate: number
    topCategories: { name: string; amount: number }[]
  }
  locale: string
}

export interface SynthesisOutput {
  prioritizedInsights: {
    title: string
    body: string
    detailMarkdown: string
    correlatedWith?: string[]
  }[]
  dailySummary: string
}

export interface LLMProvider {
  synthesize(input: SynthesisInput): Promise<SynthesisOutput>
}

// -- Chat Types --

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool_result'
  content: string
  toolCall?: ToolCall
  toolResult?: { success: boolean; message: string }
  createdAt: string
}

export interface ChatTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  params: Record<string, unknown>
}

export interface ChatStreamChunk {
  type: 'text' | 'tool_call' | 'done' | 'error'
  text?: string
  toolCall?: ToolCall
}

export interface ChatResponse {
  content: string
  toolCalls: ToolCall[]
  usage?: { inputTokens: number; outputTokens: number }
}

export interface ChatProvider extends LLMProvider {
  streamChat(
    messages: ChatMessage[],
    options: {
      system: string
      tools?: ChatTool[]
      onChunk: (chunk: ChatStreamChunk) => void
    }
  ): Promise<ChatResponse>
}
