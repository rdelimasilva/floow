import { getDb, openfinanceConnections } from '@floow/db'
import { eq } from 'drizzle-orm'
import { sincronizarConexao } from './sincronizar-conexao'
import { getPolpClient } from './config'

export interface ResumoDaImportacaoAgendada {
  conexoes: number
  importadas: number
  atualizadas: number
  /** Conexões que estouraram. O disparo não para por elas. */
  falhas: number
  propostasDeConciliacao: number
  propostasDeDuplicata: number
}

/**
 * Importa os lançamentos de todas as conexões autorizadas, sem usuário na
 * requisição.
 *
 * Até aqui o sync só acontecia no clique do usuário (`connection-list.tsx`).
 * Quem não abria a tela ficava com extrato velho — e, desde que a conferência
 * com o saldo do banco existe, também sem o aviso de divergência, que só vale
 * com dado fresco. Um controle que depende de alguém lembrar de apertar um
 * botão não é um controle.
 *
 * Só conexão AUTHORISED entra: consentimento expirado responde erro na Polp, e
 * insistir a cada disparo só encheria o log. Quem reabre é o usuário, pelo
 * botão de reautorizar.
 *
 * Uma conexão quebrada NÃO derruba as outras. São várias orgs no mesmo
 * disparo, e banco fora do ar é rotina — a falha vira contador e log, e as
 * seguintes seguem.
 *
 * Sequencial de propósito: a Polp é uma credencial só para o floow inteiro
 * (ver `config.ts`), e disparar todas as conexões de uma vez convida o 429 que
 * o cliente teria de segurar sozinho.
 */
export async function importarLancamentosDeTodasAsConexoes(): Promise<ResumoDaImportacaoAgendada> {
  const db = getDb()

  const conexoes = await db
    .select({ id: openfinanceConnections.id, orgId: openfinanceConnections.orgId })
    .from(openfinanceConnections)
    .where(eq(openfinanceConnections.status, 'AUTHORISED'))

  const resumo: ResumoDaImportacaoAgendada = {
    conexoes: conexoes.length,
    importadas: 0,
    atualizadas: 0,
    falhas: 0,
    propostasDeConciliacao: 0,
    propostasDeDuplicata: 0,
  }

  if (conexoes.length === 0) return resumo

  const client = getPolpClient()

  for (const conexao of conexoes) {
    try {
      const parcial = await sincronizarConexao(db, client, {
        id: conexao.id,
        orgId: conexao.orgId,
      })
      resumo.importadas += parcial.imported
      resumo.atualizadas += parcial.updated
      resumo.propostasDeConciliacao += parcial.propostasDeConciliacao
      resumo.propostasDeDuplicata += parcial.propostasDeDuplicata
    } catch (error) {
      resumo.falhas++
      // Com o `orgId` no log dá para achar a conexão sem cruzar tabela — e é
      // a única pista que sobra, já que ninguém está olhando a tela.
      console.error(
        `[openfinance] importacao agendada falhou para conexao=${conexao.id} org=${conexao.orgId}:`,
        error,
      )
    }
  }

  return resumo
}
