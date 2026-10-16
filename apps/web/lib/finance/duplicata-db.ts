import { getDb, duplicateProposals, transactions } from '@floow/db'
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { detectarDuplicatas, type LancamentoParaDedupe, type ParDuplicado } from '@floow/core-finance'
import { efetivarDuplicata } from './efetivar-duplicata'

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
 * A exceção é certeza, não heurística: as duas versões da mesma compra no
 * cartão (`mesmaCompra`, mesmo instante no segundo, uma com fatura fechada e
 * a outra sem). A cópia sai na hora e a proposta fica registrada como
 * aprovada — inclusive a que foi recusada por engano: em setembro/2026 três
 * recusas deixaram R$ 221,18 em dobro no Visa.
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
      AND irma.aguarda_extrato = false
  )`

  const candidatos = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      installmentNumber: transactions.installmentNumber,
      purchaseDate: transactions.purchaseDate,
      counterpartyTaxId: transactions.counterpartyTaxId,
      billId: transactions.billId,
      externalId: transactions.externalId,
      ocorridoEm: transactions.ocorridoEm,
      cardLastDigits: transactions.cardLastDigits,
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
        // R2 é extrato × extrato. A linha que aguarda o extrato (ou que ele já
        // absorveu) é assunto de R1, nunca duplicata.
        eq(transactions.aguardaExtrato, false),
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
      billId: c.billId ?? null,
      externalId: c.externalId,
      ocorridoEm: c.ocorridoEm ? c.ocorridoEm.toISOString() : null,
      cardLastDigits: c.cardLastDigits ?? null,
    }
    const grupo = porGrupo.get(chave)
    if (grupo) grupo.push(linha)
    else porGrupo.set(chave, [linha])
  }

  let criadas = 0
  for (const grupo of porGrupo.values()) {
    if (grupo.length < 2) continue

    for (const par of detectarDuplicatas(grupo)) {
      if (par.mesmaCompra) {
        await resolverMesmaCompra(db, orgId, par)
        continue
      }
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

/** A cópia certa sai das somas e a proposta fica aprovada, sem passar pela fila. */
async function resolverMesmaCompra(db: Db, orgId: string, par: ParDuplicado): Promise<void> {
  await efetivarDuplicata(db, orgId, par.duplicataId)
  const agora = new Date()
  const [nova] = await db
    .insert(duplicateProposals)
    .values({
      orgId,
      manterTransactionId: par.manterId,
      duplicataTransactionId: par.duplicataId,
      minutosEntreEmissoes: Math.round(par.minutosEntreEmissoes),
      status: 'approved',
      decidedAt: agora,
    })
    .onConflictDoNothing()
    .returning({ id: duplicateProposals.id })
  if (nova) return
  // Já havia proposta do par (pendente, ou recusada por engano).
  await db
    .update(duplicateProposals)
    .set({ status: 'approved', decidedAt: agora })
    .where(and(
      eq(duplicateProposals.orgId, orgId),
      eq(duplicateProposals.manterTransactionId, par.manterId),
      eq(duplicateProposals.duplicataTransactionId, par.duplicataId),
      ne(duplicateProposals.status, 'approved'),
    ))
}
