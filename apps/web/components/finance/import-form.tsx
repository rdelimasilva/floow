'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { parseOFXFile, parseCSVFile, type NormalizedTransaction, type CsvColumnMapping } from '@floow/core-finance'
import type { Account } from '@floow/db'
import { previewImport, importSelectedTransactions, type PreviewItem } from '@/lib/finance/import-actions'
import { ImportPreview } from './import-preview'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'select-file' | 'preview' | 'reconciliation' | 'importing' | 'done'

interface ImportDoneResult {
  imported: number
  skipped: number
}

// Common CSV column name heuristics for auto-detection
const DATE_HEADERS = ['data', 'date', 'dt', 'data lançamento', 'data lancamento']
const AMOUNT_HEADERS = ['valor', 'amount', 'value', 'vlr', 'valor (em r$)', 'debit', 'credit']
const DESC_HEADERS = ['descricao', 'descrição', 'description', 'memo', 'historico', 'histórico', 'nome', 'name']

function detectColumn(headers: string[], candidates: string[]): string {
  const normalized = headers.map((h) => h.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = normalized.findIndex((h) => h === candidate || h.includes(candidate))
    if (idx >= 0) return headers[idx]
  }
  return headers[0] ?? ''
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100,
  )
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ImportFormProps {
  accounts: Account[]
}

