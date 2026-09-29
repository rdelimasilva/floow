import { unstable_rethrow } from 'next/navigation'
import { getDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { getPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { getPendingCounterpartyGroups, getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'
import { getCategories, getAccounts } from '@/lib/finance/queries'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { DuplicateProposalQueue } from '@/components/finance/duplicate-proposal-queue'
import { MatchProposalQueue } from '@/components/finance/match-proposal-queue'
import { CounterpartyQueueClient } from '@/components/openfinance/counterparty-queue-client'
import { SecaoDeConciliar, FalhaDaSecao, type IdDaSecao } from './secao-de-conciliar'

/**
 * As três seções da tela Conciliar. Cada uma busca os próprios dados e entra
 * no seu `<Suspense>`: falha numa não derruba as outras (o mesmo princípio de
 * `pending-queues-slot.tsx`), e a mais lenta não segura as rápidas.
 *
 * Seção vazia devolve `null`: alarme que toca sempre deixa de ser lido.
 */

type Carregado<T> = { ok: true; dados: T } | { ok: false }

async function carregar<T>(id: IdDaSecao, buscar: () => Promise<T>): Promise<Carregado<T>> {
  try {
    return { ok: true, dados: await buscar() }
  } catch (error) {
    // Erro de controle do Next (render dinâmico, redirect) não é falha da
    // seção: engolir aqui esconderia do Next que a rota lê cookies.
    unstable_rethrow(error)
    console.error(`[conciliar] falha ao carregar a seção ${id}:`, error)
    return { ok: false }
  }
}

export async function SecaoRepetidos({ orgId }: { orgId: string }) {
  const r = await carregar('repetidos', () => getDuplicatasPendentes(orgId))
  if (!r.ok) return <FalhaDaSecao id="repetidos" />
  if (r.dados.length === 0) return null

  return (
    <SecaoDeConciliar id="repetidos" contagem={r.dados.length}>
      <DuplicateProposalQueue propostas={r.dados} />
    </SecaoDeConciliar>
  )
}

/**
 * Aparece também sem nada pendente quando há regra confirmada: a lista de
 * regras mora aqui, e é para cá que "Corrigir regra" (`?regra=`) aponta.
 */
export async function SecaoClassificar({ orgId, regraAberta }: { orgId: string; regraAberta?: string }) {
  const r = await carregar('classificar', () =>
    Promise.all([
      getPendingCounterpartyGroups(orgId),
      getConfirmedCounterparties(orgId),
      getCategories(orgId),
      getAccounts(orgId),
    ]),
  )
  if (!r.ok) return <FalhaDaSecao id="classificar" />

  const [pending, confirmed, categories, accounts] = r.dados
  if (pending.length === 0 && confirmed.length === 0) return null

  const categoryOptions = toCategoryOptions(
    categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
  )
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))
  // Lançamentos, não contrapartes: o mesmo número da faixa de Transações.
  const lancamentos = pending.reduce((soma, g) => soma + g.count, 0)

  return (
    <SecaoDeConciliar id="classificar" contagem={lancamentos}>
      <CounterpartyQueueClient
        pending={pending}
        confirmed={confirmed}
        categoryOptions={categoryOptions}
        accountOptions={accountOptions}
        regraAberta={regraAberta}
      />
    </SecaoDeConciliar>
  )
}

export async function SecaoConfirmar({ orgId }: { orgId: string }) {
  const r = await carregar('confirmar', () => getPropostasPendentes(orgId))
  if (!r.ok) return <FalhaDaSecao id="confirmar" />
  if (r.dados.length === 0) return null

  return (
    <SecaoDeConciliar id="confirmar" contagem={r.dados.length}>
      <MatchProposalQueue propostas={r.dados} />
    </SecaoDeConciliar>
  )
}
