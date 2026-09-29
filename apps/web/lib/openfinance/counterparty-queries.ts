import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { transactions, counterparties, accounts } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { condicaoForaDeParDeTransferenciaPendente } from '@/lib/finance/forecast-match-db'
import { carregarHashesDoTitular, ehCpfProprio } from '@/lib/openfinance/cpf-proprio'
import { carregarCandidatosDePar, sugerirContaDoPar } from '@/lib/openfinance/sugestao-par'

export interface PendingGroupItem {
  id: string
  date: string
  description: string
  amountCents: number
  /**
   * Em que conta este lançamento está.
   *
   * Viaja para a tela porque o seletor de conta de destino da transferência
   * precisa saber: escolher a própria conta do lançamento é o que o servidor
   * recusa em `applyTransferSingle`, e sem este campo o aviso só podia vir
   * depois de o lote já ter sido enviado.
   */
  accountId: string
  /**
   * Natureza com que o lançamento está gravado. Quando o próprio banco já
   * disse que é transferência (aplicação, resgate, fatura), a fila abre com
   * Transferência escolhida e só pede a conta.
   */
  type?: 'income' | 'expense' | 'transfer'
  /** CPF próprio: a conta do outro lado, se o par foi achado sem ambiguidade. */
  sugestaoContaId: string | null
  /**
   * O que o extrato trouxe além da descrição, para conciliar: meio (`polp_type`
   * cru), cartão e parcela. Opcionais porque lançamento manual não tem.
   */
  polpType?: string | null
  cardLastDigits?: string | null
  installmentNumber?: number | null
  installmentTotal?: number | null
}

export interface PendingGroup {
  counterpartyId: string
  displayName: string
  keyType: 'tax_id' | 'description'
  count: number
  totalCents: number
  items: PendingGroupItem[]
  /** Pix para o próprio CPF: a conta é escolhida por lançamento, nunca pelo grupo. */
  ehCpfProprio: boolean
  /** Categoria que a fila abre pré-selecionada (histórico ou Claude, 00061). */
  suggestedCategoryId?: string | null
  suggestionSource?: 'historico' | 'claude' | null
}

/**
 * Quantos lançamentos esperam classificação.
 *
 * Mesma condição da fila (`getPendingCounterpartyGroups`): `review_state =
 * 'pending'` com contraparte já identificada. Contador que anuncia o que a
 * tela não mostra manda o usuário procurar decisão que não existe.
 *
 * Conta LANÇAMENTOS, não contrapartes: é o número que o usuário vê na lista.
 * A fila agrupa por contraparte para decidir de uma vez, mas isso é detalhe
 * da tela de lá.
 */
export async function contarLancamentosAClassificar(orgId: string): Promise<number> {
  return withUserDb(async (db) => {
    const [row] = await db
      .select({ total: count() })
      .from(transactions)
      .where(and(
        eq(transactions.orgId, orgId),
        eq(transactions.reviewState, 'pending'),
        isNotNull(transactions.counterpartyId),
        // Ponta com par de transferência pendente decide-se em Confirmar previsões.
        condicaoForaDeParDeTransferenciaPendente(),
      ))

    return Number(row?.total ?? 0)
  })
}

/**
 * Contrapartes pendentes da org, com os lançamentos por trás de cada uma.
 * Ordenada por dinheiro — o mesmo princípio que o detector antigo já validou:
 * "R$ 92 mil" move o usuário, "12 lançamentos" não.
 */
