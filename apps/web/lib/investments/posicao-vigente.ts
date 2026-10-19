import type { getDb } from '@floow/db'
import type { BankPositionInput } from '@floow/core-finance'
import { sql } from 'drizzle-orm'

type DbClient = ReturnType<typeof getDb>

export interface LeituraDoBanco extends BankPositionInput {
  referenceDate: string
  /** null na linha que `zerarAusentes` grava; o banco sempre manda o PU, nem que 0. */
  unitPrice: number | null
}

const zerada = (l: LeituraDoBanco) => !l.quantity && !l.grossCents && !l.netCents

/**
 * Qual leitura vale, das mais novas para as mais antigas.
 *
 * Caso real (XP, 19/10/2026): o sync trouxe, com data de domingo 18/10, saldo
 * zero em todos os títulos do Tesouro, sem venda nem resgate, e a conta perdeu
 * R$ 444 mil numa noite. Zero vindo do banco só vale confirmado por uma
 * segunda leitura — o mesmo critério do aviso de divergência do saldo. O zero
 * de `zerarAusentes` (papel fora da listagem, cópia descartada) é decisão
 * nossa e vale na hora.
 */
export function posicaoVigente(leituras: LeituraDoBanco[]): LeituraDoBanco | null {
  const [atual, anterior] = leituras
  if (!atual) return null
  if (zerada(atual) && atual.unitPrice !== null && anterior && !zerada(anterior)) return anterior
  return atual
}

/**
 * As duas leituras mais novas de cada ativo da org, sem as espelhadas.
 *
 * Espelho (XP, 15/10/2026): um id de NTN-F 2037 sem saldo próprio veio com a
 * quantidade, o PU e o saldo do NTN-F 2033 até a última casa, e o título
 * contou em dobro (R$ 50,9 mil). Mesma data, quantidade, PU e bruto que a
 * leitura de outro ativo é cópia; fica a do id da Polp mais antigo (UUIDv7).
 * O PU de compra separa dois lotes de mesmo tamanho do mesmo título — se os
 * dois têm e diferem, não é cópia.
 */
export async function leiturasRecentesDoBanco(db: DbClient, orgId: string): Promise<Map<string, LeituraDoBanco[]>> {
  const rows = await db.execute<{
    asset_id: string
    reference_date: string
    quantity: string | null
    unit_price: string | null
    gross_cents: number | null
    net_cents: number | null
    purchase_unit_price: string | null
  }>(sql`
    WITH p AS (
      SELECT b.asset_id, b.reference_date, b.quantity, b.unit_price, b.gross_cents, b.net_cents, b.purchase_unit_price,
             (SELECT min(r.polp_resource_id) FROM openfinance_resources r WHERE r.asset_id = b.asset_id) AS polp_id
        FROM asset_bank_positions b
       WHERE b.org_id = ${orgId}
    ), v AS (
      SELECT p.*, row_number() OVER (PARTITION BY p.asset_id ORDER BY p.reference_date DESC) AS n
        FROM p
       WHERE NOT EXISTS (
         SELECT 1 FROM p o
          WHERE o.asset_id <> p.asset_id
            AND o.reference_date = p.reference_date
            AND coalesce(p.quantity, 0) <> 0
            AND o.quantity = p.quantity
            AND o.unit_price = p.unit_price
            AND o.gross_cents IS NOT DISTINCT FROM p.gross_cents
            AND (coalesce(o.purchase_unit_price, 0) = 0 OR coalesce(p.purchase_unit_price, 0) = 0
                 OR o.purchase_unit_price = p.purchase_unit_price)
            AND o.polp_id < p.polp_id
       )
    )
    SELECT asset_id, reference_date::text AS reference_date, quantity, unit_price, gross_cents, net_cents, purchase_unit_price
      FROM v WHERE n <= 2
     ORDER BY asset_id, reference_date DESC`)
  const num = (v: string | null) => (v === null ? null : Number(v))
  const porAtivo = new Map<string, LeituraDoBanco[]>()
  for (const r of rows) {
    const lista = porAtivo.get(r.asset_id) ?? []
    lista.push({
      referenceDate: r.reference_date,
      quantity: num(r.quantity),
      unitPrice: num(r.unit_price),
      grossCents: r.gross_cents,
      netCents: r.net_cents,
      purchaseUnitPrice: num(r.purchase_unit_price),
    })
    porAtivo.set(r.asset_id, lista)
  }
  return porAtivo
}
