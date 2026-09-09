import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import { matchForecast, type ForecastCandidate } from '@floow/core-finance'

type Db = ReturnType<typeof getDb>

/**
 * Quantos dias em volta do previsto vale procurar realizado. Maior que a
 * janela de `matchForecast` de propósito: a query traz o candidato e a função
 * pura decide. Filtrar apertado aqui esconderia caso da lógica testada.
 */
const JANELA_BUSCA_DIAS = 10

const DIA_EM_MS = 24 * 60 * 60 * 1000

/**
 * Vincula, nesta conta, cada previsto aberto ao realizado que o cumpriu.
 *
 * Roda depois da importação e não dentro do `persistPage` do sync: o
 * `returning` do insert de lá traz só id, valor e `balanceApplied`, sem data
 * nem descrição — e é delas que o casamento depende. Como passo separado
 * também cobre o caso inverso, o realizado que chegou antes de o previsto
 * existir.
 *
 * Só previsto ABERTO entra (`balance_applied = false`, sem vínculo). Quem já
 * foi aplicado no saldo é o problema do passado — em produção são 5 casos com
 * par identificado — e consertá-lo é decisão separada.
 *
 * O vínculo é um-para-um nos dois sentidos: `matchedTransactionId` é uma
 * coluna só (um previsto aponta para um realizado) e o índice único parcial
 * da migration 00042 impede dois previstos reivindicarem o mesmo realizado.
 * O `reivindicados` abaixo garante isso já em memória, para não depender de
 * o banco estourar.
 */
export async function matchForecastsForAccount(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<number> {
  const previstos = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        isNotNull(transactions.recurringTemplateId),
        eq(transactions.balanceApplied, false),
        isNull(transactions.matchedTransactionId),
        eq(transactions.isIgnored, false),
      ),
    )

  if (previstos.length === 0) return 0

  const datas = previstos.map((p) => new Date(p.date).getTime())
  const inicio = new Date(Math.min(...datas) - JANELA_BUSCA_DIAS * DIA_EM_MS)
  const fim = new Date(Math.max(...datas) + JANELA_BUSCA_DIAS * DIA_EM_MS)

  // Realizado é o que veio do banco: tem `external_id` e não nasceu de
  // template. `isIgnored` fora porque lançamento marcado como errado não
  // cumpriu previsão nenhuma.
  const realizados = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        isNotNull(transactions.externalId),
        isNull(transactions.recurringTemplateId),
        eq(transactions.isIgnored, false),
        gte(transactions.date, inicio),
        lte(transactions.date, fim),
      ),
    )

  if (realizados.length === 0) return 0

  const abertos: ForecastCandidate[] = previstos.map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    date: new Date(p.date),
    description: p.description,
  }))

  const reivindicados = new Set<string>()
  let vinculados = 0

  for (const realizado of realizados) {
    const disponiveis = abertos.filter((p) => !reivindicados.has(p.id))
    if (disponiveis.length === 0) break

    const casado = matchForecast(
      {
        amountCents: realizado.amountCents,
        date: new Date(realizado.date),
        description: realizado.description,
      },
      disponiveis,
    )

    if (!casado) continue

    reivindicados.add(casado.id)

    await db
      .update(transactions)
      .set({ matchedTransactionId: realizado.id })
      .where(and(eq(transactions.id, casado.id), eq(transactions.orgId, orgId)))

    vinculados++
  }

  return vinculados
}
