import { unstable_cache } from 'next/cache'
import { eq } from 'drizzle-orm'
import { openfinanceConnections, openfinanceResources } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { getPolpClient, isPolpConfigured } from './config'

/**
 * Logo do banco de cada conta vinda do Open Finance.
 *
 * A conexão guarda só o `institution_id`; o logo vem do GET /institutions da
 * Polp. A lista é pública e muda pouco, então fica em cache por um dia — ao
 * contrário das leituras de conexão em `queries.ts`, aqui não há status que o
 * usuário esteja esperando mudar. Conta manual não tem banco e não entra.
 */

const logosDasInstituicoes = unstable_cache(
  async (): Promise<[string, string | null][]> => {
    const all = await getPolpClient().listInstitutions()
    return all.map((i) => [i.id, i.logo_url])
  },
  ['polp-institution-logos'],
  { revalidate: 86400 },
)

export function montarLogosDasContas(
  vinculos: { accountId: string | null; institutionId: string }[],
  logos: Map<string, string | null>,
): Map<string, string> {
  const r = new Map<string, string>()
  for (const { accountId, institutionId } of vinculos) {
    const logo = logos.get(institutionId)
    if (accountId && logo) r.set(accountId, logo)
  }
  return r
}

export async function getLogosDasContas(orgId: string): Promise<Map<string, string>> {
  if (!isPolpConfigured()) return new Map()

  const vinculos = await withUserDb(async (db) => {
    // Conta espelho de conta/cartão e a conta "Investimentos · <banco>" — as
    // duas formas de uma conta do floow pertencer a uma conexão. Conexão
    // revogada entra: a conta continua sendo daquele banco.
    const deRecursos = await db
      .select({ accountId: openfinanceResources.accountId, institutionId: openfinanceConnections.institutionId })
      .from(openfinanceResources)
      .innerJoin(openfinanceConnections, eq(openfinanceConnections.id, openfinanceResources.connectionId))
      .where(eq(openfinanceResources.orgId, orgId))
    const deInvestimentos = await db
      .select({ accountId: openfinanceConnections.investmentAccountId, institutionId: openfinanceConnections.institutionId })
      .from(openfinanceConnections)
      .where(eq(openfinanceConnections.orgId, orgId))
      .then((rows) => rows.filter((r) => r.accountId !== null))
    return [...deRecursos, ...deInvestimentos]
  })
  if (vinculos.length === 0) return new Map()

  // Sem logo a tela continua de pé: a Polp fora do ar não pode derrubar Contas.
  try {
    return montarLogosDasContas(vinculos, new Map(await logosDasInstituicoes()))
  } catch {
    return new Map()
  }
}
