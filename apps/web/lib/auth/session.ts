import { cache } from 'react'
import { asc, eq } from 'drizzle-orm'
import { getDb, orgMembers } from '@floow/db'
import { createClient } from '@/lib/supabase/server'

/**
 * Identidade do requisitante, derivada exclusivamente de um JWT cuja assinatura
 * já foi verificada.
 *
 * Este módulo é a ÚNICA fonte de identidade do app. Nada mais pode decidir quem
 * é o usuário ou a que org ele pertence.
 *
 * Por que não `getSession()`: no servidor ele devolve o conteúdo do cookie sem
 * verificar assinatura nenhuma — `_isValidSession` só confere se os campos
 * existem. Qualquer um forja um cookie com `org_ids` arbitrário e o app aceita.
 * O caminho do Drizzle roda como dono das tabelas e ignora RLS, então não havia
 * segunda barreira: o org_id escolhido no cookie era o org_id consultado.
 *
 * `getClaims()` fecha isso. Com chave assimétrica ele verifica a assinatura
 * localmente via JWKS (com cache, sem ida à rede por requisição); com a chave
 * simétrica antiga ele cai para `getUser()`, que valida no servidor de Auth.
 * Nos dois casos as claims que voltam são confiáveis — inclusive o `org_ids`
 * que o custom_access_token_hook injeta.
 */
export interface VerifiedIdentity {
  userId: string
  orgIds: string[]
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'UnauthenticatedError'
  }
}

function readOrgIds(appMetadata: unknown): string[] {
  if (!appMetadata || typeof appMetadata !== 'object') return []
  const raw = (appMetadata as { org_ids?: unknown }).org_ids
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/**
 * Devolve a identidade verificada da requisição, ou null se não houver JWT
 * válido. Envolvido em cache() para deduplicar dentro da mesma requisição.
 */
/**
 * As claims verificadas da requisição, ou null. Uma verificação por request:
 * identidade e perfil do shell leem daqui.
 */
const readVerifiedClaims = cache(async function readVerifiedClaims() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims?.sub) return null
  return data.claims
})

export const getVerifiedIdentity = cache(
  async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
    const claims = await readVerifiedClaims()
    if (!claims) return null

    return { userId: claims.sub, orgIds: readOrgIds(claims.app_metadata) }
  },
)

export interface ShellProfile {
  userId: string
  email: string
  name: string | null
  avatarUrl: string | null
}

function readString(obj: unknown, ...keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null
  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/**
 * Nome, e-mail e avatar para o menu e o cabeçalho, lidos do token verificado.
 *
 * O layout de `(app)` roda em toda navegação; buscar isso com `getUser()`
 * custava uma ida ao servidor de Auth antes até do skeleton aparecer. O token
 * já traz `email` e `user_metadata`. O preço: um nome trocado em Configurações
 * só chega aqui quando o token é renovado — por isso aquela tela renova a
 * sessão depois de salvar.
 */
export const getShellProfile = cache(async function getShellProfile(): Promise<ShellProfile | null> {
  const claims = await readVerifiedClaims()
  if (!claims) return null

  const meta = claims.user_metadata
  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    name: readString(meta, 'full_name', 'name'),
    avatarUrl: readString(meta, 'avatar_url', 'picture'),
  }
})

/** Igual a getVerifiedIdentity, mas lança em vez de devolver null. */
export async function requireIdentity(): Promise<VerifiedIdentity> {
  const identity = await getVerifiedIdentity()
  if (!identity) throw new UnauthenticatedError()
  return identity
}

/** ID do usuário autenticado, a partir do `sub` verificado. */
export async function requireUserId(): Promise<string> {
  return (await requireIdentity()).userId
}

/**
 * Org ativa do requisitante.
 *
 * Caminho normal: a claim `org_ids` do token verificado. O fallback consulta
 * org_members — e a chave da consulta é o `sub` verificado, nunca um id vindo
 * do corpo da requisição ou do cookie.
 */
export const getOrgId = cache(async function getOrgId(): Promise<string> {
  const { userId, orgIds } = await requireIdentity()

  if (orgIds[0]) return orgIds[0]

  // Claim ausente: hook não registrado, ou token emitido antes da linha em
  // org_members existir. Resolve pelo banco, sempre preso ao usuário do token.
  const db = getDb()
  const [member] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1)

  if (!member) throw new Error('No organization found for user')

  return member.orgId
})

/**
 * Objeto `User` completo, autenticado contra o servidor de Auth.
 *
 * Para telas que renderizam o perfil (nome, avatar, e-mail, provider). Custa
 * uma ida à rede, mas devolve o estado atual do usuário em vez do retrato
 * congelado no token — e a página de Configurações é justamente onde esses
 * campos mudam.
 */
export const getAuthenticatedUser = cache(async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null
  return user
})
