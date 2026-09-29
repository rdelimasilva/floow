// scripts/conciliacao-comum.mts
import { readFileSync } from 'node:fs'

/** DATABASE_URL do ambiente ou de apps/web/.env.local. */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const texto = readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8')
  for (const linha of texto.split(/\r?\n/)) {
    const i = linha.indexOf('=')
    if (i > 0 && !linha.trim().startsWith('#') && linha.slice(0, i).trim() === 'DATABASE_URL') {
      return linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  throw new Error('DATABASE_URL não encontrada (nem no ambiente nem em apps/web/.env.local)')
}

/** Lançada de dentro da transação para desfazê-la inteira. */
export class Rollback extends Error {}

export const brl = (centavos: number) =>
  (Number(centavos ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Anonimiza: "Nubank Conta" -> "N.C." */
export const sigla = (nome: string) => nome.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').join('.') + '.'
