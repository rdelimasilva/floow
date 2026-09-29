import { sql } from 'drizzle-orm'
import type { getDb } from '@floow/db'
import type { ParConciliado } from '@floow/core-finance'
import { criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'
import { criarPropostasDeDuplicata } from '@/lib/finance/duplicata-db'
import { isOpenFinanceLinkedAccount } from '@/lib/openfinance/transfer-leg'
import { inicioDoExtrato, reclassificarConta } from './reclassificar-conta'
import { aplicarR1 } from './r1-db'
import { corteDeSincronizacao } from './aguarda-extrato'

type Db = ReturnType<typeof getDb>

/**
 * O motor de conciliação: um lugar só decide.
 *
 * Numa conta Open Finance, só o extrato daquela conta move o saldo. Todo
 * caminho que grava numa conta OF chama isto no fim — sync, importação de
 * arquivo, lançamento manual, criação de perna. Caminho novo de entrada chama
 * o motor; não traz regra de dedupe própria.
 *
 * Em ordem, sob `pg_advisory_xact_lock` da conta (dois syncs simultâneos não
 * absorvem a mesma linha duas vezes — o mesmo padrão de `completarParcelas`):
 *  0. reclassifica o que ainda conta no saldo sem ser extrato (idempotente);
 *  1. R1 — extrato × aguardando: absorve o par único, propõe o ambíguo;
 *  2. R2 — extrato × extrato: duplicata reemitida pela fonte, proposta;
 *  3. R3 — previsão de recorrência × extrato, proposta.
 * R1 antes de R3: o extrato absorvido por uma perna não pode ser proposto
 * também contra uma recorrência.
 *
 * Tudo na mesma transação: uma falha desfaz a passada inteira e a próxima
 * tenta de novo, sem meio caminho gravado.
 *
 * Ver docs/superpowers/specs/2026-09-28-conciliacao-unica-design.md §3.3
 */
export interface ResumoDaConciliacao {
  reclassificadas: number
  estornoCents: number
  absorvidas: ParConciliado[]
  propostasDeConciliacao: number
  propostasDeDuplicata: number
}

function resumoVazio(): ResumoDaConciliacao {
  return { reclassificadas: 0, estornoCents: 0, absorvidas: [], propostasDeConciliacao: 0, propostasDeDuplicata: 0 }
}

export async function conciliarConta(db: Db, orgId: string, accountId: string): Promise<ResumoDaConciliacao> {
  // Conta manual: tudo como hoje (spec §4). Uma fonte só para "conta OF viva".
  if (!(await isOpenFinanceLinkedAccount(db, orgId, accountId))) return resumoVazio()
  const syncFromDate = await corteDeSincronizacao(db, orgId, accountId)

  return db.transaction(async (transacao) => {
    const tx = transacao as unknown as Db
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`conciliar-conta:${accountId}`}))`)

    const desde = await inicioDoExtrato(tx, orgId, accountId, syncFromDate)
    const reclassificacao = desde
      ? await reclassificarConta(tx, orgId, accountId, desde)
      : { reclassificadas: 0, estornoCents: 0 }

    const r1 = await aplicarR1(tx, orgId, accountId)
    const propostasDeDuplicata = await criarPropostasDeDuplicata(tx, orgId, accountId)
    const propostasR3 = await criarPropostasDeConciliacao(tx, orgId, accountId)

    return {
      ...reclassificacao,
      absorvidas: r1.absorvidas,
      propostasDeConciliacao: r1.propostas + propostasR3,
      propostasDeDuplicata,
    }
  })
}

/**
 * O motor em várias contas, para quem acabou de gravar. Nunca lança: o dado
 * já entrou, e a próxima passada concilia. Falhar aqui não pode desfazer a
 * ação do usuário nem derrubar o sync.
 */
export async function conciliarContas(
  db: Db,
  orgId: string,
  contas: Iterable<string>,
  rotulo: string,
): Promise<ResumoDaConciliacao> {
  const total = resumoVazio()
  for (const conta of new Set(contas)) {
    try {
      const r = await conciliarConta(db, orgId, conta)
      total.reclassificadas += r.reclassificadas
      total.estornoCents += r.estornoCents
      total.absorvidas.push(...r.absorvidas)
      total.propostasDeConciliacao += r.propostasDeConciliacao
      total.propostasDeDuplicata += r.propostasDeDuplicata
    } catch (error) {
      console.error(`${rotulo} falha ao conciliar a conta ${conta}:`, error)
    }
  }
  return total
}
