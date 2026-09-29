'use server'
import { revalidatePath } from 'next/cache'
import { requireIdentity } from '@/lib/auth/session'
import { getOrgId } from '@/lib/finance/queries'
import { apagarMemoria } from './memorias'

/** Apaga só se a memória for do usuário nesta org (filtro + RLS). */
export async function apagarMemoriaAction(id: string): Promise<{ error?: string }> {
  try {
    const { userId } = await requireIdentity()
    const orgId = await getOrgId()
    await apagarMemoria(orgId, userId, id)
    revalidatePath('/cfo')
    return {}
  } catch (err) {
    console.error('[consultor] falha ao apagar memória:', err)
    return { error: 'Não foi possível apagar agora. Tente de novo.' }
  }
}
