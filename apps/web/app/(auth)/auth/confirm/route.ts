import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Link do e-mail com token_hash: valida no servidor e não depende do cookie
// PKCE, que some quando o e-mail abre em outro navegador ou aparelho.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      const destino = type === 'recovery' ? '/auth/reset-password' : '/dashboard'
      return NextResponse.redirect(new URL(destino, origin))
    }
  }

  return NextResponse.redirect(new URL('/auth?error=link_invalido', origin))
}