export function ImportForm({ accounts }: ImportFormProps) {
  const [step, setStep] = useState<Step>('select-file')
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id ?? '')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<NormalizedTransaction[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvMapping, setCsvMapping] = useState<Required<CsvColumnMapping>>({
    dateColumn: '',
    amountColumn: '',
    descriptionColumn: '',
    dateFormat: 'dd/MM/yyyy',
  })
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportDoneResult | null>(null)
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [reconciling, setReconciling] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File selection handler ─────────────────────────────────────────────────

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setSelectedFile(file)

    try {
      const content = await file.text()
      setFileContent(content)
      const isOFX = file.name.toLowerCase().endsWith('.ofx')

      if (isOFX) {
        const transactions = await parseOFXFile(content)
        setPreview(transactions)
        setStep('preview')
      } else {
        // CSV: detect headers first for column mapping UI
        const firstLine = content.split('\n')[0] ?? ''
        // Use papaparse-compatible header detection
        const headers = firstLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))

        const autoMapping: Required<CsvColumnMapping> = {
          dateColumn: detectColumn(headers, DATE_HEADERS),
          amountColumn: detectColumn(headers, AMOUNT_HEADERS),
          descriptionColumn: detectColumn(headers, DESC_HEADERS),
          dateFormat: 'dd/MM/yyyy',
        }
        setCsvHeaders(headers)
        setCsvMapping(autoMapping)

        // Parse with auto-detected mapping for initial preview
        const transactions = parseCSVFile(content, autoMapping)
        setPreview(transactions)
        setStep('preview')
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Erro ao processar arquivo: ${err.message}`
          : 'Erro desconhecido ao processar arquivo',
      )
    }
  }

  // ── CSV mapping change handler ─────────────────────────────────────────────

  function handleMappingChange(key: keyof Required<CsvColumnMapping>, value: string) {
    const newMapping = { ...csvMapping, [key]: value }
    setCsvMapping(newMapping)

    // Re-parse with cached content (no re-reading file from disk)
    if (fileContent) {
      try {
        const transactions = parseCSVFile(fileContent, newMapping)
        setPreview(transactions)
      } catch {
        // Silently ignore — mapping may be incomplete during user interaction
      }
    }
  }

  // ── Import submission ──────────────────────────────────────────────────────

  // After file preview, run server-side reconciliation
  async function handleReconciliation() {
    if (!selectedFile || !selectedAccountId) return
    setError(null)

    try {
      const formData = new FormData()
      formData.set('file', selectedFile)
      formData.set('accountId', selectedAccountId)

      const isCSV = !selectedFile.name.toLowerCase().endsWith('.ofx')
      if (isCSV) {
        formData.set('dateColumn', csvMapping.dateColumn)
        formData.set('amountColumn', csvMapping.amountColumn)
        formData.set('descriptionColumn', csvMapping.descriptionColumn)
        formData.set('dateFormat', csvMapping.dateFormat)
      }

      const items = await previewImport(formData)
      setPreviewItems(items)
      setStep('reconciliation')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao analisar transações')
    }
  }

  async function handleImportSelected(selectedIndices: number[]) {
    if (!selectedFile || !selectedAccountId) return
    setReconciling(true)
    setStep('importing')
    setError(null)

    try {
      const formData = new FormData()
      formData.set('file', selectedFile)
      formData.set('accountId', selectedAccountId)
      formData.set('selectedIndices', JSON.stringify(selectedIndices))

      const isCSV = !selectedFile.name.toLowerCase().endsWith('.ofx')
      if (isCSV) {
        formData.set('dateColumn', csvMapping.dateColumn)
        formData.set('amountColumn', csvMapping.amountColumn)
        formData.set('descriptionColumn', csvMapping.descriptionColumn)
        formData.set('dateFormat', csvMapping.dateFormat)
      }

      const importResult = await importSelectedTransactions(formData)
      setResult(importResult)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar transações')
      setStep('reconciliation')
    } finally {
      setReconciling(false)
    }
  }

  // ── Reset handler ──────────────────────────────────────────────────────────

  function handleReset() {
    setStep('select-file')
    setSelectedFile(null)
    setFileContent(null)
    setPreview([])
    setCsvHeaders([])
    setError(null)
    setResult(null)
    setPreviewItems([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const isOFX = selectedFile?.name.toLowerCase().endsWith('.ofx') ?? false

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Step 1: Select file */}
      {step === 'select-file' && (
        <Card>
          <CardHeader>
            <CardTitle>Selecionar arquivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Conta de destino</label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Arquivo OFX ou CSV
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ofx,.csv"
                onChange={handleFileSelect}
                disabled={!selectedAccountId}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-gray-100 file:text-gray-700
                  hover:file:bg-gray-200
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500">
                Suportamos arquivos OFX (Itau, Bradesco, BB) e CSV (qualquer banco).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <>
          {/* CSV column mapping */}
          {!isOFX && csvHeaders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Mapeamento de colunas</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Coluna de data</label>
                  <Select
                    value={csvMapping.dateColumn}
                    onValueChange={(v) => handleMappingChange('dateColumn', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Coluna de valor</label>
                  <Select
                    value={csvMapping.amountColumn}
                    onValueChange={(v) => handleMappingChange('amountColumn', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Coluna de descrição</label>
                  <Select
                    value={csvMapping.descriptionColumn}
                    onValueChange={(v) => handleMappingChange('descriptionColumn', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Formato de data</label>
                  <Select
                    value={csvMapping.dateFormat}
                    onValueChange={(v) =>
                      handleMappingChange(
                        'dateFormat',
                        v as 'dd/MM/yyyy' | 'yyyy-MM-dd',
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dd/MM/yyyy">dd/MM/yyyy (BR)</SelectItem>
                      <SelectItem value="yyyy-MM-dd">yyyy-MM-dd (ISO)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                Preview — {preview.length} transação{preview.length !== 1 ? 'es' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.slice(0, 100).map((tx, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(tx.date)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {tx.description || '—'}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              tx.type === 'income'
                                ? 'text-green-600 font-medium'
                                : 'text-red-600 font-medium'
                            }
                          >
                            {tx.type === 'income' ? 'Receita' : 'Despesa'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span
                            className={
                              tx.amountCents >= 0 ? 'text-green-600' : 'text-red-600'
                            }
                          >
                            {formatCents(tx.amountCents)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {preview.length > 100 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                          ... e mais {preview.length - 100} transações
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-3 mt-4">
                <Button onClick={handleReconciliation} disabled={preview.length === 0}>
                  Verificar duplicatas
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Step 2.5: Reconciliation */}
      {step === 'reconciliation' && (
        <ImportPreview
          items={previewItems}
          onConfirm={handleImportSelected}
          onCancel={handleReset}
          loading={reconciling}
        />
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
            <p className="text-sm text-gray-600">Importando transações...</p>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === 'done' && result && (
        <Card>
          <CardHeader>
            <CardTitle>Importação concluída</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
                <div className="text-3xl font-bold text-green-700">{result.imported}</div>
                <div className="text-sm text-green-600 mt-1">importadas</div>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-center">
                <div className="text-3xl font-bold text-gray-700">{result.skipped}</div>
                <div className="text-sm text-gray-600 mt-1">duplicadas (ignoradas)</div>
              </div>
            </div>

            <div className="flex gap-3">
              <Link href="/transactions">
                <Button>Ver transações</Button>
              </Link>
              <Button variant="outline" onClick={handleReset}>
                Importar outro arquivo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
