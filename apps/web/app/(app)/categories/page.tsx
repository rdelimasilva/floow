import { getOrgId, getCategories, getCategoryRules } from '@/lib/finance/queries'
import { CategoryList } from '@/components/finance/category-list'
import { RuleList } from '@/components/finance/rule-list'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'

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
      <PageHeader
        title="Categorias"
        description="Gerencie categorias e regras de categorizacao automatica"
      />

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
