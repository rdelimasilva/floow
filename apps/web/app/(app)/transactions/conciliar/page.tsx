import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { contarItensParaConciliar } from '@/lib/finance/itens-para-conciliar'
import { getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'
import { SecaoRepetidos, SecaoClassificar, SecaoConfirmar } from '@/components/finance/secoes-de-conciliar'
import { TudoConciliado } from '@/components/finance/secao-de-conciliar'
import { PageHeader } from '@/components/ui/page-header'
import { LinkDeAjuda } from '@/components/ajuda/link-de-ajuda'

interface Props {
  searchParams: Promise<{ regra?: string }>
}

/**
 * Tudo que pede decisão sobre lançamento importado, numa tela só. Unifica a
 * JORNADA, não os domínios: cada seção continua com as ações e a memória que
 * tinha (ver docs/superpowers/specs/2026-09-29-conciliar-fluxo-unico-design.md).
 *
 * Nenhuma decisão aqui tranca o app. Quem traz o usuário até aqui é a faixa
 * e o botão da tela de Transações, o selo da linha e o assistente de conexão.
 */
export default async function ConciliarPage({ searchParams }: Props) {
  const [orgId, identity, { regra }] = await Promise.all([getOrgId(), getVerifiedIdentity(), searchParams])
  const { total } = await contarItensParaConciliar(orgId, identity?.userId ?? null)

  // As regras confirmadas moram em Classificar e continuam editáveis com nada
  // pendente; com regra para editar não há "Tudo conciliado" (spec §3.1). Se a
  // busca falhar, não afirmamos "tudo conciliado": a seção mostra o alerta.
  const temRegras =
    total === 0 ? await getConfirmedCounterparties(orgId).then((r) => r.length > 0, () => true) : true

  return (
    <div className="space-y-8">
      <PageHeader
        title="Conciliar"
        description="O que o banco mandou e o floow não resolve sozinho. Nada muda sem você aprovar."
      >
        <LinkDeAjuda topico="filas" />
      </PageHeader>

      {total === 0 && !temRegras && <TudoConciliado />}

      <Suspense fallback={null}>
        <SecaoRepetidos orgId={orgId} />
      </Suspense>
      <Suspense fallback={null}>
        <SecaoClassificar orgId={orgId} regraAberta={regra} />
      </Suspense>
      <Suspense fallback={null}>
        <SecaoConfirmar orgId={orgId} />
      </Suspense>
    </div>
  )
}
