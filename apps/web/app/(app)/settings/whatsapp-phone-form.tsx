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
