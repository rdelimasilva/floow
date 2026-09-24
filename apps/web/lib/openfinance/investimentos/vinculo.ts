/**
 * Regras puras da ingestão de investimentos.
 *
 * `polp_resource_id` é único GLOBAL — é o que torna o roteamento do webhook
 * determinístico. Se o investimento já pertence a outra org, a ingestão pula:
 * atualizar a linha alheia foi exatamente o defeito que `persistResources`
 * teve com contas (ver o comentário lá).
 */
export type Vinculo =
  | { tipo: 'novo' }
  | { tipo: 'meu'; resourceId: string; assetId: string | null }
  | { tipo: 'conflito' }

export function decidirVinculo(
  existente: { id: string; orgId: string; assetId: string | null } | undefined,
  orgId: string,
): Vinculo {
  if (!existente) return { tipo: 'novo' }
  if (existente.orgId !== orgId) return { tipo: 'conflito' }
  return { tipo: 'meu', resourceId: existente.id, assetId: existente.assetId }
}

/**
 * `fromDate` da próxima busca de movimentações.
 *
 * Margem de 7 dias: instituição lança movimentação com atraso (come-cotas
 * sai no último dia útil e aparece dias depois). O upsert por
 * `polp_transaction_id` torna a sobreposição inofensiva.
 */
export function janelaDeMovimentacoes(ultimaData: string | null, margemDias = 7): { fromDate?: string } {
  if (!ultimaData) return {}
  const d = new Date(`${ultimaData}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - margemDias)
  return { fromDate: `${d.toISOString().slice(0, 10)}T00:00:00Z` }
}
