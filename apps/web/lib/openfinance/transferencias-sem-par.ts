import { and, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import { condicaoDeRealizadoSemVinculo } from '@/lib/finance/forecast-match-db'
import { counterpartyKeyFor } from './counterparty-key'
import { condicaoNaoEPernaPrevista } from './perna-prevista'
import { acharOuCriarContraparte, loadCounterpartyIndex, type CounterpartyRecord } from './resolve-counterparty'

type Db = ReturnType<typeof getDb>

/**
 * Transferência que veio do banco e não tem par nem conta — legado de antes
 * de 07/09, ou Nível 1 que entrou confirmado sem destino — volta para
 * Classificar, que pede a conta (spec de 24/09, §3.5).
 *
 * Substitui, na rota do backfill, o `backfillCounterparties`: aquele rebusca a
 * Polp e reescreve tipo, categoria e estado de TODO o histórico, então rodá-lo
 * de novo desfaz decisões já tomadas. Esta rotina mexe só no recorte que
 * precisa, com o que já está gravado, e só em duas colunas.
 *
 * Nunca confirma: a linha vai pendente, com contraparte — sem contraparte a
 * fila não a mostra (`counterparty-queries.ts` exige `counterparty_id`). Por
 * isso linha cuja descrição não rende chave fica como está (`semChave`):
 * pendente e invisível seria pior que confirmada sem par.
 *
 * Idempotente: quem já está pendente com contraparte sai do recorte.
 */
export async function devolverTransferenciasSemParAClassificar(
  db: Db,
  orgId: string,
): Promise<{ devolvidas: number; semChave: number }> {
  const recorte = [
    eq(transactions.orgId, orgId),
    eq(transactions.type, 'transfer'),
    isNull(transactions.transferGroupId),
    isNotNull(transactions.externalId),
    isNull(transactions.transferAccountId),
    condicaoNaoEPernaPrevista(),
    // A ponta real que a conciliação converteu já tem par (a perna prevista
    // aponta para ela), mesmo sem grupo.
    condicaoDeRealizadoSemVinculo(),
  ]

  const linhas = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      description: transactions.description,
      counterpartyTaxId: transactions.counterpartyTaxId,
      counterpartyName: transactions.counterpartyName,
      counterpartyId: transactions.counterpartyId,
    })
    .from(transactions)
    .where(
      and(
        ...recorte,
        // Confirmada (vai voltar) ou pendente sem contraparte (a migração de
        // dados de §3.5 já a pôs pendente, mas invisível na fila).
        or(eq(transactions.reviewState, 'confirmed'), isNull(transactions.counterpartyId)),
      ),
    )

  let index: Map<string, CounterpartyRecord> | null = null
  let devolvidas = 0
  let semChave = 0

  for (const linha of linhas) {
    let counterpartyId = linha.counterpartyId

    if (!counterpartyId) {
      const key = counterpartyKeyFor(linha, linha.accountId)
      if (key) {
        index ??= await loadCounterpartyIndex(db, orgId)
        const record = await acharOuCriarContraparte(db, orgId, key, linha.counterpartyName ?? linha.description, index)
        counterpartyId = record?.id ?? null
      }
    }

    if (!counterpartyId) {
      semChave++
      continue
    }

    // O recorte de novo no UPDATE: se a linha ganhou par entre a leitura e
    // aqui (sync, Classificar, conciliação), fica como está.
    const atualizada = await db
      .update(transactions)
      .set({ counterpartyId, reviewState: 'pending' })
      .where(and(eq(transactions.id, linha.id), ...recorte))
      .returning({ id: transactions.id })

    if (atualizada.length > 0) devolvidas++
  }

  return { devolvidas, semChave }
}
