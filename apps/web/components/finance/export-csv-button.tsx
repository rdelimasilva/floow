'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/ui/toast'

export function ExportCsvButton() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function handleExport() {
    setLoading(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      const res = await fetch(`/api/transactions/export?${params.toString()}`)
      if (!res.ok) throw new Error('Erro ao exportar')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transações-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast('Não foi possível exportar as transações. Tente de novo.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      <Download className="h-4 w-4" />
      {loading ? 'Exportando...' : 'Exportar CSV'}
    </Button>
  )
}
