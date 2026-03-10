// Use anon key connection for user-context queries (RLS enforced).
// Use service_role for admin/migration operations only.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/auth'
import * as billingSchema from './schema/billing'

const fullSchema = { ...schema, ...billingSchema }

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
 */
export const db = createDb(process.env.DATABASE_URL ?? '')
