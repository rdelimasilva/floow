import { getOrgId } from '@/lib/auth/session'
import { getAcesso, noLimiteDeContas } from '@/lib/plano/acesso-queries'
import type { Recurso } from '@/lib/plano/acesso'
import { OfertaDoPro } from './oferta-do-pro'

/** Para layouts: mostra a tela só com acesso ao recurso; senão, a oferta do Pro. */
export async function ExigePro({ recurso, children }: { recurso: Recurso; children: React.ReactNode }) {
  const orgId = await getOrgId()
  const acesso = await getAcesso(orgId)
  const bloqueado = recurso === 'contas' ? await noLimiteDeContas(orgId) : !acesso.pro
  if (bloqueado) return <OfertaDoPro recurso={recurso} trialAte={acesso.trialAte} />
  return <>{children}</>
}
