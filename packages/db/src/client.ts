import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/auth'
import * as billingSchema from './schema/billing'
import * as financeSchema from './schema/finance'
import * as investmentsSchema from './schema/investments'
import * as planningSchema from './schema/planning'

const fullSchema = { ...schema, ...billingSchema, ...financeSchema, ...investmentsSchema, ...planningSchema }

function assertEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(
      `[floow] Missing required environment variable: ${name}\n` +
        `Make sure it is defined in your .env file (or deployment environment).`
    )
  }
  return value
}

type Sql = ReturnType<typeof postgres>
type Envolver = (sql: Sql) => Sql

// No globalThis, e não numa variável do módulo: o Next compila o
// `instrumentation.ts` num bundle separado das rotas, e cada bundle pode ter a
// sua cópia deste arquivo — o registro feito lá não chegaria aqui.
const CHAVE = Symbol.for('floow.db.envolverSql')
const registro = globalThis as { [CHAVE]?: Envolver }

/**
 * Registra quem envolve o cliente `postgres` antes do Drizzle — hoje, o
 * Sentry, para cada consulta virar um span no trace da rota.
 *
 * Injetado de fora para este pacote não depender do Sentry. Tem que ser
 * chamado antes da primeira conexão (o singleton é preguiçoso, e o
 * `instrumentation.ts` do app roda antes de qualquer requisição).
 */
export function setSqlWrapper(fn: Envolver) {
  registro[CHAVE] = fn
}

/**
 * Creates a Drizzle client connected to the given Postgres URL.
 * Disables prepared statements for PgBouncer compatibility (transaction mode).
 */
export function createDb(connectionString: string) {
  const cru = postgres(connectionString, {
    prepare: false,
    // Na Vercel a instância congela entre requisições, e o pooler derruba a
    // conexão ociosa nesse meio tempo. Sem prazo, a primeira consulta depois
    // do congelamento pegava uma conexão morta e esperava segundos para
    // reconectar — no Sentry, consulta de 0,3 s levando 4 s. Fechar a ociosa
    // cedo troca esse susto por uma reconexão de ~100–200 ms.
    idle_timeout: 10,
    // Renova conexões longevas antes que o pooler as derrube por conta própria.
    max_lifetime: 60 * 10,
    // Conexão que não abre em 5 s não vai abrir; melhor falhar e tentar de novo.
    connect_timeout: 5,
  })
  const client = registro[CHAVE]?.(cru) ?? cru
  return drizzle(client, { schema: fullSchema })
}

/**
 * Singleton Drizzle client reading from DATABASE_URL.
 * Lazy-evaluated to avoid errors during Next.js static build phases.
 */
let _db: ReturnType<typeof createDb> | null = null

/**
 * Conexão de serviço: roda com o papel de DATABASE_URL, sem contexto de usuário.
 *
 * Hoje esse papel é dono das tabelas, então ignora RLS. Use SOMENTE onde não
 * existe usuário na requisição e o acesso amplo é o objetivo: cron, webhook,
 * migração, rotina administrativa. Para qualquer coisa disparada por um usuário,
 * use withRls() (src/rls.ts), que aplica o contexto dele na transação.
 */
export function getServiceDb(): ReturnType<typeof createDb> {
  if (!_db) {
    _db = createDb(assertEnv('DATABASE_URL'))
  }
  return _db
}

/**
 * @deprecated Alias histórico de getServiceDb(). Cada chamada é um ponto que
 * roda por fora do RLS. A migração para withRls() está em
 * docs/adr/0001-rls-no-caminho-do-app.md — não acrescente chamadas novas.
 */
export function getDb(): ReturnType<typeof createDb> {
  return getServiceDb()
}
