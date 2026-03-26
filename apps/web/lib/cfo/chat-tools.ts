import type { ChatTool, ToolCall } from '@floow/core-finance'
import { upsertBudgetGoal } from '@/lib/finance/budget-actions'

export const ALLOWED_TOOLS = ['create_budget', 'adjust_budget', 'view_transactions', 'view_account'] as const
export type AllowedToolName = (typeof ALLOWED_TOOLS)[number]

export const CHAT_TOOLS: ChatTool[] = [
  {
    name: 'create_budget',
    description: 'Criar um orçamento mensal para uma categoria de gastos',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do orçamento (ex: "Delivery")' },
        targetCents: { type: 'number', description: 'Limite em centavos (ex: 50000 = R$500)' },
      },
      required: ['name', 'targetCents'],
    },
  },
  {
    name: 'adjust_budget',
    description: 'Ajustar o limite de um orçamento existente',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do orçamento a ajustar' },
        targetCents: { type: 'number', description: 'Novo limite em centavos' },
      },
      required: ['name', 'targetCents'],
    },
  },
  {
    name: 'view_transactions',
    description: 'Redirecionar o usuário para ver transações filtradas por categoria ou período',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtro de categoria' },
        period: { type: 'string', description: 'Período no formato YYYY-MM' },
      },
    },
  },
  {
    name: 'view_account',
    description: 'Redirecionar o usuário para ver detalhes de uma conta',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'ID da conta' },
      },
      required: ['accountId'],
    },
  },
]

export async function executeToolCall(
  toolCall: ToolCall,
  orgId: string,
): Promise<{ success: boolean; message: string; redirect?: string }> {
  if (!ALLOWED_TOOLS.includes(toolCall.name as AllowedToolName)) {
    return { success: false, message: `Tool "${toolCall.name}" não permitida.` }
  }

  const params = toolCall.params

  switch (toolCall.name) {
    case 'create_budget':
    case 'adjust_budget': {
      const formData = new FormData()
      formData.set('name', String(params.name ?? ''))
      formData.set('targetCents', String(params.targetCents ?? 0))
      formData.set('type', 'spending')
      formData.set('period', 'monthly')
      try {
        await upsertBudgetGoal(formData)
        return { success: true, message: `Orçamento "${params.name}" criado/ajustado com sucesso.` }
      } catch (err) {
        return { success: false, message: `Erro ao criar orçamento: ${err}` }
      }
    }
    case 'view_transactions': {
      const query = new URLSearchParams()
      if (params.category) query.set('category', String(params.category))
      if (params.period) query.set('period', String(params.period))
      return { success: true, message: 'Redirecionando para transações.', redirect: `/transactions${query.toString() ? `?${query}` : ''}` }
    }
    case 'view_account': {
      return { success: true, message: 'Redirecionando para conta.', redirect: `/accounts/${params.accountId}` }
    }
    default:
      return { success: false, message: 'Tool desconhecida.' }
  }
}
