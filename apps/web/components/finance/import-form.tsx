'use client'

import { useState, useRef, useEffect } from 'react'
import { parseOFXFile, parseCSVFile, lerCabecalhoCsv, type NormalizedTransaction, type CsvColumnMapping } from '@floow/core-finance'
import { mapeamentoAutomatico } from '@/lib/finance/mapear-colunas-csv'
import type { Account } from '@floow/db'
import { previewImport, importSelectedTransactions, type PreviewItem, type TransactionOverride } from '@/lib/finance/import-actions'
import { ImportPreview } from './import-preview'
import { ImportReview } from './import-review'
import { ImportacaoConcluida } from './importacao-concluida'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EtapasDaImportacao } from './etapas-da-importacao'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'select-file' | 'preview' | 'reconciliation' | 'review' | 'importing' | 'done'

interface ImportDoneResult {
  imported: number
  skipped: number
  lote?: string
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

interface CategoryOption {
  id: string
  name: string
  type: string
}

interface ImportFormProps {
  accounts: Account[]
  categories: CategoryOption[]
}

const LAST_ACCOUNT_KEY = 'floow:import-last-account'

export function ImportForm({ accounts, categories }: ImportFormProps) {
  const [step, setStep] = useState<Step>('select-file')
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')

  // Restore last used account from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LAST_ACCOUNT_KEY)
    if (saved && accounts.some((a) => a.id === saved)) {
      setSelectedAccountId(saved)
    }
  }, [accounts])
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
  const [verificando, setVerificando] = useState(false)
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [reconciling, setReconciling] = useState(false)
  const [reviewSelectedIndices, setReviewSelectedIndices] = useState<number[]>([])
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
        // CSV: cabeçalho com o separador detectado (vírgula ou ponto e vírgula)
        const headers = lerCabecalhoCsv(content)
        const autoMapping = mapeamentoAutomatico(headers)
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
    setVerificando(true)

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
      setError(mensagemDeErro(err, 'Erro ao analisar transações'))
    } finally {
      setVerificando(false)
    }
  }

  function handleGoToReview(selectedIndices: number[]) {
    setReviewSelectedIndices(selectedIndices)
    setStep('review')
  }

  async function handleFinalImport(selectedIndices: number[], overrides: TransactionOverride[]) {
    if (!selectedFile || !selectedAccountId) return
    setReconciling(true)
    setStep('importing')
    setError(null)

    try {
      const formData = new FormData()
      formData.set('file', selectedFile)
      formData.set('accountId', selectedAccountId)
      formData.set('selectedIndices', JSON.stringify(selectedIndices))
      formData.set('overrides', JSON.stringify(overrides))

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
      setError(mensagemDeErro(err, 'Erro ao importar transações'))
      setStep('review')
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
    setReviewSelectedIndices([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const isOFX = selectedFile?.name.toLowerCase().endsWith('.ofx') ?? false

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <EtapasDaImportacao step={step} />
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
              <Select value={selectedAccountId} onValueChange={(v) => { setSelectedAccountId(v); localStorage.setItem(LAST_ACCOUNT_KEY, v) }}>
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
                Suportamos arquivos OFX (Itaú, Bradesco, BB) e CSV (qualquer banco).
              </p>
            </div>

            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
              Importação anterior incompleta? Selecione o mesmo arquivo novamente — duplicatas são ignoradas automaticamente.
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
                <Button variant="primary" onClick={handleReconciliation} disabled={preview.length === 0 || verificando}>
                  {verificando ? 'Verificando...' : 'Verificar duplicatas'}
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
          onConfirm={handleGoToReview}
          onCancel={handleReset}
          loading={reconciling}
        />
      )}

      {/* Step 3: Review & Categorize */}
      {step === 'review' && (
        <ImportReview
          items={previewItems}
          selectedIndices={reviewSelectedIndices}
          accounts={accounts}
          sourceAccountId={selectedAccountId}
          categories={categories}
          onConfirm={handleFinalImport}
          onBack={() => setStep('reconciliation')}
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
        <ImportacaoConcluida resultado={result} accountId={selectedAccountId} onNovaImportacao={handleReset} />
      )}
    </div>
  )
}
