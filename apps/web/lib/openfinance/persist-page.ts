// apps/web/lib/openfinance/persist-page.ts
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb, accounts, transactions } from '@floow/db'
import { matchCategory, type CategoryRule } from '@floow/core-finance'
import type { ResolvedTransaction } from './resolve-counterparty'
import { isOpenFinanceLinkedAccount, montarPernaDaTransferencia } from './transfer-leg'
import { acharPrevisao, camposDaOcupacao, carregarDiaDeVencimento, dataFinalDaParcela, hojeEmSaoPaulo, ocuparPrevisao } from './parcelas-previstas'

/**
 * Gravação de uma página de transações já normalizadas e resolvidas.
 * Saiu de sync.ts, que estava no limite de 500 linhas.
 */
export type Db = ReturnType<typeof getDb>

/**
 * Soma o delta de saldo por conta de destino, contando só as pernas cujo
 * `balanceApplied` é verdadeiro — a mesma regra que já vale para a perna de
 * origem (`inserted.filter((row) => row.applied)`, algumas linhas abaixo).
 * Extraída para ser testável sem mockar `db`: ver
 * `__tests__/openfinance/sync-persist.test.ts`.
 */
export function sumAppliedDeltasByAccount(
  legs: { accountId: string; amountCents: number; applied: boolean }[],
): Map<string, number> {
  const deltaByAccount = new Map<string, number>()
  for (const leg of legs) {
    if (!leg.applied) continue
    deltaByAccount.set(leg.accountId, (deltaByAccount.get(leg.accountId) ?? 0) + leg.amountCents)
  }
  return deltaByAccount
}

export interface PersistInput {
  orgId: string
  accountId: string
  normalized: ResolvedTransaction[]
  categoryByRef: Map<string, string>
  rules: CategoryRule[]
}

