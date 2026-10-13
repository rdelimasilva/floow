'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'
import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import { vincularPrevisao, marcarSemVinculo, classificarSoEste } from '@/lib/finance/conciliacao/vincular-actions'
import { aprovarDuplicata, recusarDuplicata } from '@/lib/finance/duplicata-actions'
import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { reduzir, type Evento } from './estado-da-fila'
import { decisaoCompleta, decisaoInicial, type AccountOption, type CategoryOption, type Decisao } from './card-classificar'
import { palpiteDe } from './palpite'
import { LinhaDaFila } from './linha-da-fila'
import { TudoConciliado } from './tudo-conciliado'

export type { CategoryOption, AccountOption } from './card-classificar'

type Props = { itens: ItemDaFila[]; total: number; categoryOptions: CategoryOption[]; accountOptions: AccountOption[] }

/**
 * A lista só lê `itens` ao montar: cada action revalida a página e traz props
 * novas, e reaplicá-las no meio de gravações em curso traria de volta linhas
 * que já sumiram. Quando a lista esvazia e o servidor tem mais, pede o
 * próximo lote e remonta com o que chegar.
 */
export function ListaConciliar(props: Props) {
  const router = useRouter()
  const [lote, setLote] = useState(0)
  const [base, setBase] = useState<ItemDaFila[] | null>(null)
  if (base && props.itens !== base) {
    setBase(null)
    setLote((l) => l + 1)
  }
  function pedirProximoLote() {
    setBase(props.itens)
    router.refresh()
  }
  return <Lista key={lote} {...props} pedirProximoLote={pedirProximoLote} />
}

