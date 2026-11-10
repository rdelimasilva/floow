import { rotaDeMercado } from '@/lib/mercado/rota'
import { universoDeMercado } from '@/lib/mercado/repo'
import { rodarCvmCotas } from '@/lib/mercado/jobs/cvm-cotas'

/** Cron diário: cotas dos fundos das carteiras, do informe diário da CVM. */
export const POST = rotaDeMercado('cvm_cotas', async ({ repo, db, hoje }) => {
  const { cnpjs } = await universoDeMercado(db)
  return rodarCvmCotas({ fetch, repo, hoje, cnpjs })
})

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