export async function persistPage(
  db: Db,
  input: PersistInput,
): Promise<{ imported: number; updated: number; contasComPernaPrevista: string[] }> {
  if (input.normalized.length === 0) return { imported: 0, updated: 0, contasComPernaPrevista: [] }

  const externalIds = input.normalized.map((t) => t.externalId)

  // Quem já está no banco entra por UPDATE; o resto por INSERT. Separar antes
  // evita o upsert cego, que não diria quais linhas são novas — e sem isso não
  // há como somar o saldo apenas uma vez.
  const existing = await db
    .select({ id: transactions.id, externalId: transactions.externalId })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, input.orgId),
        eq(transactions.accountId, input.accountId),
        inArray(transactions.externalId, externalIds),
      ),
    )

  const existingByExternalId = new Map(existing.map((row) => [row.externalId, row.id]))
  // Corte do dia em São Paulo, não no fuso do servidor.
  const hoje = hojeEmSaoPaulo()

  const toInsert: (typeof transactions.$inferInsert)[] = []
  const transferLegsToInsert: (typeof transactions.$inferInsert)[] = []
  const linkedAccountCache = new Map<string, boolean>()
  // Contas onde nasceu perna prevista nesta página: o sync propõe a
  // conciliação nelas também, porque a ponta real pode já ter chegado.
  const contasComPernaPrevista = new Set<string>()
  let updated = 0

  // Só busca no banco quando a página tem parcela sem fatura fechada — é a
  // única situação em que o dia de vencimento importa (`dataFinalDaParcela`).
  const precisaDoDia = input.normalized.some((t) => t.purchaseDate && !t.billPostDate)
  const diaDeVencimento = precisaDoDia ? await carregarDiaDeVencimento(db, input.orgId, input.accountId) : null

  for (const tx of input.normalized) {
    // Contraparte (Nível 2) decide sozinha, confirmada ou pendente — nos dois
    // casos `tx.categoryId` já é a resposta final e não pode ser sobrescrita
    // por `category_rules`. Sem contraparte (Nível 1), a categorização
    // continua exatamente como antes desta mudança.
    const categoryId =
      tx.counterpartyId !== null
        ? tx.categoryId
        : (matchCategory(tx.description, input.rules) ??
           (tx.categoryRef ? (input.categoryByRef.get(tx.categoryRef) ?? null) : null))

    const dataFinal = dataFinalDaParcela(tx, diaDeVencimento)
    const date = new Date(`${dataFinal}T12:00:00Z`)
    const purchaseDate = tx.purchaseDate ? new Date(`${tx.purchaseDate}T12:00:00Z`) : null
    const existingId = existingByExternalId.get(tx.externalId)

    if (existingId) {
      // Só o enriquecimento é atualizado. Valor e tipo ficam como entraram:
      // mexer neles depois exigiria desfazer o efeito no saldo, e errar isso
      // deixa o saldo errado em silêncio, que é o pior desfecho possível num
      // app de finanças. A data é a única exceção, e só muda enquanto a
      // linha está fora do saldo (ver o CASE WHEN abaixo).
      await db
        .update(transactions)
        .set({
          description: tx.description,
          categoryRef: tx.categoryRef,
          polpType: tx.polpType,
          payeeMcc: tx.payeeMcc,
          billPostDate: tx.billPostDate ? new Date(`${tx.billPostDate}T12:00:00Z`) : null,
          billForecastMonth: tx.billForecastMonth,
          installmentNumber: tx.installmentNumber,
          installmentTotal: tx.installmentTotal,
          purchaseDate,
          // A data só corrige enquanto a linha está fora do saldo — uma vez
          // aplicada, mexer nela exigiria desfazer o efeito já contado.
          date: sql`CASE WHEN ${transactions.balanceApplied} THEN ${transactions.date} ELSE ${dataFinal}::date END`,
          // Categoria manual do usuário nunca é sobrescrita (mesma regra da
          // v1.1), e transferência nunca tem categoria — inclusive a ponta
          // real que a conciliação converteu em transferência.
          ...(categoryId
            ? { categoryId: sql`CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.categoryId} ELSE COALESCE(${transactions.categoryId}, ${categoryId}) END` }
            : {}),
        })
        // O id ja veio de uma consulta filtrada por org; repetir o filtro aqui
        // e defesa em profundidade — no caminho do app o RLS nao vale, porque a
        // conexao usa o role dono do banco.
        .where(and(eq(transactions.id, existingId), eq(transactions.orgId, input.orgId)))

      updated++
      continue
    }

    // Parcela real que casa com uma previsão já gravada ocupa a linha dela
    // em vez de inserir duplicada — a previsão nunca esteve no saldo, então
    // só a real (se já venceu) soma. `ocuparPrevisao` só ocupa se a linha
    // ainda for previsão aberta; se outro sync ganhou a corrida primeiro,
    // cai para o insert normal, que o índice único (external_id, account_id)
    // protege contra duplicar.
    if (tx.purchaseDate && tx.installmentTotal && tx.installmentNumber) {
      const previsaoId = await acharPrevisao(db, input.orgId, input.accountId, {
        purchaseDate: tx.purchaseDate,
        installmentTotal: tx.installmentTotal,
        installmentNumber: tx.installmentNumber,
        amountCents: tx.amountCents,
      })
      if (previsaoId) {
        const campos = camposDaOcupacao(
          { externalId: tx.externalId, amountCents: tx.amountCents, description: tx.description, date: dataFinal, categoryId },
          new Date(),
        )
        const ocupou = await ocuparPrevisao(db, {
          orgId: input.orgId,
          accountId: input.accountId,
          previsaoId,
          campos,
          extras: {
            billPostDate: tx.billPostDate ? new Date(`${tx.billPostDate}T12:00:00Z`) : null,
            billForecastMonth: tx.billForecastMonth,
            categoryRef: tx.categoryRef,
            payeeMcc: tx.payeeMcc,
            type: tx.type,
            reviewState: tx.reviewState,
            counterpartyId: tx.counterpartyId,
            counterpartyTaxId: tx.counterpartyTaxId,
            counterpartyName: tx.counterpartyName,
            polpType: tx.polpType,
            isAutoCategorized: categoryId !== null,
          },
        })
        if (ocupou) {
          updated++
          continue
        }
      }
    }

    // Lançamento agendado ainda não aconteceu: entra para o usuário ver, mas
    // fora das somas, senão vira gasto que ninguém fez.
    const isScheduled = tx.settlement === 'scheduled'
    const applied = !isScheduled && dataFinal <= hoje

    let transferGroupId: string | null = null
    if (tx.reviewState === 'confirmed' && tx.type === 'transfer' && tx.transferAccountId) {
      let linked = linkedAccountCache.get(tx.transferAccountId)
      if (linked === undefined) {
        linked = await isOpenFinanceLinkedAccount(db, input.orgId, tx.transferAccountId)
        linkedAccountCache.set(tx.transferAccountId, linked)
      }
      transferGroupId = crypto.randomUUID()
      transferLegsToInsert.push(
        montarPernaDaTransferencia({
          source: { orgId: input.orgId, amountCents: tx.amountCents, date, externalId: tx.externalId, balanceApplied: applied },
          sourceAccountId: input.accountId,
          otherAccountId: tx.transferAccountId,
          transferGroupId,
          destinoOpenFinance: linked,
        }),
      )
      if (linked) contasComPernaPrevista.add(tx.transferAccountId)
    }

    toInsert.push({
      orgId: input.orgId,
      accountId: input.accountId,
      categoryId,
      type: tx.type,
      amountCents: tx.amountCents,
      description: tx.description,
      date,
      externalId: tx.externalId,
      importedAt: new Date(),
      isAutoCategorized: categoryId !== null,
      isIgnored: isScheduled,
      balanceApplied: applied,
      categoryRef: tx.categoryRef,
      polpType: tx.polpType,
      payeeMcc: tx.payeeMcc,
      billPostDate: tx.billPostDate ? new Date(`${tx.billPostDate}T12:00:00Z`) : null,
      billForecastMonth: tx.billForecastMonth,
      installmentNumber: tx.installmentNumber,
      installmentTotal: tx.installmentTotal,
      purchaseDate,
      counterpartyId: tx.counterpartyId,
      counterpartyTaxId: tx.counterpartyTaxId,
      counterpartyName: tx.counterpartyName,
      reviewState: tx.reviewState,
      transferGroupId,
      transferAccountId: tx.transferAccountId ?? null,
    })
  }

  if (toInsert.length === 0) return { imported: 0, updated, contasComPernaPrevista: [...contasComPernaPrevista] }

  const imported = await db.transaction(async (dbTx) => {
    // O índice único (external_id, account_id) é a rede: se dois syncs
    // correrem juntos, o segundo não duplica.
    const inserted = await dbTx
      .insert(transactions)
      .values(toInsert)
      .onConflictDoNothing()
      .returning({ id: transactions.id, amountCents: transactions.amountCents, applied: transactions.balanceApplied })

    // Só o que entrou de fato move o saldo — o que colidiu já estava contado.
    const realDelta = inserted
      .filter((row) => row.applied)
      .reduce((sum, row) => sum + row.amountCents, 0)

    if (realDelta !== 0) {
      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${realDelta}` })
        .where(eq(accounts.id, input.accountId))
    }

    if (transferLegsToInsert.length > 0) {
      const insertedLegs = await dbTx
        .insert(transactions)
        .values(transferLegsToInsert)
        .onConflictDoNothing()
        .returning({
          accountId: transactions.accountId,
          amountCents: transactions.amountCents,
          applied: transactions.balanceApplied,
        })

      // Só a perna cujo `balanceApplied` é verdadeiro move o saldo — uma
      // origem agendada/futura já entra com `balanceApplied: false` em
      // `buildTransferLegRow`, e sem este filtro o destino seria creditado
      // antes da hora.
      const deltaByAccount = sumAppliedDeltasByAccount(insertedLegs)
      for (const [destAccountId, delta] of deltaByAccount) {
        if (delta === 0) continue
        await dbTx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${delta}` })
          .where(eq(accounts.id, destAccountId))
      }
    }

    return inserted.length
  })

  // `imported` conta o que entrou de fato: `onConflictDoNothing` descarta em
  // silencio o que outro sync ja tinha gravado.
  return { imported, updated, contasComPernaPrevista: [...contasComPernaPrevista] }
}
