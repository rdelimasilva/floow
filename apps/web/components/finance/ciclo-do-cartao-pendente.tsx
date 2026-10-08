'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { salvarCicloDoCartao } from '@/lib/finance/ciclo-do-cartao-actions'
import { DiasDoCartaoFields, erroDoCicloDoCartao } from './dias-do-cartao-fields'

interface Cartao {
  id: string
  name: string
}

/**
 * Cartão sem fechamento e vencimento cadastrados. Sem os dois dias o app não
 * sabe em que fatura cai cada compra, então pergunta ao cliente em vez de
 * adivinhar. Some quando todos os cartões têm o ciclo.
 */
export function CicloDoCartaoPendente({ cartoes }: { cartoes: Cartao[] }) {
  if (cartoes.length === 0) return null
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div>
        <p className="text-sm font-medium text-amber-900">
          {cartoes.length === 1 ? 'Falta o ciclo da fatura do seu cartão' : 'Falta o ciclo da fatura dos seus cartões'}
        </p>
        <p className="text-xs text-amber-800">
          Informe os dias que aparecem na fatura. Sem eles não dá para somar a fatura nem saber
          quando vence cada parcela.
        </p>
      </div>
      {cartoes.map((c) => <CicloDeUmCartao key={c.id} cartao={c} />)}
    </div>
  )
}

function CicloDeUmCartao({ cartao }: { cartao: Cartao }) {
  const router = useRouter()
  const { toast } = useToast()
  const [closingDay, setClosingDay] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [tentou, setTentou] = useState(false)
  const erro = erroDoCicloDoCartao(closingDay, dueDay)

  async function salvar() {
    setTentou(true)
    if (erro) return
    setSalvando(true)
    const r = await salvarCicloDoCartao(cartao.id, Number(closingDay), Number(dueDay))
    setSalvando(false)
    if (r.error) {
      toast(r.error, 'error')
      return
    }
    toast(`Ciclo do ${cartao.name} salvo`)
    router.refresh()
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-white p-3">
      <p className="text-sm font-medium text-gray-900">{cartao.name}</p>
      <DiasDoCartaoFields
        closingDay={closingDay} dueDay={dueDay}
        onClosingDayChange={setClosingDay} onDueDayChange={setDueDay}
        erro={tentou ? erro : null}
      />
      <Button size="sm" variant="primary" onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  )
}
