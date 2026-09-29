/**
 * Deps reais do webhook. Sem usuário na requisição: acha o dono pelo número
 * verificado (conexão de serviço) e só então escreve sob o RLS dele.
 */
import { getServiceDb, profiles } from '@floow/db'
import { and, desc, inArray, isNotNull, sql } from 'drizzle-orm'
import { withUserDbFor } from '@/lib/db/rls'
import { getAppUrl } from '@/lib/app-url'
import { atenderNoWhatsApp } from '@/lib/consultor/whatsapp/atender'
import { depsReaisDoWhatsApp } from '@/lib/consultor/whatsapp/deps'
import { listUserOrgIds, upsertFrequency } from './preferences-store'
import { sendWhatsAppText } from './send-whatsapp'
import { completeLink } from './whatsapp-verification'
import { completeLinkDeps } from './whatsapp-link-deps'
import type { InboundDeps } from './whatsapp-inbound'

export function defaultInboundDeps(): InboundDeps {
  return {
    // Deps montadas a cada mensagem de vínculo: sem CRON_SECRET só essa
    // mensagem falha (o route loga), não o webhook inteiro.
    completeLink: (waId, code) => completeLink(waId, code, completeLinkDeps()),
    async findUserByPhone(candidates) {
      // Duas formas do mesmo wa_id podem bater com usuários diferentes; a forma
      // exata (com o nono dígito, quando presente) vem primeiro.
      const [row] = await getServiceDb()
        .select({ userId: profiles.id })
        .from(profiles)
        .where(and(inArray(profiles.whatsappPhone, candidates), isNotNull(profiles.whatsappVerifiedAt)))
        .orderBy(desc(sql`${profiles.whatsappPhone} = ${candidates[0]}`))
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
    async consultar(userId, msg) {
      await atenderNoWhatsApp({ userId, waId: msg.from, texto: msg.text, wamid: msg.id }, depsReaisDoWhatsApp())
    },
    appUrl: getAppUrl(),
  }
}
