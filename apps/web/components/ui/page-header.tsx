'use client'

import { useEffect, useRef } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  // Barras que ficam presas logo abaixo do cabeçalho (como os filtros de
  // Análises) leem a altura dele em --altura-cabecalho.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const raiz = document.documentElement
    const ro = new ResizeObserver(() => raiz.style.setProperty('--altura-cabecalho', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      raiz.style.removeProperty('--altura-cabecalho')
    }
  }, [])

  // No computador o cabeçalho fica preso sob a barra do app e só o conteúdo
  // rola. No celular não, para não tirar altura da tela.
  return (
    <div ref={ref} className="flex flex-col gap-3 bg-gray-50 sm:flex-row sm:items-start sm:justify-between sm:gap-4 md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top))] md:z-20 md:py-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
