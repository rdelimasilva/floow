// Use anon key connection for user-context queries (RLS enforced).
// Use service_role for admin/migration operations only.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/auth'
import * as billingSchema from './schema/billing'
import * as financeSchema from './schema/finance'

const fullSchema = { ...schema, ...billingSchema, ...financeSchema }

/**
 * Asserts that an environment variable is set and non-empty.
 * Throws a clear error at startup if the variable is absent.
 *
 * Inlined here to avoid a circular dependency with @floow/shared.
 */
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

/**
 * Creates a Drizzle client connected to the given Postgres URL.
 * Used for server-side queries.
 *
 * @param connectionString - Postgres connection URL
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString)
  return drizzle(client, { schema: fullSchema })
}

/**
 * Singleton Drizzle client reading from DATABASE_URL environment variable.
 * Use anon key URL for user-context queries (RLS enforced).
 * Use service_role URL for admin/migration operations only.
 *
 * Fails fast at startup if DATABASE_URL is missing or empty.
 * Lazy-evaluated to avoid errors during Next.js static build phases.
 */
let _db: ReturnType<typeof createDb> | null = null

export function getDb(): ReturnType<typeof createDb> {
  if (!_db) {
    _db = createDb(assertEnv('DATABASE_URL'))
  }
  return _db
}

/**
 * @deprecated Use getDb() for new code. This singleton is kept for backward compatibility
 * but will throw at module load time if DATABASE_URL is absent.
 */
export const db = createDb(process.env.DATABASE_URL ?? '')
