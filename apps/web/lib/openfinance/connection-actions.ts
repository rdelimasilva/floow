'use server'

/**
 * Server actions do fluxo de conexão Open Finance.
 *
 * A regra que governa este arquivo: nenhuma entidade da Polp entra no banco sem
 * o `org_id` já resolvido AQUI, a partir da sessão do usuário. O webhook depois
 * vai resolver `resource_id -> org_id` por estas linhas, e ele não tem sessão
 * nenhuma — se o vínculo não for gravado corretamente agora, lá não há como
 * descobrir de quem é o dado, e adivinhar significaria vazar extrato entre
 * clientes.
 *
 * Ver D1 e D2 em docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md
 */

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, openfinanceConnections, openfinanceResources } from '@floow/db'
import type { PolpProduct, PolpResource } from '@floow/core-finance'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/finance/queries'
import { accountsTag, transactionsTag, invalidateTag } from '@/lib/cache-tags'
import { getCpfSalt, getPolpClient } from './config'
import { hashCpf, isValidCpf, maskCpf } from './cpf'
import { describePolpError } from './errors'
import { decideResourceRouting } from './resource-routing'
import { syncConnectionTransactions, type SyncSummary } from './sync'

/** Os únicos produtos que esta fase sabe ingerir. */
const SUPPORTED_PRODUCTS: PolpProduct[] = ['ACCOUNT', 'CREDIT_CARD_ACCOUNT']

/** Tipos de recurso que viram conta no floow. O resto é ignorado por ora. */
const SUPPORTED_RESOURCE_TYPES = new Set(['ACCOUNT', 'CREDIT_CARD_ACCOUNT'])

export interface StartConnectionInput {
  institutionId: string
  institutionName?: string
  cpf: string
  products: string[]
}

export interface StartConnectionResult {
  connectionId: string
  /** Para onde redirecionar o usuário. Null se a Polp não devolveu URL. */
  authUrl: string | null
  authUrlExpiresAt: string | null
}

