import { getDb, duplicateProposals, transactions } from '@floow/db'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { detectarDuplicatas, type LancamentoParaDedupe } from '@floow/core-finance'

type Db = ReturnType<typeof getDb>

/**
 * Propõe os pares que a fonte entregou duas vezes.
 *
 * Roda depois da importação, no mesmo ponto de `criarPropostasDeConciliacao`:
 * o par só existe depois que as duas linhas entraram.
 *
 * Propõe, nunca apaga. Compras repetidas legítimas — "Westwing" cinco vezes no
 * mesmo dia, mesmo valor — são indistinguíveis de duplicata para qualquer
 * heurística, e quem sabe a diferença é o dono da conta. Esta função leva o
 * sinal até a fila; a decisão é de quem tem o extrato na mão.
 *
 * Ver `@floow/core-finance` → `duplicata.ts` para o sinal em si.
 */
export async function criarPropostasDeDuplicata(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<number> {
  // Só linha que já tem irmã de mesma data e valor chega ao detector: o resto
  // não tem como formar par, e varrer a conta inteira em memória seria
  // desperdício numa tabela que cresce todo mês.
  const temIrma = sql`EXISTS (
    SELECT 1 FROM transactions AS irma
    WHERE irma.account_id = ${transactions.accountId}
      AND irma.id <> ${transactions.id}
      AND irma.date = ${transactions.date}
      AND irma.amount_cents = ${transactions.amountCents}
      AND irma.external_id IS NOT NULL
      AND irma.is_ignored = false
  )`

  const candidatos = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      installmentNumber: transactions.installmentNumber,
      purchaseDate: transactions.purchaseDate,
      counterpartyTaxId: transactions.counterpartyTaxId,
      externalId: transactions.externalId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        isNotNull(transactions.externalId),
        // Já ignorado não volta para a fila: ou o usuário já decidiu por ele,
        // ou é agendado que ainda não aconteceu.
        eq(transactions.isIgnored, false),
        temIrma,
      ),
    )

  if (candidatos.length === 0) return 0

  // Agrupa antes de comparar. Sem isso o detector receberia a conta inteira e
  // gastaria comparação em linhas que nunca poderiam formar par.
  const porGrupo = new Map<string, LancamentoParaDedupe[]>()
  for (const c of candidatos) {
    if (c.externalId === null) continue
    const dateISO = c.date.toISOString().slice(0, 10)
    const chave = `${dateISO}|${c.amountCents}`
    const linha: LancamentoParaDedupe = {
      id: c.id,
      dateISO,
      amountCents: c.amountCents,
      installmentNumber: c.installmentNumber,
      purchaseDate: c.purchaseDate ? c.purchaseDate.toISOString().slice(0, 10) : null,
      counterpartyTaxId: c.counterpartyTaxId,
      externalId: c.externalId,
    }
    const grupo = porGrupo.get(chave)
    if (grupo) grupo.push(linha)
    else porGrupo.set(chave, [linha])
  }

  let criadas = 0
  for (const grupo of porGrupo.values()) {
    if (grupo.length < 2) continue

    for (const par of detectarDuplicatas(grupo)) {
      const inserida = await db
        .insert(duplicateProposals)
        .values({
          orgId,
          manterTransactionId: par.manterId,
          duplicataTransactionId: par.duplicataId,
          minutosEntreEmissoes: Math.round(par.minutosEntreEmissoes),
          status: 'pending',
        })
        .onConflictDoNothing()
        .returning({ id: duplicateProposals.id })

      // Só conta o que o banco aceitou: `uq_dp_par` devolve vazio para o par
      // já decidido, e contá-lo faria o sync anunciar fila que não existe.
      if (inserida.length > 0) criadas++
    }
  }

  return criadas
}
