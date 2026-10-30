'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatBRL, currencyToCents } from '@floow/core-finance/src/balance'
import { createBudgetEntry, updateBudgetEntry, deleteBudgetEntry } from '@/lib/finance/budget-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface Meta {
  id: string
  plannedCents: number
  startMonth: string
  endMonth: string | null
}

interface Linha {
  categoryId: string
  nome: string
  meta: Meta | null
}

function form(dados: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(dados)) fd.set(k, v)
  return fd
}

function mesAnterior(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10)
}

/**
 * Meta que começou antes deste mês é encerrada no mês passado em vez de
 * alterada ou apagada: assim os meses anteriores continuam com a meta que tinham.
 */
async function encerrar(meta: Meta, mes: string) {
  if (meta.startMonth >= mes) return deleteBudgetEntry(form({ id: meta.id }))
  return updateBudgetEntry(form({
    id: meta.id,
    plannedCents: String(meta.plannedCents),
    startMonth: meta.startMonth,
    endMonth: mesAnterior(mes),
  }))
}

async function salvar(linha: Linha, centavos: number, mes: string) {
  if (linha.meta && linha.meta.startMonth >= mes) {
    return updateBudgetEntry(form({
      id: linha.meta.id,
      plannedCents: String(centavos),
      startMonth: linha.meta.startMonth,
      ...(linha.meta.endMonth ? { endMonth: linha.meta.endMonth } : {}),
    }))
  }
  if (linha.meta) await encerrar(linha.meta, mes)
  return createBudgetEntry(form({ type: 'spending', categoryId: linha.categoryId, plannedCents: String(centavos), startMonth: mes }))
}

function LinhaDeMeta({ linha, mes }: { linha: Linha; mes: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [pendente, startTransition] = useTransition()

  function executar(acao: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await acao()
        setEditando(false)
        router.refresh()
      } catch (e) {
        toast(mensagemDeErro(e, 'Não foi possível salvar a meta'), 'error')
      }
    })
  }

  function confirmar() {
    const centavos = currencyToCents(valor)
    // NaN cai aqui também: !NaN é true.
    if (!centavos || centavos <= 0) return toast('Informe um valor maior que zero', 'error')
    executar(() => salvar(linha, centavos, mes))
  }

  return (
    <li className="flex min-h-14 items-center justify-between gap-4 py-2">
      <span className="font-medium text-gray-800">{linha.nome}</span>
      {editando ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); confirmar() }}
        >
          <Input
            autoFocus
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="w-32 text-right"
            aria-label={`Meta de ${linha.nome}`}
          />
          <Button type="submit" size="sm" disabled={pendente}>Salvar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={pendente}>Cancelar</Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          {linha.meta ? (
            <>
              <span className="tabular-nums text-gray-900">{formatBRL(linha.meta.plannedCents)}</span>
              <Button size="sm" variant="ghost" onClick={() => { setValor((linha.meta!.plannedCents / 100).toFixed(2).replace('.', ',')); setEditando(true) }}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" className="text-gray-500" disabled={pendente} onClick={() => executar(() => encerrar(linha.meta!, mes))}>
                Remover
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => { setValor(''); setEditando(true) }}>
              Definir meta
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

export function ListaDeMetas({ linhas, mes }: { linhas: Linha[]; mes: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metas</CardTitle>
        <p className="text-sm text-gray-500">Quanto você quer gastar por mês em cada categoria. Vale a partir deste mês.</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {linhas.map((l) => <LinhaDeMeta key={l.categoryId} linha={l} mes={mes} />)}
        </ul>
      </CardContent>
    </Card>
  )
}
