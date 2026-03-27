import Link from 'next/link'
import { ImportForm } from '@/components/finance/import-form'
import { getOrgId, getAccounts, getCategories } from '@/lib/finance/queries'

/**
 * Import page — allows users to upload OFX or CSV bank statements.
 * Renders ImportForm with the user's accounts for destination account selection.
 *
 * Route: /transactions/import (authenticated, served by (app) layout)
 */
export default async function ImportPage() {
  const orgId = await getOrgId()
  const [accounts, categories] = await Promise.all([
    getAccounts(orgId),
    getCategories(orgId),
  ])

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <div className="mb-6">
        <Link
          href="/transactions"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          &larr; Voltar para transações
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Importar Transações</h1>
        <p className="mt-1 text-sm text-gray-600">
          Importe um extrato bancário em formato OFX ou CSV. Duplicatas são ignoradas
          automaticamente.
        </p>
      </div>

      <ImportForm
        accounts={accounts}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      />
    </div>
  )
}
