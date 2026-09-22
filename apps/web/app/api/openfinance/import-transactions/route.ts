import { NextResponse } from 'next/server'
import { importarLancamentosDeTodasAsConexoes } from '@/lib/openfinance/importacao-agendada'
import { isAuthorizedService } from '@/lib/auth/service-auth'

/**
 * Importação agendada dos lançamentos — o mesmo caminho do botão da tela,
 * disparado pelo cron.
 *
 * Até aqui o sync só existia no clique (`connection-list.tsx`). Quem não abria
 * a tela ficava com extrato velho, e a conferência com o saldo do banco — que
 * só vale com dado fresco — nunca rodava. Controle que depende de alguém
 * lembrar de apertar um botão não é controle.
 *
 * Roda três vezes ao dia: 8h, 14h e 20h de Brasília. No `vercel.json` isso
 * aparece como `0 11,17,23` porque o cron da Vercel é sempre UTC, e o
 * `regions: ["gru1"]` não muda isso — é onde a função executa, não o fuso do
 * agendador. Mexeu no horário lá, converta de UTC-3 aqui.
 *
 * O trabalho pesado é a ida à Polp, então a rota é só autenticação mais uma
 * chamada: quem sabe iterar conexão é `importacao-agendada.ts`, testável sem
 * HTTP.
 *
 * `maxDuration` bem acima do padrão porque o tempo cresce com o número de
 * conexões e de páginas de extrato — e a importação é sequencial de propósito,
 * já que a credencial da Polp é uma só para o floow inteiro.
 */
export const maxDuration = 300

export async function POST(request: Request) {
  const authorized = isAuthorizedService(request.headers.get('authorization'), [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
  ])
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resumo = await importarLancamentosDeTodasAsConexoes()

    // Log mesmo no sucesso: sem ninguém olhando a tela, é daqui que se
    // descobre que a fila encheu ou que um banco anda recusando.
    console.log('[openfinance] importacao agendada:', JSON.stringify(resumo))

    return NextResponse.json({ ok: true, ...resumo })
  } catch (err) {
    console.error('[openfinance] importacao agendada falhou:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
