import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Org name from JWT app_metadata (injected by custom_access_token_hook)
  // Once Supabase is configured, org_ids are available in the JWT claims
  const orgIds = user?.app_metadata?.org_ids as string[] | undefined
  const hasOrg = orgIds && orgIds.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Welcome to Floow
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {hasOrg ? 'Your organization' : 'Setting up your account...'}
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">
          Your platform is ready. Financial features coming soon.
        </p>
      </div>
    </div>
  )
}
