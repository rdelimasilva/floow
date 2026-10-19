import type { getDb } from '@floow/db'
import type { BankPositionInput } from '@floow/core-finance'
import { sql } from 'drizzle-orm'

type DbClient = ReturnType<typeof getDb>

export interface LeituraDoBanco extends BankPositionInput {
  referenceDate: string
  /** `ausencia`: linha de `zerarAusentes` — papel fora da listagem ou cópia descartada. */
  origem: 'banco' | 'ausencia'
}

export interface ProvaDeSaida {
  /** Vencimento do papel (YYYY-MM-DD), quando tem. */
  vencimento: string | null
  /** Datas (YYYY-MM-DD) de venda, resgate ou vencimento registrados. */
  saidas: string[]
}

/** A posição chega atrasada em relação à movimentação: a venda pode ser de até 3 dias antes. */
const FOLGA_DA_SAIDA_DIAS = 3
/** Zero que o banco sustenta por uma semana vale mesmo sem movimentação — a venda cujo extrato nunca chega. */
const ZERO_SUSTENTADO_DIAS = 7

const zerada = (l: LeituraDoBanco) => !l.quantity && !l.grossCents && !l.netCents
const dias = (de: string, ate: string) => (Date.parse(ate) - Date.parse(de)) / 86_400_000

/**
 * Qual leitura do banco vale, das mais novas para as mais antigas.
 *
 * Caso real (XP, 19/10/2026): o sync trouxe, com data de domingo 18/10, saldo
 * zero em todos os títulos do Tesouro, sem venda nem resgate, e a conta perdeu
 * R$ 444 mil numa noite. Até ali, nenhum zero do banco depois de saldo tinha
 * saída por trás; três voltaram sozinhos. Então zero do banco precisa de
 * prova: venda/resgate/vencimento desde a última posição com saldo, papel
 * vencido, ou o banco sustentando o zero por uma semana. Sem prova, vale a
 * última posição com saldo.
 *
 * O zero de ausência é decisão nossa (papel fora da listagem, cópia de outro
 * id) e vale na hora.
 */
export function posicaoVigente(leituras: LeituraDoBanco[], prova: ProvaDeSaida): LeituraDoBanco | null {
  const atual = leituras[0]
  if (!atual) return null
  if (!zerada(atual) || atual.origem === 'ausencia') return atual

  const iUltimaComSaldo = leituras.findIndex((l) => !zerada(l))
  if (iUltimaComSaldo < 0) return atual
  const ultimaComSaldo = leituras[iUltimaComSaldo]

  if (prova.vencimento && prova.vencimento <= atual.referenceDate) return atual
  if (prova.saidas.some((d) => dias(d, ultimaComSaldo.referenceDate) <= FOLGA_DA_SAIDA_DIAS)) return atual
  const primeiroZero = leituras[iUltimaComSaldo - 1]
  if (dias(primeiroZero.referenceDate, atual.referenceDate) >= ZERO_SUSTENTADO_DIAS) return atual
  return ultimaComSaldo
}

/**
 * Posição do banco que vale por ativo da org.
 *
 * Lê, por ativo, as leituras desde a última com saldo (o que `posicaoVigente`
 * precisa), sem as espelhadas. Espelho (XP, 15/10/2026): um id de NTN-F 2037
 * sem saldo próprio veio com a quantidade, o PU e o saldo do NTN-F 2033 até a
 * última casa, e o título contou em dobro (R$ 50,9 mil). Mesma data,
 * quantidade, PU e bruto que a leitura de outro ativo é cópia; fica a do id da
 * Polp mais antigo (UUIDv7). O PU de compra separa dois lotes de mesmo tamanho
 * do mesmo título — se os dois têm e diferem, não é cópia.
 */
export async function posicoesVigentesDoBanco(db: DbClient, orgId: string): Promise<Map<string, BankPositionInput>> {
  const [rows, saidas] = await Promise.all([
    db.execute<{
      asset_id: string
      reference_date: string
      quantity: string | null
      gross_cents: number | null
      net_cents: number | null
      purchase_unit_price: string | null
      origem: 'banco' | 'ausencia'
      vencimento: string | null
    }>(sql`
      WITH p AS (
        SELECT b.asset_id, b.reference_date, b.quantity, b.unit_price, b.gross_cents, b.net_cents,
               b.purchase_unit_price, b.origem,
               (SELECT min(r.polp_resource_id) FROM openfinance_resources r WHERE r.asset_id = b.asset_id) AS polp_id
          FROM asset_bank_positions b
         WHERE b.org_id = ${orgId}
      ), v AS (
        SELECT p.* FROM p
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
      ), corte AS (
        SELECT asset_id,
               coalesce(max(reference_date) FILTER (WHERE coalesce(quantity, 0) <> 0 OR coalesce(gross_cents, 0) <> 0
                                                     OR coalesce(net_cents, 0) <> 0),
                        max(reference_date)) AS desde
          FROM v GROUP BY asset_id
      )
      SELECT v.asset_id, v.reference_date::text AS reference_date, v.quantity, v.gross_cents, v.net_cents,
             v.purchase_unit_price, v.origem, a.due_date::text AS vencimento
        FROM v
        JOIN corte c ON c.asset_id = v.asset_id AND v.reference_date >= c.desde
        JOIN assets a ON a.id = v.asset_id
       ORDER BY v.asset_id, v.reference_date DESC`),
    db.execute<{ asset_id: string; data: string }>(sql`
      SELECT asset_id, event_date::date::text AS data
        FROM portfolio_events
       WHERE org_id = ${orgId} AND event_type IN ('sell', 'maturity')`),
  ])

  const saidasPorAtivo = new Map<string, string[]>()
  for (const s of saidas) saidasPorAtivo.set(s.asset_id, [...(saidasPorAtivo.get(s.asset_id) ?? []), s.data])

  const num = (v: string | null) => (v === null ? null : Number(v))
  const porAtivo = new Map<string, { vencimento: string | null; leituras: LeituraDoBanco[] }>()
  for (const r of rows) {
    const ativo = porAtivo.get(r.asset_id) ?? { vencimento: r.vencimento, leituras: [] }
    ativo.leituras.push({
      referenceDate: r.reference_date,
      quantity: num(r.quantity),
      grossCents: r.gross_cents,
      netCents: r.net_cents,
      purchaseUnitPrice: num(r.purchase_unit_price),
      origem: r.origem,
    })
    porAtivo.set(r.asset_id, ativo)
  }

  const vigentes = new Map<string, BankPositionInput>()
  for (const [assetId, { vencimento, leituras }] of porAtivo) {
    const p = posicaoVigente(leituras, { vencimento, saidas: saidasPorAtivo.get(assetId) ?? [] })
    if (p) vigentes.set(assetId, { quantity: p.quantity, grossCents: p.grossCents, netCents: p.netCents, purchaseUnitPrice: p.purchaseUnitPrice })
  }
  return vigentes
}
