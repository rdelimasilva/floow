import { sql } from 'drizzle-orm'

/**
 * Faz as queries do app rodarem SUJEITAS ao RLS.
 *
 * Hoje o app conecta com o papel dono das tabelas, e dono ignora RLS. Todas as
 * policies do banco são, na prática, decorativas no caminho do Drizzle: o
 * isolamento entre orgs existe só porque cada query lembra de filtrar por
 * org_id. Uma query que esquecer vaza dado de outro tenant sem nada barrar.
 *
 * O mecanismo aqui é o mesmo do PostgREST: assumir o papel `authenticated` e
 * publicar as claims do JWT no contexto da transação, para `auth.uid()` — e
 * portanto toda policy — resolver para o usuário certo.
 *
 * Por que dentro de uma transação, e com `set_config(..., true)`: o pooler roda
 * em modo transaction, então a conexão volta para o pool a cada commit. Um
 * `SET` de sessão vazaria o contexto de um usuário para a próxima requisição
 * que pegasse aquela conexão. O terceiro argumento `true` prende o valor à
 * transação.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Formato mínimo de que este módulo precisa — mantém os testes sem banco. */
interface TxLike {
  execute(query: unknown): Promise<unknown>
}
interface DbLike extends TxLike {
  transaction<T>(fn: (tx: TxLike) => Promise<T>): Promise<T>
}

export class RlsBypassError extends Error {
  constructor(role: string, motivo: string) {
    super(
      `Conexão de banco ignora RLS: o papel "${role}" ${motivo}. ` +
        'O isolamento entre orgs ficaria só na camada de aplicação. ' +
        'Aponte DATABASE_URL para o papel de aplicação (ver docs/adr/) ou use getServiceDb() explicitamente.',
    )
    this.name = 'RlsBypassError'
  }
}

/**
 * Roda `fn` numa transação com o contexto de RLS do usuário aplicado.
 *
 * `userId` tem de vir de um JWT já verificado (lib/auth/session.ts). Qualquer
 * outra origem reabre, aqui embaixo, a falha que aquele módulo fechou.
 */
export async function withRls<T>(
  db: DbLike,
  userId: string,
  fn: (tx: TxLike) => Promise<T>,
): Promise<T> {
  if (!userId) {
    throw new Error('withRls: userId é obrigatório — sem ele a transação rodaria sem contexto de RLS')
  }
  if (!UUID.test(userId)) {
    throw new Error(`withRls: userId precisa ser uuid, recebido ${JSON.stringify(userId)}`)
  }

  const claims = JSON.stringify({ sub: userId, role: 'authenticated' })

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`)
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`)
    return fn(tx)
  })
}

/**
 * Confere, na subida, que a conexão de fato está sujeita a RLS.
 *
 * Sem isto, apontar DATABASE_URL de volta para o papel dono desliga o RLS em
 * silêncio — o app continua funcionando, só que sem rede de proteção nenhuma.
 * É a checagem que transforma uma regressão invisível em falha barulhenta.
 */
export async function assertRlsEnforced(db: DbLike): Promise<void> {
  const rows = (await db.execute(sql`
    select
      current_user as current_user,
      coalesce((select rolbypassrls from pg_roles where rolname = current_user), false) as bypassrls,
      exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and pg_get_userbyid(c.relowner) = current_user
      ) as owns_tables
  `)) as Array<{ current_user: string; bypassrls: boolean; owns_tables: boolean }>

  const row = rows[0]
  if (!row) throw new Error('assertRlsEnforced: não foi possível inspecionar o papel da conexão')

  if (row.bypassrls) throw new RlsBypassError(row.current_user, 'tem BYPASSRLS')
  if (row.owns_tables) {
    throw new RlsBypassError(row.current_user, 'é dono de tabelas em public (dono ignora RLS sem FORCE)')
  }
}
