/**
 * Esqueletos de carregamento com o formato do conteúdo que vem: formulário,
 * lista ou painel de cartões. Usados pelos `loading.tsx` das telas.
 */
function Cabecalho() {
  return (
    <div className="space-y-2">
      <div className="h-7 w-48 rounded bg-gray-200" />
      <div className="h-4 w-80 max-w-full rounded bg-gray-100" />
    </div>
  )
}

export function EsqueletoDeFormulario() {
  return (
    <div role="status" aria-label="Carregando" className="max-w-2xl animate-pulse space-y-6">
      <Cabecalho />
      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3.5 w-28 rounded bg-gray-200" />
            <div className="h-9 w-full rounded-md bg-gray-100" />
          </div>
        ))}
        <div className="flex justify-end">
          <div className="h-9 w-32 rounded-md bg-gray-200" />
        </div>
      </div>
    </div>
  )
}

export function EsqueletoDeLista() {
  return (
    <div role="status" aria-label="Carregando" className="animate-pulse space-y-6">
      <Cabecalho />
      <div className="rounded-xl border border-gray-200 bg-white">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b border-gray-100 p-4 last:border-0">
            <div className="space-y-2">
              <div className="h-4 w-56 max-w-[60vw] rounded bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-24 rounded-md bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function EsqueletoDePainel() {
  return (
    <div role="status" aria-label="Carregando" className="animate-pulse space-y-6">
      <Cabecalho />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="mt-3 h-6 w-28 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-xl border border-gray-200 bg-white" />
    </div>
  )
}
