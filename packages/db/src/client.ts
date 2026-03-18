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

/**
 * Creates a Drizzle client connected to the given Postgres URL.
 * Disables prepared statements for PgBouncer compatibility (transaction mode).
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false })
  return drizzle(client, { schema: fullSchema })
}

/**
 * Singleton Drizzle client reading from DATABASE_URL.
 * Lazy-evaluated to avoid errors during Next.js static build phases.
 */
let _db: ReturnType<typeof createDb> | null = null

export function getDb(): ReturnType<typeof createDb> {
  if (!_db) {
    _db = createDb(assertEnv('DATABASE_URL'))
  }
  return _db
}
