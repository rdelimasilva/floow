# Ritmo no WhatsApp — Parte 11: Tela de Notificações

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 13: Configurações → Notificações

**Files:**
- Create: `apps/web/app/(app)/settings/notifications-section.tsx`
- Create: `apps/web/app/(app)/settings/whatsapp-phone-form.tsx`
- Modify: `apps/web/app/(app)/settings/page.tsx`
- Test: `apps/web/__tests__/notifications/notifications-section.test.tsx`

**Interfaces:**
- Consumes: `getNotificationSettings`, `setNotificationFrequency` (Tarefa 10); `NotificationSettings` (Tarefa 10); `requestWhatsAppCode`, `confirmWhatsAppCode`, `removeWhatsApp`, `RequestCodeResult`, `ConfirmCodeResult` (Tarefa 11); `CHANNELS`, `FREQUENCIES`, `Channel`, `Frequency` (Tarefa 3); `formatPhoneDisplay` (Tarefa 2).
- Produces: `<NotificationsSection settings={NotificationSettings} />` e `<WhatsAppPhoneForm phone={string | null} />`.

Fica dentro da página de Configurações, sem item novo no menu. O visual segue o do antigo `pacing-email-toggle.tsx`: card `rounded-lg border bg-white p-6` com `max-w-2xl`. Para os seletores, use `<select>` nativo com a mesma classe dos outros selects do app.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const m = vi.hoisted(() => ({
  setNotificationFrequency: vi.fn(async (..._a: unknown[]) => {}),
  requestWhatsAppCode: vi.fn(async (..._a: unknown[]) => ({ ok: true, phone: '+5511999998888' }) as unknown),
  confirmWhatsAppCode: vi.fn(async (..._a: unknown[]) => ({ ok: true, phone: '+5511999998888' }) as unknown),
  removeWhatsApp: vi.fn(async () => {}),
  refresh: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/lib/notifications/preferences-actions', () => ({ setNotificationFrequency: m.setNotificationFrequency }))
vi.mock('@/lib/notifications/whatsapp-verification-actions', () => ({
  requestWhatsAppCode: m.requestWhatsAppCode,
  confirmWhatsAppCode: m.confirmWhatsAppCode,
  removeWhatsApp: m.removeWhatsApp,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: m.toast }) }))

import { NotificationsSection } from '@/app/(app)/settings/notifications-section'
import type { NotificationSettings } from '@/lib/notifications/notification-settings'

const semNumero: NotificationSettings = {
  whatsappPhone: null,
  whatsappVerified: false,
  orgs: [
    { orgId: 'o1', orgName: 'Pessoal', frequencies: { email: 'alerts', whatsapp: 'off' } },
    { orgId: 'o2', orgName: 'Empresa', frequencies: { email: 'off', whatsapp: 'off' } },
  ],
}

describe('NotificationsSection', () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockClear()))

  it('mostra uma linha por org com a frequência atual', () => {
    render(<NotificationsSection settings={semNumero} />)
    expect((screen.getByLabelText('E-mail — Pessoal') as HTMLSelectElement).value).toBe('alerts')
    expect((screen.getByLabelText('E-mail — Empresa') as HTMLSelectElement).value).toBe('off')
  })

  it('WhatsApp fica desabilitado sem número verificado', () => {
    render(<NotificationsSection settings={semNumero} />)
    expect((screen.getByLabelText('WhatsApp — Pessoal') as HTMLSelectElement).disabled).toBe(true)
  })

  it('WhatsApp habilitado com número verificado', () => {
    render(
      <NotificationsSection
        settings={{
          ...semNumero, whatsappPhone: '+5511999998888', whatsappVerified: true,
          orgs: semNumero.orgs.map((o) => ({ ...o, frequencies: { ...o.frequencies, whatsapp: 'weekly' } })),
        }}
      />,
    )
    const sel = screen.getByLabelText('WhatsApp — Pessoal') as HTMLSelectElement
    expect(sel.disabled).toBe(false)
    expect(sel.value).toBe('weekly')
    expect(screen.getByText('+55 11 99999-8888')).toBeDefined()
  })

  it('trocar a frequência grava só aquela org e canal', async () => {
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.change(screen.getByLabelText('E-mail — Empresa'), { target: { value: 'daily' } })
    await waitFor(() => expect(m.setNotificationFrequency).toHaveBeenCalledWith('o2', 'email', 'daily'))
  })

  it('se gravar falha, volta o valor anterior', async () => {
    m.setNotificationFrequency.mockRejectedValueOnce(new Error('x'))
    render(<NotificationsSection settings={semNumero} />)
    const sel = screen.getByLabelText('E-mail — Pessoal') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'daily' } })
    await waitFor(() => expect(sel.value).toBe('alerts'))
  })

  it('cadastro do número: envia código, confirma e recarrega', async () => {
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.change(screen.getByLabelText('Número de WhatsApp'), { target: { value: '(11) 99999-8888' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    await waitFor(() => expect(m.requestWhatsAppCode).toHaveBeenCalledWith('(11) 99999-8888'))

    fireEvent.change(await screen.findByLabelText('Código recebido'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(m.confirmWhatsAppCode).toHaveBeenCalledWith('123456'))
    await waitFor(() => expect(m.refresh).toHaveBeenCalled())
  })

  it('mostra o motivo quando o número já está em uso', async () => {
    m.requestWhatsAppCode.mockResolvedValueOnce({ ok: false, error: 'in_use' })
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.change(screen.getByLabelText('Número de WhatsApp'), { target: { value: '11999998888' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(await screen.findByText('Este número já está em uso em outra conta do floow.')).toBeDefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/notifications-section.test.tsx`
Expected: FAIL (componentes não existem)

- [ ] **Step 3: Criar `whatsapp-phone-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatPhoneDisplay } from '@/lib/notifications/phone'
import {
  requestWhatsAppCode, confirmWhatsAppCode, removeWhatsApp,
} from '@/lib/notifications/whatsapp-verification-actions'

const ERROS: Record<string, string> = {
  invalid_phone: 'Número inválido. Use DDD + celular, ex.: (11) 99999-8888.',
  in_use: 'Este número já está em uso em outra conta do floow.',
  rate_limited: 'Muitos códigos pedidos. Tente de novo em uma hora.',
  send_failed: 'Não conseguimos enviar o código agora. Tente de novo em alguns minutos.',
  no_pending: 'Peça um código primeiro.',
  expired: 'O código expirou. Peça outro.',
  too_many_attempts: 'Tentativas esgotadas. Peça outro código.',
  wrong_code: 'Código incorreto.',
}

type Etapa = 'numero' | 'codigo'

export function WhatsAppPhoneForm({ phone }: { phone: string | null }) {
  const router = useRouter()
  const { toast } = useToast()
  const [editando, setEditando] = useState(phone === null)
  const [etapa, setEtapa] = useState<Etapa>('numero')
  const [numero, setNumero] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar() {
    setOcupado(true)
    setErro(null)
    try {
      const r = await requestWhatsAppCode(numero)
      if (r.ok) setEtapa('codigo')
      else setErro(ERROS[r.error])
    } catch {
      setErro(ERROS.send_failed)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    setOcupado(true)
    setErro(null)
    try {
      const r = await confirmWhatsAppCode(codigo)
      if (!r.ok) return setErro(ERROS[r.error])
      toast('WhatsApp verificado')
      setEditando(false)
      setEtapa('numero')
      setCodigo('')
      router.refresh()
    } catch {
      setErro('Não foi possível confirmar agora.')
    } finally {
      setOcupado(false)
    }
  }

  async function remover() {
    setOcupado(true)
    try {
      await removeWhatsApp()
      toast('WhatsApp removido')
      setEditando(true)
      router.refresh()
    } catch {
      toast('Não foi possível remover o número', 'error')
    } finally {
      setOcupado(false)
    }
  }

  if (phone && !editando) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{formatPhoneDisplay(phone)}</span>
        <span className="text-xs text-green-700">Verificado</span>
        <Button variant="ghost" size="sm" onClick={() => setEditando(true)} disabled={ocupado}>
          Trocar
        </Button>
        <Button variant="ghost" size="sm" onClick={remover} disabled={ocupado}>
          Remover
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {etapa === 'numero' ? (
        <div className="flex gap-2">
          <Input
            aria-label="Número de WhatsApp"
            placeholder="(11) 99999-8888"
            inputMode="tel"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="max-w-xs"
          />
          <Button variant="primary" onClick={enviar} disabled={ocupado || !numero.trim()}>
            Enviar código
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            aria-label="Código recebido"
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="max-w-[10rem]"
          />
          <Button variant="primary" onClick={confirmar} disabled={ocupado || codigo.trim().length !== 6}>
            Confirmar
          </Button>
          <Button variant="ghost" onClick={() => setEtapa('numero')} disabled={ocupado}>
            Reenviar
          </Button>
        </div>
      )}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {phone && (
        <Button variant="link" size="sm" onClick={() => setEditando(false)}>
          Manter {formatPhoneDisplay(phone)}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Criar `notifications-section.tsx`**

```tsx
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
```

- [ ] **Step 5: Ligar na página**

Em `apps/web/app/(app)/settings/page.tsx`, acrescente os imports:

```tsx
import { NotificationsSection } from './notifications-section'
import { getNotificationSettings } from '@/lib/notifications/preferences-actions'
```

Depois de `const meta = ...`, adicione `const notificationSettings = await getNotificationSettings()`. Logo após `<SettingsForm ... />`, adicione `<NotificationsSection settings={notificationSettings} />`.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @floow/web test -- __tests__/notifications/notifications-section.test.tsx`
Expected: PASS

Run: `pnpm --filter @floow/web typecheck`
Expected: PASS

- [ ] **Step 7: Ver na tela**

Use a skill `run` para subir o app e abrir `/settings` logado. Confira três coisas: a grade mostra as orgs do usuário; a coluna WhatsApp aparece desabilitada; trocar a frequência do e-mail mostra "Preferência salva". Se o login cair numa org sem dados, lembre que o usuário tem três orgs (ver memória).

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add "apps/web/app/(app)/settings/notifications-section.tsx" "apps/web/app/(app)/settings/whatsapp-phone-form.tsx" "apps/web/app/(app)/settings/page.tsx" apps/web/__tests__/notifications/notifications-section.test.tsx
git commit -m "feat(notificacoes): tela de notificações por org com WhatsApp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
