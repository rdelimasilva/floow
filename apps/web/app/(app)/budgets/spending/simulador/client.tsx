'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, RotateCcw, X } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { aplicarSimulacao } from '@/lib/finance/simulador-actions'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InputMoeda, formatarMoedaDigitada } from '@/components/ui/input-moeda'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatBRL, currencyToCents } from '@floow/core-finance/src/balance'
import { rollUpSpendingToBudgeted } from '@/lib/finance/budgeted-spending'

interface Categoria {
  id: string
  name: string
  color: string | null
  parentId: string | null
}

interface LinhaVigente {
  categoryId: string
  plannedCents: number
  recorrentesCents: number
}

interface Linha extends LinhaVigente {
  /** Valor simulado como o campo mostra ("1.234,56"). */
  texto: string
}

interface Props {
  categories: Categoria[]
  planoVigente: LinhaVigente[]
  mediaPorCategoria: { categoryId: string | null; spent: number }[]
  mesesDaMedia: number
  selectedMonth: string
}

/** Campo vazio é zero: o InputMoeda apaga o "0,00" e `currencyToCents('')` dá NaN. */
function centavos(texto: string): number {
  return texto ? currencyToCents(texto) : 0
}

function linhasIniciais(plano: LinhaVigente[]): Linha[] {
  return plano.map((l) => ({ ...l, texto: formatarMoedaDigitada(String(l.plannedCents)) }))
}

function Diferenca({ cents }: { cents: number }) {
  if (cents === 0) return <span className="text-gray-500">—</span>
  // Gastar mais pesa contra o orçamento; cortar alivia
  return (
    <span className={cents > 0 ? 'text-red-600' : 'text-emerald-600'}>
      {cents > 0 ? '+' : '−'}
      {formatBRL(Math.abs(cents))}
    </span>
  )
}

