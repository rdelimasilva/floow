import { rotaDeMercado } from '@/lib/mercado/rota'
import { rodarTesouro } from '@/lib/mercado/jobs/tesouro'

/** Cron diário: taxas e preços do Tesouro Direto (Tesouro Transparente). */
export const POST = rotaDeMercado('tesouro', ({ repo }) => rodarTesouro({ fetch, repo }))

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
