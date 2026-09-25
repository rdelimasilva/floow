/**
 * Teto de gasto com o Claude por org: US$ 0,50 por mês (fuso de São Paulo).
 *
 * A chave da API é uma só para todas as orgs, então o custo é do floow. Antes
 * de cada chamada confere o gasto do mês; passou do teto, não chama — quem
 * usa segue sem o Claude até o mês virar. A conferência é antes da chamada,
 * então a última do mês pode passar alguns centavos do teto.
 */
import { and, eq, sql } from 'drizzle-orm'
import { llmUsage } from '@floow/db'
import type { Db } from '@/lib/openfinance/persist-page'

export const LIMITE_MENSAL_MICRO_USD = 500_000

/** Preço por token em micro-dólares (US$ por milhão de tokens = µ$ por token). */
const PRECOS: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
}
/** Modelo sem preço cadastrado paga como o mais caro: nunca sai de graça. */
const PRECO_DESCONHECIDO = { input: 10, output: 50 }

export interface UsoDeTokens {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export function custoMicroUsd(model: string, uso: UsoDeTokens): number {
  const p = PRECOS[model] ?? PRECO_DESCONHECIDO
  const entrada =
    uso.input_tokens + 1.25 * (uso.cache_creation_input_tokens ?? 0) + 0.1 * (uso.cache_read_input_tokens ?? 0)
  return Math.ceil(entrada * p.input + uso.output_tokens * p.output)
}

export class OrcamentoDoClaudeEsgotado extends Error {
  constructor(orgId: string) {
    super(`Teto mensal de gasto com o Claude atingido para org=${orgId}`)
    this.name = 'OrcamentoDoClaudeEsgotado'
  }
}

export interface ControleDeGasto {
  gastoDoMes(orgId: string): Promise<number>
  registrar(orgId: string, microUsd: number): Promise<void>
}

export async function comTeto<R>(
  orgId: string,
  controle: ControleDeGasto,
  chamada: () => Promise<{ resultado: R; custoMicroUsd: number }>,
  limite = LIMITE_MENSAL_MICRO_USD,
): Promise<R> {
  if ((await controle.gastoDoMes(orgId)) >= limite) throw new OrcamentoDoClaudeEsgotado(orgId)
  const r = await chamada()
  await controle.registrar(orgId, r.custoMicroUsd)
  return r.resultado
}

function mesDeSaoPaulo(): string {
  return `${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)}-01`
}

/** Controle real: soma em `llm_usage` (00062). Usa o `db` de serviço da importação. */
export function controleDeGastoNoBanco(db: Db): ControleDeGasto {
  return {
    async gastoDoMes(orgId) {
      const [row] = await db
        .select({ cost: llmUsage.costMicroUsd })
        .from(llmUsage)
        .where(and(eq(llmUsage.orgId, orgId), eq(llmUsage.month, mesDeSaoPaulo())))
      return row?.cost ?? 0
    },
    async registrar(orgId, microUsd) {
      await db
        .insert(llmUsage)
        .values({ orgId, month: mesDeSaoPaulo(), costMicroUsd: microUsd, calls: 1 })
        .onConflictDoUpdate({
          target: [llmUsage.orgId, llmUsage.month],
          set: {
            costMicroUsd: sql`${llmUsage.costMicroUsd} + ${microUsd}`,
            calls: sql`${llmUsage.calls} + 1`,
            updatedAt: new Date(),
          },
        })
    },
  }
}
