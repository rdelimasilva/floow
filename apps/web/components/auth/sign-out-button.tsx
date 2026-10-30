'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Recarga inteira apaga o cache do roteador, que guarda as telas desta conta.
    window.location.replace('/auth')
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
