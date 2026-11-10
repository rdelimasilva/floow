'use server'
import { orgs } from '@floow/db'
import type { Perfil } from '@floow/core-finance'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { withUserDb } from '@/lib/db/rls'
import { getOrgId } from '@/lib/finance/queries'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

const perfilSchema = z.enum(['conservador', 'moderado', 'arrojado'])

export async function salvarPerfilInvestidor(perfil: Perfil): Promise<{ error?: string }> {
  try {
    const valor = perfilSchema.parse(perfil)
    const orgId = await getOrgId()
    const gravadas = await withUserDb((db) =>
      db.update(orgs).set({ perfilInvestidor: valor, updatedAt: new Date() }).where(eq(orgs.id, orgId)).returning({ id: orgs.id }),
    )
    // O RLS só deixa o dono da org gravar; para os outros membros o update não acha linha.
    if (gravadas.length === 0) return { error: 'Só quem administra a conta da família pode mudar o perfil.' }
    revalidatePath('/investments/diagnostico')
    return {}
  } catch (erro) {
    return { error: mensagemDeErro(erro, 'Não deu para salvar o perfil. Tente de novo.') }
  }
}
