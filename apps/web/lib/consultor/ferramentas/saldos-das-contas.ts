import { getAccounts } from '@/lib/finance/queries-accounts'
import type { Ferramenta } from './tipos'
import { reais } from './utils'

export const saldosDasContas: Ferramenta = {
  tipo: 'leitura',
  definicao: {
    name: 'saldos_das_contas',
    description: 'Saldo atual de cada conta ativa (corrente, poupança, cartão, corretora) e o total.',
    inputSchema: { type: 'object', properties: {} },
  },
  async executar(ctx) {
    const contas = await getAccounts(ctx.orgId)
    if (contas.length === 0) return 'Nenhuma conta ativa cadastrada.'
    const total = contas.reduce((s, c) => s + c.balanceCents, 0)
    const linhas = contas.map((c) => `- ${c.name} (${c.type}): ${reais(c.balanceCents)}`)
    return `${linhas.join('\n')}\nTotal: ${reais(total)}`
  },
}
