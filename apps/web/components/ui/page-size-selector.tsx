'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'

const OPTIONS = [10, 20, 30, 50, 100] as const

interface PageSizeSelectorProps {
  current: number
}

export function PageSizeSelector({ current }: PageSizeSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    document.cookie = `tx-page-size=${value}; path=/; max-age=31536000; SameSite=Lax`
    const params = new URLSearchParams(searchParams.toString())
    params.set('pageSize', value)
    params.set('page', '1')
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500">
      Por página
      <select
        value={current}
        onChange={handleChange}
        className="h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-600"
      >
        {OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  )
}
