'use server'
import { getDb, orgs } from '@floow/db'
import type { Perfil } from '@floow/core-finance'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getOrgId } from '@/lib/finance/queries'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

const perfilSchema = z.enum(['conservador', 'moderado', 'arrojado'])

export async function salvarPerfilInvestidor(perfil: Perfil): Promise<{ error?: string }> {
  try {
    const valor = perfilSchema.parse(perfil)
    const orgId = await getOrgId()
    await getDb().update(orgs).set({ perfilInvestidor: valor, updatedAt: new Date() }).where(eq(orgs.id, orgId))
    revalidatePath('/investments/diagnostico')
    return {}
  } catch (erro) {
    return { error: mensagemDeErro(erro, 'Não deu para salvar o perfil. Tente de novo.') }
  }
}
