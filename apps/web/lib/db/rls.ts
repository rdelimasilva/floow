import { getServiceDb, withRls } from '@floow/db'
import { requireIdentity } from '@/lib/auth/session'

type Tx = Parameters<Parameters<typeof withRls>[2]>[0]

/**
 * Roda a query sob o RLS do usuário da requisição.
 *
 * É o substituto de `getDb()` em tudo que nasce de uma ação do usuário. A
 * diferença prática: `getDb()` conecta como dono das tabelas e ignora todas as
 * policies, então o isolamento entre orgs depende de a query lembrar do filtro
 * `org_id`. Aqui o banco barra sozinho.
 *
 * Vale desde já, sem trocar o DATABASE_URL: `set_config('role','authenticated')`
 * sujeita a transação ao RLS mesmo numa conexão com BYPASSRLS.
 */
export async function withUserDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { userId } = await requireIdentity()
  return withRls(getServiceDb(), userId, fn)
}

/**
 * Igual, mas com o userId explícito.
 *
 * Existe por causa do `unstable_cache`: o callback dele não pode ler cookies,
 * então lá dentro não dá para resolver a identidade — ela tem que entrar como
 * parâmetro, do mesmo jeito que o `orgId` já entra hoje.
 */
export function withUserDbFor<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withRls(getServiceDb(), userId, fn)
}
