import { rotaDeMercado } from '@/lib/mercado/rota'
import { universoDeMercado } from '@/lib/mercado/repo'
import { rodarCvmExtrato } from '@/lib/mercado/jobs/cvm-extrato'

/** Cron semanal: taxa e prazo de resgate dos fundos das carteiras, do extrato da CVM. */
// Sem isto o Hobby sem fluid compute corta em 10 s. 60 s já passa no deploy.
export const maxDuration = 60

export const POST = rotaDeMercado('cvm_extrato', async ({ repo, db, hoje }) => {
  const { cnpjs } = await universoDeMercado(db)
  return rodarCvmExtrato({ fetch, repo, hoje, cnpjs })
})

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
