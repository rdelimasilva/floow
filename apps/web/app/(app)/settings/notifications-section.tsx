'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { setNotificationFrequency } from '@/lib/notifications/preferences-actions'
import { CHANNELS, FREQUENCIES, type Channel, type Frequency } from '@/lib/notifications/schedule'
import type { NotificationSettings } from '@/lib/notifications/notification-settings'
import { WhatsAppPhoneForm } from './whatsapp-phone-form'

const CANAL: Record<Channel, string> = { email: 'E-mail', whatsapp: 'WhatsApp' }
const FREQ: Record<Frequency, string> = {
  daily: 'Diário',
  weekly: 'Semanal (segunda)',
  alerts: 'Só alertas',
  off: 'Desligado',
}
const SELECT =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50'

type Valores = Record<string, Record<Channel, Frequency>>
const valoresDe = (s: NotificationSettings): Valores =>
  Object.fromEntries(s.orgs.map((o) => [o.orgId, o.frequencies]))

export function NotificationsSection({ settings }: { settings: NotificationSettings }) {
  const { toast } = useToast()
  const [valores, setValores] = useState<Valores>(() => valoresDe(settings))
  // router.refresh() depois de verificar/remover o número traz props novas.
  useEffect(() => setValores(valoresDe(settings)), [settings])

  async function mudar(orgId: string, canal: Channel, freq: Frequency) {
    const anterior = valores[orgId][canal]
    setValores((v) => ({ ...v, [orgId]: { ...v[orgId], [canal]: freq } }))
    try {
      await setNotificationFrequency(orgId, canal, freq)
      toast('Preferência salva')
    } catch {
      setValores((v) => ({ ...v, [orgId]: { ...v[orgId], [canal]: anterior } }))
      toast('Não foi possível salvar a preferência', 'error')
    }
  }

  return (
    <section className="max-w-2xl rounded-lg border bg-white p-6 space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Bell className="h-4 w-4" />
          Notificações
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ritmo de gastos: orçado × realizado até o dia. &quot;Só alertas&quot; avisa quando uma
          categoria entra em risco ou estoura o teto.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">WhatsApp</p>
        <WhatsAppPhoneForm phone={settings.whatsappPhone} />
        {!settings.whatsappVerified && (
          <p className="text-xs text-muted-foreground">
            Enviamos um código para o número. Depois de confirmar, o resumo semanal chega em todas
            as suas contas. Para parar, responda SAIR.
          </p>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Conta</th>
            {CHANNELS.map((c) => (
              <th key={c} className="pb-2 pl-3 font-medium">{CANAL[c]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {settings.orgs.map((o) => (
            <tr key={o.orgId} className="border-t">
              <td className="py-2 pr-3">{o.orgName}</td>
              {CHANNELS.map((c) => (
                <td key={c} className="py-2 pl-3">
                  <select
                    aria-label={`${CANAL[c]} — ${o.orgName}`}
                    className={SELECT}
                    value={valores[o.orgId]?.[c] ?? 'off'}
                    disabled={c === 'whatsapp' && !settings.whatsappVerified}
                    onChange={(e) => mudar(o.orgId, c, e.target.value as Frequency)}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{FREQ[f]}</option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
