'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'
import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import { vincularPrevisao, marcarSemVinculo, classificarSoEste } from '@/lib/finance/conciliacao/vincular-actions'
import { aprovarDuplicata, recusarDuplicata } from '@/lib/finance/duplicata-actions'
import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { faseDe, reduzir, soRestamPulados } from './estado-da-fila'
import { CardConta, diaMes } from './card-conta'
import { CardRepetido } from './card-repetido'
import { CardCandidatos } from './card-candidatos'
import { CardClassificar, decisaoCompleta, decisaoInicial, type AccountOption, type CategoryOption, type Decisao } from './card-classificar'
import { ProcurarPrevisao } from './procurar-previsao'
import { TudoConciliado } from './tudo-conciliado'
import { ProgressoDaFila, RevisarPulados } from './progresso-da-fila'
import { useAtalhos } from './use-atalhos'

export type { CategoryOption, AccountOption } from './card-classificar'

type Props = { itens: ItemDaFila[]; total: number; categoryOptions: CategoryOption[]; accountOptions: AccountOption[] }

type Pedido = { base: ItemDaFila[]; modo: 'trocar' | 'anexar' }

/**
 * A fila só lê `itens` ao montar: as actions revalidam a página e trazem
 * props novas a cada decisão, e reaplicá-las no meio embaralharia pulados e
 * progresso. Quando o lote acaba, pede o próximo (spec §3.4) e remonta com o
 * que chegar. Quando só restam pulados e o servidor tem mais, pede o próximo
 * sem remontar: os novos entram na frente e os pulados seguem para revisar.
 */
export function FilaFoco(props: Props) {
  const router = useRouter()
  const [lote, setLote] = useState(0)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [anexo, setAnexo] = useState<ItemDaFila[] | null>(null)
  if (pedido && props.itens !== pedido.base) {
    setPedido(null)
    // Lote novo descarta o anexo do lote anterior: a `Fila` remontada o
    // reaplicaria e traria de volta itens já decididos.
    if (pedido.modo === 'trocar') {
      setLote((l) => l + 1)
      setAnexo(null)
    } else setAnexo(props.itens)
  }
  function pedir(modo: Pedido['modo']) {
    setPedido({ base: props.itens, modo })
    router.refresh()
  }
  return <Fila key={lote} {...props} anexo={anexo} pedirProximoLote={() => pedir('trocar')} pedirMais={() => pedir('anexar')} />
}

