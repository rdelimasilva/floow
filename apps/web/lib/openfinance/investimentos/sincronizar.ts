/**
 * Ingestão de investimentos de uma conexão.
 *
 * Duas passadas por tipo: a listagem por consentimento (que já traz a
 * posição — a rota de detalhe, limitada a 30 req/min, nunca é usada) e as
 * movimentações de cada investimento. Falha é isolada no menor pedaço
 * possível: um tipo fora do ar não derruba os outros, um item ilegível não
 * derruba a página. Tudo que não entrou vira problema com payload cru.
 *
 * D3 da spec: nada aqui cria lançamento. O dinheiro já chega pelo extrato.
 */
import {
  POLP_INVESTMENT_KINDS, normalizeInvestment, normalizeInvestmentTransaction,
  type PolpClient, type PolpInvestmentKind,
} from '@floow/core-finance'
import { normalizeBatch } from '../normalize-batch'
import type { ProblemaDeIngestao, RepositorioDeInvestimentos } from './repositorio'
import { janelaDeMovimentacoes } from './vinculo'

export interface ResumoDeInvestimentos {
  ativos: number
  posicoes: number
  movimentacoes: number
  conflitos: number
  rejeitados: number
  /** Ativos da conexão que sumiram da listagem e tiveram a posição zerada. */
  zerados: number
  tiposComFalha: PolpInvestmentKind[]
}

export async function sincronizarInvestimentos(
  repo: RepositorioDeInvestimentos,
  client: Pick<PolpClient, 'streamInvestments' | 'streamInvestmentTransactions'>,
  conexao: { id: string; orgId: string; polpConsentId: string; institutionName: string | null; products: string[] },
  hoje: string = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
): Promise<ResumoDeInvestimentos> {
  const resumo: ResumoDeInvestimentos = { ativos: 0, posicoes: 0, movimentacoes: 0, conflitos: 0, rejeitados: 0, zerados: 0, tiposComFalha: [] }
  if (!conexao.products.includes('INVESTMENTS')) return resumo

  const { orgId } = conexao
  const accountId = await repo.garantirConta(conexao)
  const problemas: ProblemaDeIngestao[] = []
  const salvos: Array<{ kind: PolpInvestmentKind; polpId: string; assetId: string; resourceId: string }> = []

  for (const kind of POLP_INVESTMENT_KINDS) {
    // O que a listagem devolveu deste tipo — ilegível com id também conta.
    const vistos: string[] = []
    let temIlegivelSemId = false
    try {
      for await (const page of client.streamInvestments(conexao.polpConsentId, kind)) {
        const { ok, rejected } = normalizeBatch(page, (raw) => normalizeInvestment(kind, raw))
        resumo.rejeitados += rejected.length
        for (const r of rejected) {
          if (r.externalId) vistos.push(r.externalId)
          else temIlegivelSemId = true
        }
        problemas.push(...rejected.map((r) => ({ resourceId: null, externalId: r.externalId, reason: `${kind}: ${r.reason}`, payload: r.raw })))

        for (const inv of ok) {
          vistos.push(inv.polpId)
          const salvo = await repo.salvarInvestimento({ orgId, connectionId: conexao.id }, inv)
          if (salvo.tipo === 'conflito') {
            resumo.conflitos++
            problemas.push({ resourceId: null, externalId: inv.polpId, reason: `${kind}: investimento pertence a outra org`, payload: { polpId: inv.polpId } })
            continue
          }
          resumo.ativos++
          if (inv.position) resumo.posicoes++
          salvos.push({ kind, polpId: inv.polpId, assetId: salvo.assetId, resourceId: salvo.resourceId })
        }
      }
    } catch (error) {
      resumo.tiposComFalha.push(kind)
      problemas.push({ resourceId: null, externalId: null, reason: `falha ao listar ${kind}: ${mensagem(error)}`, payload: {} })
      continue
    }

    // Resgatado por inteiro some da listagem: sem isto o valor antigo ficaria
    // na tela para sempre. Só com a listagem do tipo completa — tipo que falhou
    // ou item ilegível sem id não dizem quem sumiu de verdade.
    if (!temIlegivelSemId) {
      resumo.zerados += await repo.zerarAusentes({ orgId, connectionId: conexao.id }, kind, vistos, hoje)
    }
  }

  for (const s of salvos) {
    try {
      const query = janelaDeMovimentacoes(await repo.ultimaDataDeMovimentacao(s.assetId))
      for await (const page of client.streamInvestmentTransactions(s.kind, s.polpId, query)) {
        const { ok, rejected } = normalizeBatch(page, normalizeInvestmentTransaction)
        resumo.rejeitados += rejected.length
        problemas.push(...rejected.map((r) => ({ resourceId: s.resourceId, externalId: r.externalId, reason: r.reason, payload: r.raw })))
        for (const e of ok) {
          if (e.unknownType) {
            problemas.push({ resourceId: s.resourceId, externalId: e.polpTransactionId, reason: `tipo de movimentação desconhecido: ${e.unknownType}`, payload: e })
          }
        }
        resumo.movimentacoes += await repo.salvarMovimentacoes({ orgId, accountId, assetId: s.assetId }, ok)
      }
    } catch (error) {
      problemas.push({ resourceId: s.resourceId, externalId: null, reason: `falha nas movimentações de ${s.kind}: ${mensagem(error)}`, payload: {} })
    }
  }

  await repo.registrarProblemas(orgId, problemas)
  await repo.recalcularPosicoes(orgId)
  return resumo
}

function mensagem(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
