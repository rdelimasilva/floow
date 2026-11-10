export function soDigitos(s: string): string {
  return s.replace(/\D/g, '')
}

/** `dd/MM/aaaa` → `aaaa-MM-dd`; data inexistente (31/02) → null. */
export function dataBr(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const [, d, mes, a] = m
  const iso = `${a}-${mes}-${d}`
  const dt = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null
}

/** Número com vírgula decimal (`20216,19`); vazio ou lixo → null. */
export function numeroBr(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
