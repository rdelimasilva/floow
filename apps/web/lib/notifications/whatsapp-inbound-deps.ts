/**
 * Deps reais do webhook. Sem usuário na requisição: acha o dono pelo número
 * verificado (conexão de serviço) e só então escreve sob o RLS dele.
 */
import { getServiceDb, profiles } from '@floow/db'
import { and, inArray, isNotNull } from 'drizzle-orm'
import { withUserDbFor } from '@/lib/db/rls'
import { getAppUrl } from '@/lib/app-url'
import { listUserOrgIds, upsertFrequency } from './preferences-store'
import { sendWhatsAppText } from './send-whatsapp'
import type { InboundDeps } from './whatsapp-inbound'

export function defaultInboundDeps(): InboundDeps {
  return {
    async findUserByPhone(candidates) {
      const [row] = await getServiceDb()
        .select({ userId: profiles.id })
        .from(profiles)
        .where(and(inArray(profiles.whatsappPhone, candidates), isNotNull(profiles.whatsappVerifiedAt)))
        .limit(1)
      return row
    },
    async turnOffWhatsApp(userId) {
      await withUserDbFor(userId, async (tx) => {
        const orgIds = await listUserOrgIds(tx, userId)
        await upsertFrequency(tx, userId, orgIds, 'whatsapp', 'off')
      })
    },
    reply: (to, body) => sendWhatsAppText(to, body),
    appUrl: getAppUrl(),
  }
}
