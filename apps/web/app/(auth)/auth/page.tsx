import { AuthTabs } from '@/components/auth/auth-tabs'
import { parseAuthTab } from '@/components/auth/auth-tab'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AuthPage({ searchParams }: Props) {
  const { tab } = await searchParams

  return (
    <div className="w-full">
      <AuthTabs defaultTab={parseAuthTab(tab)} />
    </div>
  )
}
