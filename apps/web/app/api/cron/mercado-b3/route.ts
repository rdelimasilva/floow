import { rotaDeMercado } from '@/lib/mercado/rota'
import { universoDeMercado } from '@/lib/mercado/repo'
import { rodarB3 } from '@/lib/mercado/jobs/b3'

/** Cron de dia útil, depois do fechamento: cotação dos tickers das carteiras, do Ibovespa e do IFIX (brapi). */
// Sem isto o Hobby sem fluid compute corta em 10 s. 60 s já passa no deploy.
export const maxDuration = 60

export const POST = rotaDeMercado('b3', async ({ repo, db }) => {
  const { tickers } = await universoDeMercado(db)
  return rodarB3({ fetch, repo, token: process.env.BRAPI_TOKEN, tickers })
})

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
