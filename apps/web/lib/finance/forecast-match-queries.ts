import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { accounts, forecastMatchProposals, transactions } from '@floow/db'
import { withUserDb, withUserDbFor } from '@/lib/db/rls'

export interface LadoDoPar {
  id: string
  date: string
  description: string
  amountCents: number
}

export interface PropostaPendente {
  id: string
  previsao: LadoDoPar
  realizado: LadoDoPar
  contaNome: string | null
  /** Distância em dias entre as duas datas — o porquê do par, na tela. */
  diasDeDiferenca: number
  /** Diferença absoluta de valor, em centavos. */
  diferencaCents: number
}

const DIA_EM_MS = 24 * 60 * 60 * 1000

/**
 * A proposta que ainda pode ser aprovada: pendente, da org, e com as duas
 * pontas ainda elegíveis.
 *
 * `pending` não basta. A janela entre propor e aprovar é aberta por desenho
 * (a fila não bloqueia o app) e nela o usuário mexe nas pontas. Se o
 * realizado foi marcado como ignorado, `toggleIgnoreTransaction` já reverteu
 * `accounts.balance_cents` em `-amountCents` — aprovar depois disso daria
 * vínculo à previsão, tirando-a do saldo projetado, com o realizado já fora
 * do saldo da conta: o lançamento desapareceria dos DOIS saldos, exibindo o
 * selo "conciliado" cujo título afirma que quem soma é o realizado.
 *
 * A fila e o contador do badge leem a MESMA condição, senão o badge anuncia
 * decisões que a tela não mostra. Defesa em profundidade: `aprovarProposta`
 * reconfere o mesmo antes de gravar, porque a fila é uma página renderizada e
 * o clique chega depois dela.
 *
 * Recebe as colunas de cada lado, e não a tabela, porque a linha junta
 * previsão e realizado — que são a mesma tabela, lida por dois aliases.
 */
function condicaoDePropostaAprovavel(
  orgId: string,
  previsao: { matchedTransactionId: AnyPgColumn; balanceApplied: AnyPgColumn },
  realizado: { isIgnored: AnyPgColumn },
) {
  return and(
    eq(forecastMatchProposals.orgId, orgId),
    eq(forecastMatchProposals.status, 'pending'),
    // Realizado ignorado já saiu do saldo da conta.
    eq(realizado.isIgnored, false),
    // Previsão que ganhou vínculo por outro caminho já está conciliada.
    isNull(previsao.matchedTransactionId),
    // Previsão que virou realizada não é mais previsão.
    eq(previsao.balanceApplied, false),
  )
}

/**
 * As propostas abertas da org, com os dois lados do par e o porquê dele.
 *
 * Dois aliases de `transactions` porque a linha junta previsão e realizado, que
 * são a mesma tabela. Ordenada por dinheiro, decrescente — o mesmo princípio
 * que a fila de contrapartes validou: "R$ 92 mil" move o usuário, "12 itens"
 * não.
 *
 * Proposta cuja ponta ficou inelegível sai da fila — ver
 * `condicaoDePropostaAprovavel`.
 */
export async function getPropostasPendentes(orgId: string): Promise<PropostaPendente[]> {
  return withUserDb(async (db) => {
    const previsao = alias(transactions, 'previsao')
    const realizado = alias(transactions, 'realizado')

    const rows = await db
      .select({
        id: forecastMatchProposals.id,
        previsaoId: previsao.id,
        previsaoDate: previsao.date,
        previsaoDescription: previsao.description,
        previsaoAmount: previsao.amountCents,
        realizadoId: realizado.id,
        realizadoDate: realizado.date,
        realizadoDescription: realizado.description,
        realizadoAmount: realizado.amountCents,
        contaNome: accounts.name,
      })
      .from(forecastMatchProposals)
      .innerJoin(previsao, eq(previsao.id, forecastMatchProposals.forecastTransactionId))
      .innerJoin(realizado, eq(realizado.id, forecastMatchProposals.realizedTransactionId))
      .leftJoin(accounts, eq(accounts.id, realizado.accountId))
      .where(condicaoDePropostaAprovavel(orgId, previsao, realizado))
      .orderBy(sql`abs(${realizado.amountCents}) desc`, asc(forecastMatchProposals.proposedAt))

    const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d))

    return rows.map((row) => ({
      id: row.id,
      previsao: {
        id: row.previsaoId,
        date: iso(row.previsaoDate),
        description: row.previsaoDescription,
        amountCents: row.previsaoAmount,
      },
      realizado: {
        id: row.realizadoId,
        date: iso(row.realizadoDate),
        description: row.realizadoDescription,
        amountCents: row.realizadoAmount,
      },
      contaNome: row.contaNome,
      diasDeDiferenca: Math.round(
        Math.abs(new Date(row.previsaoDate).getTime() - new Date(row.realizadoDate).getTime()) / DIA_EM_MS,
      ),
      diferencaCents: Math.abs(row.previsaoAmount - row.realizadoAmount),
    }))
  })
}

/**
 * Quantas propostas esperam decisão — alimenta o badge do menu.
 *
 * Recebe o `userId` em vez de resolvê-lo da requisição: quem chama esta
 * função é `contagemDeConciliacoesPendentes`, de dentro do callback de um
 * `unstable_cache` — e esse callback não pode ler cookies. `withUserDbFor`
 * existe exatamente para isso; ver o docblock dele em `lib/db/rls.ts`.
 */
export async function contarPropostasPendentes(orgId: string, userId: string): Promise<number> {
  return withUserDbFor(userId, async (db) => {
    const previsao = alias(transactions, 'previsao')
    const realizado = alias(transactions, 'realizado')

    const [row] = await db
      .select({ total: count() })
      .from(forecastMatchProposals)
      .innerJoin(previsao, eq(previsao.id, forecastMatchProposals.forecastTransactionId))
      .innerJoin(realizado, eq(realizado.id, forecastMatchProposals.realizedTransactionId))
      // A mesma condição da fila: badge que conta o que a tela não mostra
      // manda o usuário procurar decisão que não existe.
      .where(condicaoDePropostaAprovavel(orgId, previsao, realizado))

    return Number(row?.total ?? 0)
  })
}