function Fila({ itens: iniciais, total: totalAoMontar, categoryOptions, accountOptions, anexo, pedirProximoLote, pedirMais }: Props & {
  anexo: ItemDaFila[] | null
  pedirProximoLote: () => void
  pedirMais: () => void
}) {
  const { toast } = useToast()
  const [estado, despachar] = useReducer(reduzir, { itens: iniciais, pulados: [], feitos: 0 })
  // O `total` das props muda a cada revalidação (é o que resta no servidor);
  // `feitos` conta a partir da montagem, então o total é o da montagem.
  const [total] = useState(totalAoMontar)
  const [ocupado, setOcupado] = useState(false)
  // O estado só muda no próximo render; a ref barra o segundo Enter no mesmo tique.
  const ocupadoRef = useRef(false)
  const [rascunho, setRascunho] = useState<{ id: string; d: Decisao } | null>(null)
  const [procurandoId, setProcurandoId] = useState<string | null>(null)
  // Um pedido de "mais" que não trouxe nada novo encerra os pedidos: senão, laço.
  const [semMais, setSemMais] = useState(false)

  const atual: ItemDaFila | undefined = estado.itens[0]
  const fase = atual ? faseDe(atual) : null
  // A decisão nasce do palpite de cada lançamento e é descartada quando ele sai da frente.
  const decisao = atual?.classificacao ? (rascunho?.id === atual.id ? rascunho.d : decisaoInicial(atual.classificacao, atual.conta.id)) : null
  const procurando = atual !== undefined && procurandoId === atual.id
  const restamPulados = soRestamPulados(estado)
  // Um lote que já chegou vazio é o fim de verdade; pedir de novo seria um laço.
  const carregando = estado.itens.length === 0 && estado.feitos < total && iniciais.length > 0

  useEffect(() => {
    if (carregando) pedirProximoLote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando])

  const buscarMais = restamPulados && !semMais && estado.feitos + estado.pulados.length < total
  useEffect(() => {
    if (buscarMais) pedirMais()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscarMais])

  useEffect(() => {
    if (!anexo) return
    const presentes = new Set(estado.itens.map((i) => i.id))
    if (anexo.some((i) => !presentes.has(i.id) && faseDe(i) !== null)) despachar({ tipo: 'loteAnexado', itens: anexo })
    else setSemMais(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anexo])

  async function executar(fn: (item: ItemDaFila) => Promise<void>) {
    if (ocupadoRef.current || !atual) return
    ocupadoRef.current = true
    setOcupado(true)
    try {
      await fn(atual)
    } catch (error) {
      toast(mensagemDeErro(error, 'Não foi possível salvar'), 'error')
    } finally {
      ocupadoRef.current = false
      setOcupado(false)
    }
  }

  const vincular = (c: Candidata) => executar(async (item) => {
    const { efetivada, classificou } = await vincularPrevisao(item.id, c.id)
    if (!efetivada) {
      toast('Esta previsão não está mais disponível. A fila foi atualizada.', 'info')
      despachar({ tipo: 'candidataRecusada', id: item.id, previsaoId: c.id })
      return
    }
    toast('Vinculado')
    setProcurandoId(null)
    // Quem sabe se o lançamento saiu de pendente é o servidor: a perna de
    // transferência não tem categoria e classifica; a previsão com categoria
    // apagada tem nome na tela e não classifica.
    despachar({ tipo: 'vinculado', id: item.id, previsaoId: c.id, classificou })
  })

  const nenhum = () => executar(async (item) => {
    await marcarSemVinculo(item.id)
    despachar({ tipo: 'semVinculo', id: item.id })
  })

  const descartar = () => executar(async (item) => {
    if (!item.repetido) return
    const { efetivada } = await aprovarDuplicata(item.repetido.propostaId)
    if (!efetivada) toast('Este repetido já foi resolvido. A fila foi atualizada.', 'info')
    despachar({ tipo: 'resolvido', id: item.id })
  })

  const naoERepetido = () => executar(async (item) => {
    if (!item.repetido) return
    await recusarDuplicata(item.repetido.propostaId)
    despachar({ tipo: 'semRepetido', id: item.id })
  })

  const confirmar = () => executar(async (item) => {
    const c = item.classificacao
    if (!c || !decisao || !decisaoCompleta(decisao, item.conta.id)) return
    const escolha = {
      nature: decisao.nature,
      categoryId: decisao.nature === 'transfer' ? null : decisao.categoryId,
      transferAccountId: decisao.nature === 'transfer' ? decisao.transferAccountId : null,
    }
    if (decisao.regra) {
      await confirmCounterparty({ counterpartyId: c.counterpartyId, ...escolha })
      despachar({ tipo: 'regraConfirmada', counterpartyId: c.counterpartyId })
      return
    }
    const r = await classificarSoEste({ transactionId: item.id, counterpartyId: c.counterpartyId, ...escolha })
    // Recusado pelo servidor: o lançamento segue na frente para corrigir.
    if ('error' in r) toast(r.error, 'error')
    else despachar({ tipo: 'resolvido', id: item.id })
  })

  const pular = () => { if (atual && !ocupadoRef.current) despachar({ tipo: 'pulado', id: atual.id }) }

  useAtalhos((e) => {
    if (ocupadoRef.current || !atual || restamPulados) return
    const n = Number(e.key)
    let acao: (() => void) | null = null
    if (e.key === 'ArrowRight') acao = pular
    else if (fase === 'repetido' && e.key === 'Enter') acao = descartar
    else if (fase === 'candidatas') {
      if (e.key === 'Enter') acao = () => vincular(atual.candidatas[0])
      else if (n >= 1 && n <= 3 && atual.candidatas[n - 1]) acao = () => vincular(atual.candidatas[n - 1])
      else if (e.key === 'n' || e.key === 'N') acao = nenhum
    } else if (fase === 'classificar' && e.key === 'Enter' && decisao && decisaoCompleta(decisao, atual.conta.id)) acao = confirmar
    if (!acao) return
    e.preventDefault()
    acao()
  })

  if (!atual) {
    if (carregando) return <p className="py-10 text-center text-sm text-gray-600">Carregando os próximos…</p>
    return <TudoConciliado />
  }

  const procurar = () => setProcurandoId(atual.id)

  return (
    <div className="space-y-3">
      <ProgressoDaFila feitos={estado.feitos} total={total} />

      {restamPulados ? (
        <RevisarPulados quantos={estado.pulados.length} onRevisar={() => despachar({ tipo: 'revisarPulados' })} />
      ) : (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <CardConta conta={atual.conta} cardLastDigits={atual.cardLastDigits} importedAt={atual.importedAt} />
          <p className="text-base text-gray-900">
            <span className="font-semibold">{atual.description}</span>
            <span className="font-semibold"> · {formatBRL(atual.amountCents)}</span>
            <span className="text-sm text-gray-500"> · {diaMes(atual.date)}</span>
          </p>
          {fase === 'repetido' && atual.repetido && (
            <CardRepetido repetido={atual.repetido} ocupado={ocupado} onDescartar={descartar} onNaoERepetido={naoERepetido} onPular={pular} />
          )}
          {fase === 'candidatas' && (
            <CardCandidatos candidatas={atual.candidatas} ocupado={ocupado} onVincular={vincular} onNenhum={nenhum} onProcurar={procurar} onPular={pular} />
          )}
          {fase === 'classificar' && atual.classificacao && decisao && (
            <CardClassificar
              classificacao={atual.classificacao}
              amountCents={atual.amountCents}
              contaDoItemId={atual.conta.id}
              decisao={decisao}
              onMudar={(d) => setRascunho({ id: atual.id, d })}
              categoryOptions={categoryOptions}
              accountOptions={accountOptions}
              ocupado={ocupado}
              onConfirmar={confirmar}
              onProcurar={procurar}
              onPular={pular}
            />
          )}
          {procurando && (
            <ProcurarPrevisao realizadoId={atual.id} ocupado={ocupado} onVincular={vincular} onFechar={() => setProcurandoId(null)} />
          )}
        </div>
      )}
    </div>
  )
}
