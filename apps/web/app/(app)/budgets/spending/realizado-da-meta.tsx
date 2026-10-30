import { formatBRL } from '@floow/core-finance/src/balance'

/** Realizado da linha; passou da meta, mostra em texto quanto passou. */
export function RealizadoDaMeta({ realizado, meta }: { realizado: number; meta: number }) {
  const acima = realizado - meta
  if (meta <= 0 || acima <= 0) return <>{formatBRL(realizado)}</>
  return (
    <>
      <span className="font-medium text-red-700">{formatBRL(realizado)}</span>
      <span className="block text-xs font-medium text-red-700">+{formatBRL(acima)} acima</span>
    </>
  )
}
