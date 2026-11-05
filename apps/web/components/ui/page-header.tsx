interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  // No computador o cabeçalho fica preso sob a barra do app e só o conteúdo
  // rola. No celular não, para não tirar altura da tela.
  return (
    <div className="flex flex-col gap-3 bg-gray-50 sm:flex-row sm:items-start sm:justify-between sm:gap-4 md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top))] md:z-20 md:py-2">
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
