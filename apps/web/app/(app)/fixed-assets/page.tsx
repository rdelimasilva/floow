import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getFixedAssets, getFixedAssetTypes } from '@/lib/fixed-assets/queries'
import { estimateAssetValue, formatBRL } from '@floow/core-finance'
import { AssetTypeList } from '@/components/fixed-assets/asset-type-list'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'

export default async function FixedAssetsPage() {
  const orgId = await getOrgId()
  const [assets, types] = await Promise.all([
    getFixedAssets(orgId),
    getFixedAssetTypes(orgId),
  ])

  const typeMap = new Map(types.map((t) => [t.id, t.name]))
  const now = new Date()

  const assetsWithEstimate = assets.map((a) => {
    const baseDate = a.currentValueDate instanceof Date ? a.currentValueDate : new Date(a.currentValueDate)
    const estimated = estimateAssetValue(a.currentValueCents, baseDate, Number(a.annualRate), now)
    return { ...a, estimatedValueCents: estimated }
  })

  const totalEstimated = assetsWithEstimate.reduce((sum, a) => sum + a.estimatedValueCents, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ativos Imobilizados"
        description="Gerencie seus imóveis, veículos e outros bens"
      >
        <Button asChild variant="primary">
          <Link href="/fixed-assets/new">Novo Ativo</Link>
        </Button>
      </PageHeader>

      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">Ativos</TabsTrigger>
          <TabsTrigger value="types">Tipos</TabsTrigger>
        </TabsList>

        <TabsContent value="assets">
          {assets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
              <p className="text-gray-600 font-medium">Nenhum ativo cadastrado.</p>
              <p className="mt-1 text-sm text-gray-400">Cadastre imóveis, veículos e outros bens.</p>
              <Button variant="primary" className="mt-4" asChild>
                <Link href="/fixed-assets/new">Cadastrar Ativo</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tipo</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Valor Compra</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Valor Atual</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Taxa Anual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {assetsWithEstimate.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/fixed-assets/${a.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                            {a.name}
                          </Link>
                          {a.model && <p className="text-xs text-gray-400">{a.model}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{typeMap.get(a.typeId) ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500">{formatBRL(a.purchaseValueCents)}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatBRL(a.estimatedValueCents)}</td>
                        <td className="px-4 py-3 text-right text-sm">
                          <span className={Number(a.annualRate) >= 0 ? 'text-green-700' : 'text-red-600'}>
                            {(Number(a.annualRate) * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-4 py-3 text-sm font-medium text-gray-700">Total Estimado</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatBRL(totalEstimated)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="types">
          <AssetTypeList types={types.map((t) => ({ id: t.id, name: t.name, isSystem: t.isSystem, orgId: t.orgId }))} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
