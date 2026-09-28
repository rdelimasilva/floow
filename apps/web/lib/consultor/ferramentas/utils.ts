import { z } from 'zod'
import { formatBRL } from '@floow/core-finance'
import { ParametroInvalido } from './tipos'

/** Máximo de linhas listadas num resultado — contexto pequeno e barato. */
export const LIMITE_LINHAS = 30

export const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'use o formato YYYY-MM')
export const dataSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'use o formato YYYY-MM-DD')

export function validar<T>(schema: z.ZodType<T>, params: unknown): T {
  const r = schema.safeParse(params ?? {})
  if (!r.success) {
    throw new ParametroInvalido(r.error.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`).join('; '))
  }
  return r.data
}

/** Mesma conta da tela do plano: do dia 1 ao último dia, em data local. */
export function intervaloDoMes(mes: string): { inicio: Date; fim: Date } {
  const [y, m] = mes.split('-').map(Number)
  return { inicio: new Date(y, m - 1, 1), fim: new Date(y, m, 0) }
}

function dataLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function intervaloDeDatas(inicio: string, fim: string): { inicio: Date; fim: Date } {
  const i = dataLocal(inicio)
  const f = dataLocal(fim)
  if (f < i) throw new ParametroInvalido(`fim (${fim}) é anterior ao início (${inicio})`)
  return { inicio: i, fim: f }
}

/** "alimentacao" acha "Alimentação". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export const reais = (cents: number): string => formatBRL(cents)

export function dataISO(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
}