export async function startBankConnection(
  input: StartConnectionInput,
): Promise<StartConnectionResult> {
  const orgId = await getOrgId()
  const db = getDb()

  if (!isValidCpf(input.cpf)) {
    // Antes de qualquer chamada: consentimento com CPF inválido não devolve só
    // um erro, consome tentativa dentro de um teto regulatório mensal.
    throw new Error('CPF inválido')
  }

  const products = input.products.filter((p): p is PolpProduct =>
    (SUPPORTED_PRODUCTS as string[]).includes(p),
  )
  if (products.length === 0) {
    throw new Error('Selecione ao menos um produto para conectar')
  }

  const cpfHash = hashCpf(input.cpf, getCpfSalt())

  // O teto de reconexão é regulatório POR CPF: reconectar o mesmo par
  // CPF + instituição queima cota mensal. Barrar aqui é mais barato que
  // descobrir quando a Polp recusar. Renovar autorização de uma conexão que já
  // existe é `recreate`, não um consentimento novo.
  const [existing] = await db
    .select({ id: openfinanceConnections.id })
    .from(openfinanceConnections)
    .where(
      and(
        eq(openfinanceConnections.orgId, orgId),
        eq(openfinanceConnections.cpfHash, cpfHash),
        eq(openfinanceConnections.institutionId, input.institutionId),
        isNull(openfinanceConnections.revokedAt),
      ),
    )
    .limit(1)

  if (existing) {
    throw new Error('Este CPF já está conectado a esta instituição')
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // A falha aqui e a mais provavel de todo o fluxo (plano, credencial, CPF
  // recusado pelo banco), e e a que o usuario le na tela. O status cru nao
  // diria a ele o que fazer em seguida.
  const consent = await comErroTraduzido(() =>
    getPolpClient().createConsent({
      institutionId: input.institutionId,
      cpf: input.cpf,
      // Defesa em profundidade (D3): o webhook não devolve este campo, mas ele
      // permite conferir o vínculo de forma independente em GET /consents/{id}.
      clienteUserId: orgId,
      products,
    }),
  )

  // `avoidDuplicates: true` faz a Polp DEVOLVER um consentimento que ja existe
  // para o mesmo CPF na mesma instituicao, em vez de criar outro. Se esse
  // consentimento e de outra org, gravar aqui violaria a unicidade de
  // polp_consent_id e o usuario veria um erro de constraint. Pior que o erro
  // feio seria a alternativa: duas orgs penduradas no mesmo consentimento
  // significa extrato de um CPF visivel em dois tenants.
  const [jaRegistrado] = await db
    .select({ orgId: openfinanceConnections.orgId })
    .from(openfinanceConnections)
    .where(eq(openfinanceConnections.polpConsentId, consent.id))
    .limit(1)

  if (jaRegistrado && jaRegistrado.orgId !== orgId) {
    throw new Error(
      'Este CPF já está conectado a esta instituição em outra organização. Revogue a conexão lá antes de conectar aqui.',
    )
  }

  const [connection] = await db
    .insert(openfinanceConnections)
    .values({
      orgId,
      ownerUserId: session?.user.id ?? null,
      polpConsentId: consent.id,
      institutionId: input.institutionId,
      institutionName: input.institutionName ?? null,
      cpfHash,
      cpfMasked: maskCpf(input.cpf),
      status: consent.status,
      executionStatus: consent.execution_status ?? null,
      flags: consent.flags ?? [],
      products,
    })
    .returning({ id: openfinanceConnections.id })

  revalidatePath('/accounts')

  return {
    connectionId: connection.id,
    authUrl: consent.url_to_authenticate,
    authUrlExpiresAt: consent.url_to_authenticate_expires_at,
  }
}

export interface ConnectionSyncResult {
  status: string
  executionStatus: string | null
  flags: string[]
  /** Recursos que viraram linha local. Vazio enquanto não autorizado. */
  resources: { id: string; resourceType: string; status: string; accountId: string | null }[]
  /** Recursos que a Polp ainda não persistiu — precisam de nova consulta. */
  pendingResourceCount: number
  /** Recursos que já pertencem a outra org — não foram registrados aqui. */
  conflictingResourceCount: number
}

/**
 * Relê o consentimento na Polp e registra os recursos autorizados.
 *
 * Chamado quando o usuário volta da autorização no banco, e de novo pelo botão
 * de atualizar: a Polp pode levar minutos para ter os recursos prontos
 * (`AWAITING_RESOURCES`, retentado a cada 10 minutos do lado dela).
 */
export async function refreshBankConnection(connectionId: string): Promise<ConnectionSyncResult> {
  const orgId = await getOrgId()
  const db = getDb()

  // Ownership explícito: esta linha é a origem do org_id de tudo que vier
  // depois, inclusive pelo webhook, onde não há sessão para conferir.
  const [connection] = await db
    .select()
    .from(openfinanceConnections)
    .where(and(eq(openfinanceConnections.id, connectionId), eq(openfinanceConnections.orgId, orgId)))
    .limit(1)

  if (!connection) throw new Error('Conexão não encontrada')

  const client = getPolpClient()
  const consent = await comErroTraduzido(() => client.getConsent(connection.polpConsentId))

  await db
    .update(openfinanceConnections)
    .set({
      status: consent.status,
      executionStatus: consent.execution_status ?? null,
      flags: consent.flags ?? [],
      updatedAt: new Date(),
    })
    .where(eq(openfinanceConnections.id, connection.id))

  if (consent.status !== 'AUTHORISED') {
    return {
      status: consent.status,
      executionStatus: consent.execution_status ?? null,
      flags: consent.flags ?? [],
      resources: [],
      pendingResourceCount: 0,
      conflictingResourceCount: 0,
    }
  }

  const remote = await comErroTraduzido(() =>
    client.listConsentResources(connection.polpConsentId),
  )
  const { pending, conflicting } = await persistResources(db, connection.id, connection.orgId, remote)

  const stored = await db
    .select({
      id: openfinanceResources.id,
      resourceType: openfinanceResources.resourceType,
      status: openfinanceResources.status,
      accountId: openfinanceResources.accountId,
    })
    .from(openfinanceResources)
    .where(eq(openfinanceResources.connectionId, connection.id))

  revalidatePath('/accounts')

  return {
    status: consent.status,
    executionStatus: consent.execution_status ?? null,
    flags: consent.flags ?? [],
    resources: stored,
    pendingResourceCount: pending,
    conflictingResourceCount: conflicting,
  }
}

/**
 * Grava cada recurso com o org_id da conexão — nunca de outra fonte.
 *
 * `pending` são os que vieram sem `resource_id`: a Polp ainda não os persistiu,
 * e sem esse id não há como rotear o webhook daquele recurso. Não são erro, são
 * um "volte a consultar".
 *
 * `conflicting` são os que já existem sob OUTRA org. `polp_resource_id` é único
 * globalmente — é o que torna o roteamento do webhook determinístico —, então a
 * mesma conta bancária não pode pertencer a duas orgs. Antes esta função dava
 * UPDATE sem conferir a org: a segunda org silenciosamente atualizava a linha da
 * primeira e ficava sem recurso nenhum, sem erro em lugar algum.
 */
async function persistResources(
  db: ReturnType<typeof getDb>,
  connectionId: string,
  orgId: string,
  remote: PolpResource[],
): Promise<{ pending: number; conflicting: number }> {
  let pending = 0
  let conflicting = 0

  for (const resource of remote) {
    if (!SUPPORTED_RESOURCE_TYPES.has(resource.type)) continue

    if (!resource.resource_id) {
      pending++
      continue
    }

    const [existing] = await db
      .select({ id: openfinanceResources.id, orgId: openfinanceResources.orgId })
      .from(openfinanceResources)
      .where(eq(openfinanceResources.polpResourceId, resource.resource_id))
      .limit(1)

    const decision = decideResourceRouting(existing, orgId)

    if (decision.action === 'conflict') {
      conflicting++
      continue
    }

    if (decision.action === 'update') {
      await db
        .update(openfinanceResources)
        .set({ status: resource.status, updatedAt: new Date() })
        .where(
          and(
            eq(openfinanceResources.id, decision.resourceId),
            eq(openfinanceResources.orgId, orgId),
          ),
        )
      continue
    }

    await db.insert(openfinanceResources).values({
      orgId,
      connectionId,
      polpResourceId: resource.resource_id,
      resourceType: resource.type,
      status: resource.status,
    })
  }

  return { pending, conflicting }
}

/** Revoga o consentimento na Polp e marca a conexão como encerrada. */
export async function revokeBankConnection(connectionId: string): Promise<void> {
  const orgId = await getOrgId()
  const db = getDb()

  const [connection] = await db
    .select({ id: openfinanceConnections.id, polpConsentId: openfinanceConnections.polpConsentId })
    .from(openfinanceConnections)
    .where(and(eq(openfinanceConnections.id, connectionId), eq(openfinanceConnections.orgId, orgId)))
    .limit(1)

  if (!connection) throw new Error('Conexão não encontrada')

  await comErroTraduzido(() => getPolpClient().revokeConsent(connection.polpConsentId))

  // As transações já importadas continuam onde estão: são do usuário, e apagá-
  // las junto seria destruir histórico que ele espera manter. O que acaba é o
  // acesso a dado novo.
  await db
    .update(openfinanceConnections)
    .set({ revokedAt: new Date(), status: 'REJECTED', updatedAt: new Date() })
    .where(eq(openfinanceConnections.id, connection.id))

  revalidatePath('/accounts')
}

/**
 * Puxa as transacoes das contas vinculadas desta conexao.
 *
 * E o mesmo caminho que o webhook vai acionar quando existir: la a janela sera
 * menor e o gatilho automatico, mas o codigo que grava e este.
 */
export async function syncBankConnection(connectionId: string): Promise<SyncSummary> {
  const orgId = await getOrgId()
  const db = getDb()

  const [connection] = await db
    .select({
      id: openfinanceConnections.id,
      orgId: openfinanceConnections.orgId,
      status: openfinanceConnections.status,
    })
    .from(openfinanceConnections)
    .where(and(eq(openfinanceConnections.id, connectionId), eq(openfinanceConnections.orgId, orgId)))
    .limit(1)

  if (!connection) throw new Error('Conexão não encontrada')
  if (connection.status !== 'AUTHORISED') {
    throw new Error('A conexão ainda não foi autorizada no banco')
  }

  const summary = await comErroTraduzido(() =>
    syncConnectionTransactions(db, getPolpClient(), {
      id: connection.id,
      orgId: connection.orgId,
    }),
  )

  await invalidateTag(accountsTag(orgId))
  await invalidateTag(transactionsTag(orgId))
  revalidatePath('/accounts')
  revalidatePath('/transactions')

  return summary
}

/**
 * Roda a chamada e substitui a falha da Polp por uma frase acionavel.
 *
 * O erro original nao e engolido: describePolpError le status, Retry-After e o
 * corpo da resposta para montar a mensagem.
 */
async function comErroTraduzido<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw new Error(describePolpError(error))
  }
}