function Lista({ itens: iniciais, total, categoryOptions, accountOptions, pedirProximoLote }: Props & { pedirProximoLote: () => void }) {
  const { toast } = useToast()
  const [estado, despachar] = useReducer(reduzir, { itens: iniciais, feitos: 0 })
  // Linhas cuja gravação está em curso: somem no clique (spec §2.4).
  const [gravando, setGravando] = useState<Set<string>>(new Set())
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  const [rascunhos, setRascunhos] = useState<Map<string, Decisao>>(new Map())
  // Uma gravação por vez, na ordem dos cliques: o servidor decide em cima do anterior.
  const cadeia = useRef<Promise<void>>(Promise.resolve())

  const visiveis = estado.itens.filter((i) => !gravando.has(i.id))
  const decisaoDe = (item: ItemDaFila): Decisao | null =>
    item.classificacao ? rascunhos.get(item.id) ?? decisaoInicial(item.classificacao, item.conta.id) : null
  const palpites = new Map(visiveis.map((i) => [i.id, palpiteDe(i, decisaoDe(i), categoryOptions, accountOptions)]))
  const marcaveis = visiveis.filter((i) => palpites.get(i.id)?.marcavel)
  const marcadosVisiveis = visiveis.filter((i) => marcados.has(i.id))

  // Um lote que já chegou vazio é o fim de verdade; pedir de novo seria um laço.
  const carregando = visiveis.length === 0 && gravando.size === 0 && estado.feitos < total && iniciais.length > 0
  useEffect(() => {
    if (carregando) pedirProximoLote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando])

  function gravar(item: ItemDaFila, fn: () => Promise<Evento[]>) {
    const id = item.id
    setGravando((s) => new Set(s).add(id))
    setMarcados((s) => { const n = new Set(s); n.delete(id); return n })
    setAberto((a) => (a === id ? null : a))
    cadeia.current = cadeia.current.then(async () => {
      try {
        for (const e of await fn()) despachar(e)
      } catch (error) {
        toast(mensagemDeErro(error, 'Não foi possível salvar'), 'error')
      } finally {
        // Ainda com algo a decidir (ex.: vinculou e falta a categoria), a linha volta com o próximo palpite.
        setGravando((s) => { const n = new Set(s); n.delete(id); return n })
      }
    })
  }

  const descartar = (item: ItemDaFila) => gravar(item, async () => {
    if (!item.repetido) return []
    const { efetivada } = await aprovarDuplicata(item.repetido.propostaId)
    if (!efetivada) toast('Este repetido já foi resolvido.', 'info')
    return [{ tipo: 'resolvido', id: item.id }]
  })

  const naoERepetido = (item: ItemDaFila) => gravar(item, async () => {
    if (!item.repetido) return []
    await recusarDuplicata(item.repetido.propostaId)
    return [{ tipo: 'semRepetido', id: item.id }]
  })

  const vincular = (item: ItemDaFila, c: Candidata) => gravar(item, async () => {
    const { efetivada, classificou } = await vincularPrevisao(item.id, c.id)
    if (!efetivada) {
      toast('Esta previsão não está mais disponível.', 'info')
      return [{ tipo: 'candidataRecusada', id: item.id, previsaoId: c.id }]
    }
    // Quem sabe se o lançamento saiu de pendente é o servidor: a perna de
    // transferência não tem categoria e classifica; a previsão com categoria
    // apagada tem nome na tela e não classifica.
    return [{ tipo: 'vinculado', id: item.id, previsaoId: c.id, classificou }]
  })

  const nenhum = (item: ItemDaFila) => gravar(item, async () => {
    await marcarSemVinculo(item.id)
    return [{ tipo: 'semVinculo', id: item.id }]
  })

  // Com previsões parecidas, lançar como novo é também dizer "não é nenhuma".
  // A decisão é lida no clique: a linha some e o rascunho não pode mudar depois.
  const lancar = (item: ItemDaFila) => {
    const c = item.classificacao
    const d = decisaoDe(item)
    if (!c || !d || !decisaoCompleta(d, item.conta.id)) return
    gravar(item, async () => {
      const eventos: Evento[] = []
      if (item.candidatas.length > 0) {
        await marcarSemVinculo(item.id)
        eventos.push({ tipo: 'semVinculo', id: item.id })
      }
      const escolha = {
        nature: d.nature,
        categoryId: d.nature === 'transfer' ? null : d.categoryId,
        transferAccountId: d.nature === 'transfer' ? d.transferAccountId : null,
      }
      if (d.regra) {
        await confirmCounterparty({ counterpartyId: c.counterpartyId, ...escolha })
        return [...eventos, { tipo: 'regraConfirmada', counterpartyId: c.counterpartyId }]
      }
      const r = await classificarSoEste({ transactionId: item.id, counterpartyId: c.counterpartyId, ...escolha })
      // Recusado pelo servidor: a linha volta para corrigir.
      if ('error' in r) {
        toast(r.error, 'error')
        return eventos
      }
      return [...eventos, { tipo: 'resolvido', id: item.id }]
    })
  }

  function aplicarPalpite(item: ItemDaFila) {
    const p = palpites.get(item.id)
    if (!p) return
    if (p.acao === 'descartar') descartar(item)
    else if (p.acao === 'vincular') vincular(item, item.candidatas[0])
    else if (p.acao === 'lancar') lancar(item)
    else setAberto(item.id)
  }

  function confirmarMarcados() {
    for (const item of marcadosVisiveis) aplicarPalpite(item)
  }

  const marcarTodos = (sim: boolean) => setMarcados(sim ? new Set(marcaveis.map((i) => i.id)) : new Set())
  const marcar = (id: string, sim: boolean) => setMarcados((s) => {
    const n = new Set(s)
    if (sim) n.add(id)
    else n.delete(id)
    return n
  })

  if (visiveis.length === 0) {
    if (gravando.size > 0) return <p className="py-10 text-center text-sm text-gray-600">Salvando…</p>
    if (carregando) return <p className="py-10 text-center text-sm text-gray-600">Carregando os próximos…</p>
    return <TudoConciliado />
  }

  const pendentes = Math.max(visiveis.length, total - estado.feitos - gravando.size)
  const todosMarcados = marcaveis.length > 0 && marcaveis.every((i) => marcados.has(i.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-3 text-sm text-gray-600">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            aria-label="Marcar todos"
            className="h-4 w-4 rounded border-gray-300"
            checked={todosMarcados}
            disabled={marcaveis.length === 0}
            onChange={(e) => marcarTodos(e.target.checked)}
          />
          Marcar todos
        </label>
        <span>{pendentes} {pendentes === 1 ? 'pendente' : 'pendentes'}</span>
      </div>

      <ul className="rounded-xl border border-gray-200 bg-white">
        {visiveis.map((item) => (
          <LinhaDaFila
            key={item.id}
            item={item}
            palpite={palpites.get(item.id)!}
            decisao={decisaoDe(item)}
            marcado={marcados.has(item.id)}
            aberto={aberto === item.id}
            onMarcar={(sim) => marcar(item.id, sim)}
            onAbrir={() => setAberto((a) => (a === item.id ? null : item.id))}
            onPalpite={() => aplicarPalpite(item)}
            acoes={{
              onDescartar: () => descartar(item),
              onNaoERepetido: () => naoERepetido(item),
              onVincular: (c) => vincular(item, c),
              onLancar: () => lancar(item),
              onNenhum: () => nenhum(item),
              onMudar: (d) => setRascunhos((m) => new Map(m).set(item.id, d)),
            }}
            categoryOptions={categoryOptions}
            accountOptions={accountOptions}
          />
        ))}
      </ul>

      {marcadosVisiveis.length > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <Button variant="primary" onClick={confirmarMarcados}>
            Confirmar {marcadosVisiveis.length} {marcadosVisiveis.length === 1 ? 'marcado' : 'marcados'}
          </Button>
        </div>
      )}
    </div>
  )
}
