import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      `Supabase env vars missing at runtime: NEXT_PUBLIC_SUPABASE_URL=${url ? 'set' : 'EMPTY'}, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key ? 'set' : 'EMPTY'}. Check Vercel project Environment Variables and rebuild.`,
    )
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims() verifica a ASSINATURA do JWT — com chave assimétrica, contra o
  // JWKS (cache global por processo, sem ida à rede por requisição); com a
  // chave simétrica antiga, contra o servidor de Auth.
  //
  // getSession() NÃO faz isso: no servidor ele devolve o conteúdo do cookie sem
  // verificar nada. Um cookie forjado passava por esta checagem e seguia para o
  // app inteiro. Não voltar para getSession() aqui.
  const { data, error } = await supabase.auth.getClaims()

  const userId = error ? null : (data?.claims?.sub ?? null)

  return { supabaseResponse, userId }
}
