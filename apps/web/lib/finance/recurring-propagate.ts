import { and, eq } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import { condicoesDeParcelasPendentes } from './recurring-reschedule'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Tipo = 'income' | 'expense'

/**
 * Editar a recorrência muda a série daqui para frente — não só a data.
 *
 * As parcelas pendentes (`condicoesDeParcelasPendentes`: previsão pura, de
 * hoje em diante — as mesmas que a edição da data já move) acompanham
 * categoria, valor, tipo, conta e descrição do modelo. O que o banco já
 * cumpriu, o que já está no saldo e o que foi ignorado fica como está.
 *
 * Antes só a data acompanhava: "TIM internet" ganhou categoria e as parcelas
 * seguiram vazias; "Flavio - Terapia" virou Psicólogo/R$ 3.800 e as parcelas
 * seguiram em Saúde/R$ 2.300 — e a meta Psicólogo nunca via a previsão.
 *
 * Como a tela de edição manda todos os campos, salvar a recorrência sem mudar
 * nada também realinha as parcelas que ficaram para trás antes desta correção.
 */

export interface EdicaoDoModelo {
  categoryId?: string | null
  accountId?: string
  type?: Tipo
  /** Positivo, como no template. */
  amountCents?: number
}

export interface CamposDaParcela {
  categoryId?: string | null
  accountId?: string
  type?: Tipo
  /** Com sinal, como na transação. */
  amountCents?: number
}

/** Só o que a edição trouxe. Valor e tipo andam juntos: um decide o sinal do outro. */
export function camposQueAcompanhamOModelo(
  editado: EdicaoDoModelo,
  atual: { type: Tipo; amountCents: number },
): CamposDaParcela {
  const campos: CamposDaParcela = {}
  if (editado.categoryId !== undefined) campos.categoryId = editado.categoryId
  if (editado.accountId !== undefined) campos.accountId = editado.accountId
  if (editado.type !== undefined || editado.amountCents !== undefined) {
    const type = editado.type ?? atual.type
    const valor = Math.abs(editado.amountCents ?? atual.amountCents)
    campos.type = type
    campos.amountCents = type === 'income' ? valor : -valor
  }
  return campos
}

/** Mesmo formato da criação (`createRecurringTemplate`): "Nome (n/N)" na série. */
export function descricaoDaParcela(base: string, numero: number | null, total: number | null): string {
  return total && total > 1 && numero ? `${base} (${numero}/${total})` : base
}

/** Leva a edição às parcelas pendentes. Devolve quantas mudaram. */
export async function propagarEdicaoParaParcelas(
  tx: Tx,
  params: { orgId: string; templateId: string; hojeStr: string; campos: CamposDaParcela; descricao: string | null },
): Promise<number> {
  const { orgId, templateId, hojeStr, campos, descricao } = params
  const pendentes = await tx
    .select({
      id: transactions.id,
      description: transactions.description,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
    })
    .from(transactions)
    .where(and(...condicoesDeParcelasPendentes(orgId, templateId, hojeStr)))
  if (pendentes.length === 0) return 0

  if (Object.keys(campos).length > 0) {
    await tx
      .update(transactions)
      // Categoria vinda do modelo é escolha do usuário, não palpite de regra.
      .set({ ...campos, ...('categoryId' in campos ? { isAutoCategorized: false } : {}) })
      .where(and(...condicoesDeParcelasPendentes(orgId, templateId, hojeStr)))
  }

  if (descricao !== null) {
    for (const p of pendentes) {
      const nova = descricaoDaParcela(descricao, p.installmentNumber, p.installmentTotal)
      if (nova === p.description) continue
      await tx
        .update(transactions)
        .set({ description: nova })
        .where(and(eq(transactions.id, p.id), eq(transactions.orgId, orgId)))
    }
  }
  return pendentes.length
}
