import type { Config } from '@netlify/functions'

export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (!siteUrl) {
    console.error('[cfo-daily] No URL env var — cannot call run-daily endpoint')
    return new Response('No URL configured', { status: 500 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    console.error('[cfo-daily] No SUPABASE_SERVICE_ROLE_KEY')
    return new Response('No service role key', { status: 500 })
  }

  try {
    const response = await fetch(`${siteUrl}/api/cfo/run-daily`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    })

    const body = await response.text()
    console.log(`[cfo-daily] Status: ${response.status}, Body: ${body}`)

    return new Response(body, { status: response.status })
  } catch (err) {
    console.error('[cfo-daily] Failed:', err)
    return new Response(String(err), { status: 500 })
  }
}

export const config: Config = {
  schedule: '0 7 * * *',
}