export async function getPendingCounterpartyGroups(orgId: string): Promise<PendingGroup[]> {
  return withUserDb(async (db) => {

    const rows = await db
      .select({
        counterpartyId: transactions.counterpartyId,
        displayName: counterparties.displayName,
        keyType: counterparties.keyType,
        keyValue: counterparties.keyValue,
        suggestedCategoryId: counterparties.suggestedCategoryId,
        suggestionSource: counterparties.suggestionSource,
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amountCents: transactions.amountCents,
        accountId: transactions.accountId,
        type: transactions.type,
        polpType: transactions.polpType,
        cardLastDigits: transactions.cardLastDigits,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
      })
      .from(transactions)
      .innerJoin(counterparties, eq(counterparties.id, transactions.counterpartyId))
      .where(and(
        eq(transactions.orgId, orgId),
        eq(transactions.reviewState, 'pending'),
        // Ponta com par de transferência pendente decide-se em Confirmar previsões.
        condicaoForaDeParDeTransferenciaPendente(),
      ))
      .orderBy(transactions.date)

    const groups = new Map<string, PendingGroup>()
    for (const row of rows) {
      if (!row.counterpartyId) continue
      let group = groups.get(row.counterpartyId)
      if (!group) {
        group = {
          counterpartyId: row.counterpartyId,
          displayName: row.displayName,
          keyType: row.keyType,
          count: 0,
          totalCents: 0,
          items: [],
          ehCpfProprio: false,
          suggestedCategoryId: row.suggestedCategoryId,
          suggestionSource: row.suggestionSource,
        }
        groups.set(row.counterpartyId, group)
      }
      group.count++
      group.totalCents += row.amountCents
      group.items.push({
        id: row.id,
        date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
        description: row.description,
        amountCents: row.amountCents,
        accountId: row.accountId,
        type: row.type,
        sugestaoContaId: null,
        polpType: row.polpType,
        cardLastDigits: row.cardLastDigits,
        installmentNumber: row.installmentNumber,
        installmentTotal: row.installmentTotal,
      })
    }

    // Pix para o próprio CPF: a conta certa é a do lançamento espelhado, nunca
    // uma regra fixa por contraparte (spec §6) — por isso a sugestão é
    // preenchida por lançamento, depois de os grupos já estarem montados.
    const hashes = await carregarHashesDoTitular(db, orgId)
    const chaves = new Map(rows.map((r) => [r.counterpartyId, { keyType: r.keyType, keyValue: r.keyValue }]))
    const doTitular = [...groups.values()].filter((g) => {
      const k = chaves.get(g.counterpartyId)
      return k?.keyType === 'tax_id' && ehCpfProprio(k.keyValue, hashes)
    })
    const itensDoTitular = doTitular.flatMap((g) => g.items)
    const candidatos = await carregarCandidatosDePar(db, orgId, itensDoTitular)
    for (const g of doTitular) {
      g.ehCpfProprio = true
      for (const item of g.items) item.sugestaoContaId = sugerirContaDoPar(item, candidatos)
    }

    return [...groups.values()].sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
  })
}

export interface ConfirmedCounterparty {
  id: string
  displayName: string
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  transferAccountId: string | null
  transferAccountName: string | null
  confirmedAt: string
  keyType: 'tax_id' | 'description'
  direction: 'in' | 'out'
  /** CPF próprio: nunca devia ter virado regra de conta fixa (spec §6). */
  ehCpfProprio: boolean
  /** Conta onde a regra vale (regra por descrição); a transferência não pode ir para ela. */
  accountId: string | null
}

/**
 * Contrapartes já confirmadas, para a aba editável da fila.
 *
 * `keyValue` (CPF/CNPJ ou descrição crua) fica só nesta função — não sai daqui
 * para o cliente, só o booleano `ehCpfProprio` derivado dele.
 */
export async function getConfirmedCounterparties(orgId: string): Promise<ConfirmedCounterparty[]> {
  return withUserDb(async (db) => {
    const rows = await db
      .select({
        id: counterparties.id,
        displayName: counterparties.displayName,
        nature: counterparties.nature,
        categoryId: counterparties.categoryId,
        transferAccountId: counterparties.transferAccountId,
        transferAccountName: accounts.name,
        confirmedAt: counterparties.confirmedAt,
        keyType: counterparties.keyType,
        keyValue: counterparties.keyValue,
        direction: counterparties.direction,
        accountId: counterparties.accountId,
      })
      .from(counterparties)
      .leftJoin(accounts, eq(accounts.id, counterparties.transferAccountId))
      .where(and(eq(counterparties.orgId, orgId), sql`${counterparties.confirmedAt} is not null`))
      .orderBy(desc(counterparties.confirmedAt))

    const hashes = await carregarHashesDoTitular(db, orgId)

    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      nature: row.nature!,
      categoryId: row.categoryId,
      transferAccountId: row.transferAccountId,
      transferAccountName: row.transferAccountName,
      confirmedAt: row.confirmedAt!.toISOString(),
      keyType: row.keyType,
      direction: row.direction,
      ehCpfProprio: row.keyType === 'tax_id' && ehCpfProprio(row.keyValue, hashes),
      accountId: row.accountId ?? null,
    }))
  })
}