export function SimuladorClient({ categories, planoVigente, mediaPorCategoria, mesesDaMedia, selectedMonth }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [linhas, setLinhas] = useState(() => linhasIniciais(planoVigente))
  const [confirmando, setConfirmando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const nomes = new Map(categories.map((c) => [c.id, c]))
  // Média das subcategorias sobe para a categoria simulada, como no realizado do plano
  const media = new Map(
    rollUpSpendingToBudgeted(mediaPorCategoria, categories, linhas).map((m) => [m.categoryId, m.spent]),
  )
  const naSimulacao = new Set(linhas.map((l) => l.categoryId))
  const disponiveis = categories.filter((c) => !naSimulacao.has(c.id))

  const totalVigente = linhas.reduce((s, l) => s + l.plannedCents, 0)
  const totalSimulado = linhas.reduce((s, l) => s + centavos(l.texto), 0)
  const totalMedia = linhas.reduce((s, l) => s + (media.get(l.categoryId) ?? 0), 0)
  const diferenca = totalSimulado - totalVigente
  const mudou = linhas.length !== planoVigente.length || linhas.some((l) => centavos(l.texto) !== l.plannedCents)

  function alterar(categoryId: string, texto: string) {
    setLinhas((prev) => prev.map((l) => (l.categoryId === categoryId ? { ...l, texto } : l)))
  }

  function adicionar(categoryId: string) {
    // Já com as subcategorias dela somadas, como fica depois de entrar na lista
    const sugestao =
      rollUpSpendingToBudgeted(mediaPorCategoria, categories, [...linhas, { categoryId }]).find(
        (m) => m.categoryId === categoryId,
      )?.spent ?? 0
    setLinhas((prev) => [
      ...prev,
      { categoryId, plannedCents: 0, recorrentesCents: 0, texto: formatarMoedaDigitada(String(sugestao)) },
    ])
  }

  function retirar(linha: Linha) {
    // Categoria do plano vigente fica na lista zerada, para o corte aparecer na diferença
    if (linha.plannedCents > 0) alterar(linha.categoryId, '')
    else setLinhas((prev) => prev.filter((l) => l.categoryId !== linha.categoryId))
  }

  const nomeDoMes = new Date(`${selectedMonth.slice(0, 7)}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  async function aplicar() {
    setAplicando(true)
    try {
      const r = await aplicarSimulacao(
        selectedMonth,
        linhas.map((l) => ({ categoryId: l.categoryId, simuladoCents: centavos(l.texto) })),
      )
      if ('error' in r) {
        toast(r.error, 'error')
        return
      }
      toast(r.alteradas === 1 ? '1 meta atualizada no plano' : `${r.alteradas} metas atualizadas no plano`)
      router.push(`/budgets/spending?month=${selectedMonth}`)
    } catch (err) {
      toast(mensagemDeErro(err, 'Não foi possível aplicar a simulação'), 'error')
    } finally {
      setAplicando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulador orçamentário"
        description="Teste mudanças a partir do plano vigente. Nada é gravado até você aplicar."
      >
        <Button variant="primary" size="sm" onClick={() => setConfirmando(true)} disabled={!mudou}>
          <Check className="h-4 w-4" /> Aplicar ao plano
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLinhas(linhasIniciais(planoVigente))} disabled={!mudou}>
          <RotateCcw className="h-4 w-4" /> Recomeçar
        </Button>
        <Link
          href={`/budgets/spending?month=${selectedMonth}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4A5899] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao plano
        </Link>
      </PageHeader>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-4 md:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Plano vigente</p>
            <p className="text-xl font-semibold text-gray-900">{formatBRL(totalVigente)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Simulado</p>
            <p className="text-xl font-semibold text-gray-900">{formatBRL(totalSimulado)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Diferença por mês</p>
            <p className="text-xl font-semibold"><Diferenca cents={diferenca} /></p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Em 12 meses</p>
            <p className="text-xl font-semibold"><Diferenca cents={diferenca * 12} /></p>
          </div>
          {mesesDaMedia > 0 && (
            <p className="col-span-full text-xs text-gray-500">
              Nas mesmas categorias, você gastou em média {formatBRL(totalMedia)} por mês nos últimos {mesesDaMedia} meses fechados.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Metas simuladas</CardTitle>
          {disponiveis.length > 0 && (
            <div className="w-full sm:w-64">
              {/* key reinicia o Select, para ele voltar ao placeholder depois de cada escolha */}
              <Select key={linhas.length} onValueChange={adicionar}>
                <SelectTrigger aria-label="Adicionar categoria à simulação">
                  <SelectValue placeholder="Adicionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Sem metas no plano deste mês. Adicione categorias para montar uma simulação.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Categoria</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Vigente</th>
                    {mesesDaMedia > 0 && (
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Média</th>
                    )}
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Simulado</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Diferença</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {linhas.map((l) => {
                    const cat = nomes.get(l.categoryId)
                    const simulado = centavos(l.texto)
                    return (
                      <tr key={l.categoryId}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">
                          {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
                          {cat?.name ?? '—'}
                          {simulado < l.recorrentesCents && (
                            <p className="mt-0.5 text-xs font-normal text-amber-700">
                              Abaixo dos {formatBRL(l.recorrentesCents)} que as recorrentes já comprometem
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-500">
                          {l.plannedCents > 0 ? formatBRL(l.plannedCents) : 'nova'}
                        </td>
                        {mesesDaMedia > 0 && (
                          <td className="px-4 py-2 text-sm text-right text-gray-500">{formatBRL(media.get(l.categoryId) ?? 0)}</td>
                        )}
                        <td className="px-4 py-2 text-right">
                          <InputMoeda
                            value={l.texto}
                            onChange={(e) => alterar(l.categoryId, e.target.value)}
                            aria-label={`Valor simulado para ${cat?.name ?? 'a categoria'}`}
                            className="ml-auto h-8 w-32 text-right"
                          />
                        </td>
                        <td className="px-4 py-2 text-sm text-right"><Diferenca cents={simulado - l.plannedCents} /></td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => retirar(l)}
                            aria-label={`Tirar ${cat?.name ?? 'categoria'} da simulação`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirm={aplicar}
        title="Aplicar ao plano"
        description={`As metas simuladas passam a valer de ${nomeDoMes} em diante. Os meses anteriores continuam como estão.`}
        confirmLabel="Aplicar"
        loading={aplicando}
      />
    </div>
  )
}
