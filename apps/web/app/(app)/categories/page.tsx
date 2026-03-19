import { getOrgId, getCategories, getCategoryRules } from '@/lib/finance/queries'
import { CategoryList } from '@/components/finance/category-list'
import { RuleList } from '@/components/finance/rule-list'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export default async function CategoriesPage() {
  const orgId = await getOrgId()
  const [categories, rules] = await Promise.all([
    getCategories(orgId),
    getCategoryRules(orgId),
  ])

  // Map categories to the option format needed by RuleList
  const categoryOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Categorias</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie categorias e regras de categorizacao automatica
        </p>
      </div>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="rules">Regras</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <CategoryList categories={categories} />
        </TabsContent>
        <TabsContent value="rules">
          <RuleList rules={rules} categories={categoryOptions} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
