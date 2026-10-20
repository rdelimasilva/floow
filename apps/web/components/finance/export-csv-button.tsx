'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/ui/toast'

interface BotaoDeExportarProps {
  url: string
  /** Nome do arquivo sem a data, ex.: `transações.csv`. */
  arquivo: string
  rotulo: string
  erro: string
}

export function BotaoDeExportar({ url, arquivo, rotulo, erro }: BotaoDeExportarProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Erro ao exportar')

      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const [nome, extensao] = arquivo.split(/\.(?=[^.]+$)/)
      a.href = href
      a.download = `${nome}-${new Date().toISOString().split('T')[0]}.${extensao}`
      a.click()
      URL.revokeObjectURL(href)
    } catch {
      toast(erro, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      <Download className="h-4 w-4" />
      {loading ? 'Exportando...' : rotulo}
    </Button>
  )
}

/** Exporta a lista de transações com os filtros da tela. */
export function ExportCsvButton({ formato = 'csv' }: { formato?: 'csv' | 'xlsx' }) {
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  if (formato === 'xlsx') params.set('format', 'xlsx')
  return (
    <BotaoDeExportar
      url={`/api/transactions/export?${params.toString()}`}
      arquivo={`transações.${formato}`}
      rotulo={formato === 'xlsx' ? 'Exportar Excel' : 'Exportar CSV'}
      erro="Não foi possível exportar as transações. Tente de novo."
    />
  )
}
