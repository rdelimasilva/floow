import { NextResponse } from 'next/server'
import { getDb, transactions } from '@floow/db'
import { gte } from 'drizzle-orm'
import { isAuthorizedService } from '@/lib/auth/service-auth'
import { runCategorySuggestionsForOrg } from '@/lib/finance/category-suggestions/job'
import { defaultCategorySuggestionDeps } from '@/lib/finance/category-suggestions/deps'

/** Sugestões de categoria, toda segunda. Ver docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md. */
export async function POST(request: Request) {
  const authorized = isAuthorizedService(request.headers.get('authorization'), [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
  ])
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getDb()
    const trintaDias = new Date()
    trintaDias.setDate(trintaDias.getDate() - 30)
    const orgs = await db
      .selectDistinct({ orgId: transactions.orgId })
      .from(transactions)
      .where(gte(transactions.date, trintaDias))

    const deps = defaultCategorySuggestionDeps()
    let pending = 0
    let failed = 0
    for (let i = 0; i < orgs.length; i += 10) {
      const lote = orgs.slice(i, i + 10)
      const results = await Promise.all(
        lote.map((row) =>
          runCategorySuggestionsForOrg(row.orgId, deps).catch((err) => {
            console.error(`[sugestoes] falhou para org=${row.orgId}:`, err)
            return null
          }),
        ),
      )
      for (const r of results) {
        if (r) pending += r.pending
        else failed++
      }
    }
    return NextResponse.json({ ok: true, orgs: orgs.length, pending, failed })
  } catch (err) {
    console.error('[sugestoes] rodada semanal falhou:', err)
    return NextResponse.json({ error: 'Weekly run failed' }, { status: 500 })
  }
}

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
