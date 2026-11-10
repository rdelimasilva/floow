import { rotaDeMercado } from '@/lib/mercado/rota'
import { universoDeMercado } from '@/lib/mercado/repo'
import { rodarB3 } from '@/lib/mercado/jobs/b3'

/** Cron de dia útil, depois do fechamento: cotação dos tickers das carteiras, do Ibovespa e do IFIX (brapi). */
export const POST = rotaDeMercado('b3', async ({ repo, db }) => {
  const { tickers } = await universoDeMercado(db)
  return rodarB3({ fetch, repo, token: process.env.BRAPI_TOKEN, tickers })
})

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
