'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/auth')
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSignOut}
    >
      Sair
    </Button>
  )
}
