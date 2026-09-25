'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastOptions {
  /** Botão no próprio aviso — o "Desfazer" de uma exclusão, por exemplo. */
  acao?: { rotulo: string; onClick: () => void }
}

interface Toast {
  id: string
  message: string
  type: ToastType
  acao?: ToastOptions['acao']
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void
}

/**
 * Erro fica até o usuário fechar: costuma ter mais de uma frase e dizer o que
 * fazer, e sumir antes da leitura era perder a única pista. Aviso com ação
 * dura mais que o comum para dar tempo de clicar.
 */
const DURACAO_MS = 4000
export const DURACAO_COM_ACAO_MS = 8000

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success', options?: ToastOptions) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type, acao: options?.acao }])
    if (type === 'error') return
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, options?.acao ? DURACAO_COM_ACAO_MS : DURACAO_MS)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Valor estável: `toast` não muda, e um objeto novo a cada toast exibido ou
  // removido re-renderizava todos os consumidores do app — a lista de
  // transações inteira, duas vezes por aviso.
  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : undefined}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all ${
              t.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : t.type === 'error'
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            <span>{t.message}</span>
            {t.acao && (
              <button
                type="button"
                onClick={() => {
                  t.acao?.onClick()
                  dismiss(t.id)
                }}
                className="font-semibold underline underline-offset-2"
              >
                {t.acao.rotulo}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar aviso"
              className="ml-2 text-current opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
