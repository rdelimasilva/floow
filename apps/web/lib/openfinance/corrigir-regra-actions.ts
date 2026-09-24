'use server'

import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getDb, counterparties } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { assertAccountOwnership } from '@/lib/finance/account-actions'
import { requireIdentity } from '@/lib/auth/session'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'
import { aplicarDecisaoAosPendentes, contaQueARegraGrava, ehRegraDoTitular } from './aplicar-regra'
import { analisarPar, desfazerParDaRegra } from './desfazer-par'
import { selecionarLancamentosDaRegra, somarPrevia, type PreviaCorrecao } from './previa-correcao'
import { isOpenFinanceLinkedAccount } from './transfer-leg'

/**
 * Corrige uma regra já confirmada (spec 2026-09-24-corrigir-regra-contraparte).
 * Só daqui pra frente: muda a linha de `counterparties`, e o sync lê a regra
 * nova. Com histórico: desfaz o que a regra antiga classificou e reaplica a
 * nova, tudo na mesma transação.
 */

type Db = ReturnType<typeof getDb>

const decisaoSchema = z
  .object({
    counterpartyId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    transferAccountId: z.string().uuid().nullable(),
  })
  .refine((v) => (v.nature === 'transfer' ? v.categoryId === null : v.categoryId !== null && v.transferAccountId === null), {
    message: 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.',
  })

export type DecisaoNova = z.infer<typeof decisaoSchema>

async function lerRegra(tx: Pick<Db, 'select'>, orgId: string, id: string) {
  const [regra] = await tx
    .select({
      id: counterparties.id,
      nature: counterparties.nature,
      categoryId: counterparties.categoryId,
      transferAccountId: counterparties.transferAccountId,
      keyType: counterparties.keyType,
      keyValue: counterparties.keyValue,
      confirmedAt: counterparties.confirmedAt,
    })
    .from(counterparties)
    .where(and(eq(counterparties.id, id), eq(counterparties.orgId, orgId)))
    .limit(1)
  if (!regra || !regra.confirmedAt) throw new Error('Regra não encontrada.')
  return regra
}

/** A conta nova, quando é manual: só nela a reaplicação move saldo. */
async function contaManualNova(tx: Db, orgId: string, conta: string | null): Promise<string | null> {
  if (!conta) return null
  return (await isOpenFinanceLinkedAccount(tx, orgId, conta)) ? null : conta
}

export async function previaCorrecaoDeRegra(raw: DecisaoNova): Promise<PreviaCorrecao> {
  const input = decisaoSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()
  const regra = await lerRegra(db, orgId, input.counterpartyId)
  const cpfProprio = await ehRegraDoTitular(db, orgId, regra)
  const conta = contaQueARegraGrava({ nature: input.nature, transferAccountId: input.transferAccountId, cpfProprio })
  const linhas = await selecionarLancamentosDaRegra(db, orgId, regra)
  const analises = []
  for (const l of linhas) {
    const a = await analisarPar(db, orgId, l)
    analises.push({ l, forma: a.forma, estorno: a.estorno })
  }
  return somarPrevia(analises, await contaManualNova(db, orgId, conta))
}

export async function corrigirRegra(
  raw: DecisaoNova & { aplicarAoHistorico: boolean },
): Promise<{ reprocessados: number; ignorados: number }> {
  const { aplicarAoHistorico, ...resto } = raw
  const input = decisaoSchema.parse(resto)
  const orgId = await getOrgId()
  const db = getDb()
  const { userId } = await requireIdentity()
  const contasParaConciliar = new Set<string>()

  const resultado = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db
    const regra = await lerRegra(tx, orgId, input.counterpartyId)
    const cpfProprio = await ehRegraDoTitular(tx, orgId, regra)
    const conta = contaQueARegraGrava({ nature: input.nature, transferAccountId: input.transferAccountId, cpfProprio })
    if (conta) await assertAccountOwnership(tx, conta, orgId)

    let reprocessados = 0
    let ignorados = 0
    const desfeitos: string[] = []
    const devolvidos = new Set<string>()
    if (aplicarAoHistorico) {
      for (const l of await selecionarLancamentosDaRegra(tx, orgId, regra)) {
        const r = await desfazerParDaRegra(tx, orgId, l)
        if (r.forma === 'par-do-outro-lado') {
          ignorados++
          continue
        }
        reprocessados++
        desfeitos.push(l.id)
        if (r.realizadoDevolvidoId) devolvidos.add(r.realizadoDevolvidoId)
      }
    }

    await tx
      .update(counterparties)
      .set({
        nature: input.nature,
        categoryId: input.categoryId,
        transferAccountId: conta,
        confirmedAt: new Date(),
        confirmedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))

    if (aplicarAoHistorico) {
      // CPF próprio: `conta` é null, o lote não roda e os lançamentos ficam
      // pendentes em Classificar, onde a conta é escolhida um a um.
      // Só o que foi desfeito aqui é reaplicado; o realizado devolvido pela
      // forma 2 fica em Classificar, como a prévia mostrou.
      await aplicarDecisaoAosPendentes(
        tx,
        orgId,
        { counterpartyId: input.counterpartyId, nature: input.nature, categoryId: input.categoryId, transferAccountId: conta, exceptions: [] },
        contasParaConciliar,
        desfeitos.filter((id) => !devolvidos.has(id)),
      )
    }
    return { reprocessados, ignorados }
  })

  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)
  for (const c of contasParaConciliar) {
    try {
      await criarPropostasDeConciliacao(db, orgId, c)
    } catch (error) {
      console.error('[corrigirRegra] falha ao propor conciliacao:', error)
    }
  }
  revalidateTransactionData(orgId)
  return resultado
}
