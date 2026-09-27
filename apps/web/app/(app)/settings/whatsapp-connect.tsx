'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatPhoneDisplay } from '@/lib/notifications/phone'
import {
  startWhatsAppLink, getWhatsAppStatus, removeWhatsApp,
} from '@/lib/notifications/whatsapp-verification-actions'

const POLL_MS = 4000
const CODE_TTL_MS = 10 * 60 * 1000

const ERROS: Record<string, string> = {
  rate_limited: 'Muitos códigos gerados. Tente de novo em uma hora.',
  not_configured: 'WhatsApp ainda não está disponível.',
  falha: 'Não foi possível gerar o código agora.',
}

interface Codigo {
  code: string
  link: string
  qrSvg: string
}

/**
 * Verificação invertida: a tela mostra um código e a pessoa o envia do próprio
 * WhatsApp (link wa.me ou QR). Enquanto o código está na tela, consulta o
 * status a cada 4 s — o webhook é quem liga o número.
 */
export function WhatsAppConnect({ phone }: { phone: string | null }) {
  const router = useRouter()
  const { toast } = useToast()
  const [editando, setEditando] = useState(phone === null)
  const [codigo, setCodigo] = useState<Codigo | null>(null)
  const [expirou, setExpirou] = useState(false)
  const [verificado, setVerificado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)

  useEffect(() => {
    if (!codigo) return
    let ativo = true
    const parar = () => {
      ativo = false
      clearInterval(intervalo)
      clearTimeout(prazo)
    }
    const intervalo = setInterval(async () => {
      try {
        const s = await getWhatsAppStatus()
        if (!ativo || !s.verified) return
        parar()
        setVerificado(s.phone)
        setCodigo(null)
        setEditando(false)
        toast('WhatsApp conectado')
        router.refresh()
      } catch {
        // Falha pontual de rede: tenta de novo no próximo ciclo.
      }
    }, POLL_MS)
    const prazo = setTimeout(() => {
      parar()
      setCodigo(null)
      setExpirou(true)
    }, CODE_TTL_MS)
    return parar
  }, [codigo, router, toast])

  async function gerar() {
    setOcupado(true)
    setErro(null)
    setExpirou(false)
    try {
      const r = await startWhatsAppLink()
      if (r.ok) setCodigo({ code: r.code, link: r.link, qrSvg: r.qrSvg })
      else setErro(ERROS[r.error])
    } catch {
      setErro(ERROS.falha)
    } finally {
      setOcupado(false)
    }
  }

  async function remover() {
    setOcupado(true)
    try {
      await removeWhatsApp()
      setConfirmandoRemocao(false)
      setVerificado(null)
      toast('WhatsApp removido')
      setEditando(true)
      router.refresh()
    } catch {
      toast('Não foi possível remover o número', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const atual = verificado ?? phone
  if (atual && !editando) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-green-700">Verificado ✓</span>
        <span className="text-sm font-medium">{formatPhoneDisplay(atual)}</span>
        <Button variant="ghost" size="sm" onClick={() => setEditando(true)} disabled={ocupado}>
          Trocar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmandoRemocao(true)} disabled={ocupado}>
          Remover
        </Button>
        <ConfirmDialog
          open={confirmandoRemocao}
          onClose={() => setConfirmandoRemocao(false)}
          onConfirm={remover}
          title="Remover WhatsApp"
          description="Você deixa de receber os avisos por WhatsApp. Para voltar, será preciso conectar o número de novo."
          confirmLabel="Remover número"
          loading={ocupado}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {codigo ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="space-y-2">
            <p className="font-mono text-2xl font-semibold tracking-widest">{codigo.code}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="primary">
                <a href={codigo.link} target="_blank" rel="noopener noreferrer">
                  Abrir no WhatsApp
                </a>
              </Button>
              <Button variant="ghost" onClick={gerar} disabled={ocupado}>
                Gerar outro código
              </Button>
            </div>
            <p className="max-w-xs text-xs text-muted-foreground">
              Envie a mensagem pelo WhatsApp do número que vai receber os avisos. O código vale 10 minutos.
            </p>
          </div>
          {/* SVG gerado no servidor pela lib qrcode a partir do nosso próprio link. */}
          <div
            aria-label="QR code para abrir no WhatsApp"
            role="img"
            className="h-36 w-36 shrink-0 [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: codigo.qrSvg }}
          />
        </div>
      ) : expirou ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">O código expirou. Gere outro.</p>
          <Button variant="primary" onClick={gerar} disabled={ocupado}>
            Gerar outro código
          </Button>
        </div>
      ) : (
        <Button variant="primary" onClick={gerar} disabled={ocupado}>
          Conectar WhatsApp
        </Button>
      )}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {atual && (
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setCodigo(null)
            setExpirou(false)
            setEditando(false)
          }}
        >
          Manter {formatPhoneDisplay(atual)}
        </Button>
      )}
    </div>
  )
}
