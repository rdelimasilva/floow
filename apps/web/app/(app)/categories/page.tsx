import { getOrgId, getCategories } from '@/lib/finance/queries'
import { CategoryList } from '@/components/finance/category-list'

export default async function CategoriesPage() {
  const orgId = await getOrgId()
  const categories = await getCategories(orgId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Categorias</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie as categorias de receitas e despesas
        </p>
      </div>

      <CategoryList categories={categories} />
    </div>
  )
}
