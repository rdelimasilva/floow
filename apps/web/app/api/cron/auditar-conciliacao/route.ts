import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getDb } from '@floow/db'
import { isAuthorizedService } from '@/lib/auth/service-auth'
import { auditarConciliacao } from '@/lib/finance/conciliacao/auditoria'

/**
 * GET /api/cron/auditar-conciliacao — diário, read-only.
 *
 * Procura o que a regra "numa conta Open Finance só o extrato move o saldo"
 * diz que não pode existir, e manda ao Sentry um evento por tipo de achado.
 * Só contagens e ids de conta: nem descrição de lançamento, nem nome.
 */
export async function POST(request: Request) {
  const authorized = isAuthorizedService(request.headers.get('authorization'), [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
  ])
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const achados = await auditarConciliacao(getDb())

    const eventos = [
      { achado: 'par_move_saldo', mensagem: 'conciliação: par que move saldo em conta Open Finance', contas: achados.paresQueMovemSaldo, total: achados.paresQueMovemSaldo.reduce((s, c) => s + c.pares, 0) },
      { achado: 'divergencia_de_saldo', mensagem: 'conciliação: saldo diverge do banco em mais de R$ 1,00', contas: achados.divergencias, total: achados.divergencias.length },
      { achado: 'invariante_quebrado', mensagem: 'conciliação: linha aguardando o extrato dentro do saldo', contas: achados.invarianteQuebrado, total: achados.invarianteQuebrado.reduce((s, c) => s + c.linhas, 0) },
    ]

    for (const e of eventos) {
      if (e.contas.length === 0) continue
      Sentry.captureMessage(e.mensagem, {
        level: 'warning',
        tags: { auditoria: 'conciliacao', achado: e.achado },
        extra: { total: e.total, contas: e.contas },
      })
    }

    return NextResponse.json({
      ok: true,
      paresQueMovemSaldo: achados.paresQueMovemSaldo.length,
      divergencias: achados.divergencias.length,
      invarianteQuebrado: achados.invarianteQuebrado.length,
    })
  } catch (err) {
    console.error('[auditar-conciliacao] falhou:', err)
    return NextResponse.json({ error: 'Audit failed' }, { status: 500 })
  }
}

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
