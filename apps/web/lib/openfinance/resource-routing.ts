/**
 * A quem pertence um recurso da Polp.
 *
 * `polp_resource_id` é único no floow inteiro, e é isso que torna o roteamento
 * do webhook determinístico: dado um id, existe no máximo uma org. A
 * contrapartida é que a mesma conta bancária não pode pertencer a duas orgs, e
 * essa decisão precisa ser explícita — o caminho do webhook não tem sessão para
 * conferir, e o caminho do app roda com o role dono do banco, onde o RLS não
 * se aplica.
 *
 * Função pura de propósito: é uma regra de segregação entre clientes, e regra
 * dessas deve ser legível e testável sem banco.
 */

export type ResourceRoutingDecision =
  /** Nunca vimos este recurso: registrar sob a org atual. */
  | { action: 'insert' }
  /** Já é desta org: atualizar o status. */
  | { action: 'update'; resourceId: string }
  /** É de outra org: não tocar. Registrar e seguir. */
  | { action: 'conflict'; ownerOrgId: string }

/**
 * @param existing linha já gravada para este `polp_resource_id`, se houver
 * @param orgId org da conexão que está sendo sincronizada
 */
export function decideResourceRouting(
  existing: { id: string; orgId: string } | null | undefined,
  orgId: string,
): ResourceRoutingDecision {
  if (!existing) return { action: 'insert' }

  // A comparação é o ponto todo da função. Sem ela, a segunda org daria UPDATE
  // na linha da primeira e ficaria sem recurso nenhum, silenciosamente.
  if (existing.orgId !== orgId) return { action: 'conflict', ownerOrgId: existing.orgId }

  return { action: 'update', resourceId: existing.id }
}
