import { rotaDeMercado } from '@/lib/mercado/rota'
import { rodarBcb } from '@/lib/mercado/jobs/bcb'

/** Cron diário: CDI, Selic e IPCA do SGS do Banco Central. */
export const POST = rotaDeMercado('bcb', ({ repo, hoje }) => rodarBcb({ fetch, repo, hoje }))

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
