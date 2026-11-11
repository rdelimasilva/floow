import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOrgId, getAccounts, getCategories } from '@/lib/finance/queries'
import { getGastosDosCartoes, getMetasDosMeses } from '@/lib/finance/queries-gastos-cartao'
import { GastosDosCartoes } from '@/components/finance/gastos-dos-cartoes'
import { PageHeader } from '@/components/ui/page-header'
import { RECORTE_PADRAO, contasValidas, destinoComRecorte, lerRecorte, recorteDaUrl, temRecorteNaUrl } from '@/lib/finance/recorte'
import { destinoSoComContasValidas } from '@/lib/finance/url-do-menu'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

async function Conteudo({ orgId, startDate, endDate, accountIds, categoryIds }: {
  orgId: string; startDate: string; endDate: string; accountIds: string[]; categoryIds: string[]
}) {
  const [cartoes, categorias] = await Promise.all([
    getGastosDosCartoes(orgId, { inicio: startDate, fim: endDate }),
    getCategories(orgId),
  ])
  const meses = [...new Set(cartoes.flatMap((c) => c.faturas.map((f) => f.fechamento.slice(0, 7))))]
  const metas = await getMetasDosMeses(orgId, meses)
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return (
    <GastosDosCartoes
      cartoes={cartoes}
      metas={metas}
      hoje={hoje}
      startDate={startDate}
      endDate={endDate}
      accountIds={accountIds}
      categoryIds={categoryIds}
      // O gráfico agrupa pela categoria de cima; o filtro escolhe entre elas.
      categoriasDeCima={categorias.filter((c) => !c.parentId).map((c) => ({ id: c.id, name: c.name }))}
      arvoreDeCategorias={categorias.map((c) => ({ id: c.id, parentId: c.parentId ?? null }))}
    />
  )
}

export default async function GastosDosCartoesPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()
  // Só cartão com dia de fechamento entra aqui; as outras contas do recorte ficam no cookie.
  const cartaoIds = (await getAccounts(orgId)).filter((a) => a.type === 'credit_card' && a.closingDay != null).map((a) => a.id)

  if (!temRecorteNaUrl(params)) {
    const jar = await cookies()
    const lidos = Object.fromEntries(jar.getAll().map((c) => [c.name, c.value]))
    const r = lerRecorte(lidos) ?? RECORTE_PADRAO()
    const destino = destinoComRecorte('/cash-flow/cartoes', params, { ...r, accountIds: contasValidas(r.accountIds, cartaoIds) }, 'intervalo', { contas: true })
    if (destino) redirect(destino)
  }

  // Link velho com conta que não é cartão: sai da URL, o cookie não é tocado.
  const destino = destinoSoComContasValidas(params, cartaoIds, '/cash-flow/cartoes')
  if (destino) redirect(destino)

  const { startDate = '', endDate = '', accountIds = [] } = recorteDaUrl(params)
  const categoryIds = (params.categoryIds ?? '').split(',').filter(Boolean)
  return (
    <div className="space-y-6">
      <PageHeader title="Gastos dos cartões" description="Quanto você gastou em cada fatura, mês a mês" />
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-gray-100" />}>
        <Conteudo orgId={orgId} startDate={startDate} endDate={endDate} accountIds={accountIds} categoryIds={categoryIds} />
      </Suspense>
    </div>
  )
}
