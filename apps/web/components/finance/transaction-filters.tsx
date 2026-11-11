'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { AccountFilter } from './account-filter'
import { CardDigitsFilter } from './card-digits-filter'
import { PILULA_BASE, PILULA_OFF, PILULA_ON } from './filtros/pilula'
import { gravarRecorte, recorteDaUrl, recorteDoNavegador, type Recorte } from '@/lib/finance/recorte'
import { SeletorDePeriodo } from './filtros/seletor-de-periodo'
import { useFiltrosNaUrl } from './filtros/use-filtros-na-url'
import type { FinalDoCartao } from '@/lib/finance/queries-final-do-cartao'
import {
  detectActivePeriod,
  lembrarFiltros,
} from '@/lib/finance/filtros-lembrados'

// Filtros de coluna e ordenação vivem na tabela; trocar período, busca ou
// conta não pode levá-los embora.
const PARAMS_DA_TABELA = ['types', 'categoryIds', 'minAmount', 'maxAmount', 'sortBy', 'sortDir'] as const

interface AccountOption {
  id: string
  name: string
  titular?: string | null
}

interface TransactionFiltersProps {
  accounts: AccountOption[]
  hideAccountFilter?: boolean
  baseUrl?: string
  /** Estado atual do recorte: a lista abre em hoje e o futuro entra por opcao. */
  includeFuture?: boolean
  /** Finais de cartão das contas marcadas. Com menos de dois, o filtro não aparece. */
  cardDigitsOptions?: FinalDoCartao[]
}

/**
 * Cada filtro se desliga onde foi ligado.
 *
 * Antes havia um "Limpar" separado: longe do controle e com alcance total —
 * soltar o período levava embora a busca e a conta no mesmo clique. Agora a
 * pílula ativa clicada volta ao neutro, a busca tem o × dentro do campo e cada
 * data tem o seu, então nenhum clique mexe em filtro que o usuário não tocou.
 */
export function TransactionFilters({ accounts, hideAccountFilter, baseUrl = '/transactions', includeFuture = false, cardDigitsOptions = [] }: TransactionFiltersProps) {
  const searchParams = useSearchParams()
  // Período e contas vão para o recorte compartilhado; a busca e as colunas
  // continuam lembradas só por Transações (`tx-filters`).
  const { trocar } = useFiltrosNaUrl(baseUrl, {
    aoMudar: (novos) => { if (baseUrl === '/transactions') lembrarFiltros(novos) },
  })
  // O timer da busca nasce de um render antigo: sem a ref, ele escreveria na URL de antes.
  const trocarRef = useRef(trocar)
  trocarRef.current = trocar

  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [accountIds, setAccountIds] = useState<string[]>(
    (searchParams.get('accountId') ?? '').split(',').filter(Boolean),
  )
  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? '')
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }, [])

  // Os campos acompanham a URL: seleção restaurada do último uso, pílula ou
  // qualquer outra navegação aparece nas datas e na conta, não só a digitada.
  const urlStart = searchParams.get('startDate') ?? ''
  const urlEnd = searchParams.get('endDate') ?? ''
  const urlAccounts = searchParams.get('accountId') ?? ''
  useEffect(() => { setStartDate(urlStart) }, [urlStart])
  useEffect(() => { setEndDate(urlEnd) }, [urlEnd])
  useEffect(() => { setAccountIds(urlAccounts.split(',').filter(Boolean)) }, [urlAccounts])

  // Quem chega por link com filtro (do Dashboard, de um aviso) também conta
  // como último uso.
  useEffect(() => {
    if (baseUrl === '/transactions') lembrarFiltros(new URLSearchParams(searchParams.toString()))
  }, [baseUrl, searchParams])

  // Chegada com recorte na URL (link, menu, importação) grava o recorte que a
  // tela está mostrando: a URL é a fonte da verdade, então chave ausente é
  // "aberto" (sem data / sem conta). Contas que esta tela não lista
  // (investimento) ficam no cookie: ela não as aplica nem as apaga. A página da
  // conta não tem filtro de conta, então as contas ficam como estão.
  const chavesDoRecorte = [urlStart, urlEnd, searchParams.get('accountId') ?? '', ['startDate', 'endDate', 'accountId'].some((k) => searchParams.has(k))].join('|')
  useEffect(() => {
    const p = Object.fromEntries(new URLSearchParams(searchParams.toString()))
    if (!['startDate', 'endDate', 'accountId'].some((k) => p[k] !== undefined)) return
    const { startDate = '', endDate = '', accountIds } = recorteDaUrl(p)
    const parcial: Partial<Recorte> = { startDate, endDate }
    if (!hideAccountFilter) {
      const doUrl = accountIds ?? []
      const naoListadas = (recorteDoNavegador()?.accountIds ?? []).filter((id) => !accounts.some((a) => a.id === id) && !doUrl.includes(id))
      parcial.accountIds = [...doUrl, ...naoListadas]
    }
    gravarRecorte(parcial)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só as chaves de recorte importam; `accounts` chega como array novo a cada render
  }, [chavesDoRecorte])

  const activePeriod = detectActivePeriod(startDate, endDate)

  // Sem `page`: quem decide onde a lista abre é o servidor (`paginaQueAbre`);
  // o hook já a tira. Os demais parâmetros da URL (tamanho de página, colunas,
  // futuros) atravessam a troca.
  const navigate = (overrides: Record<string, string>) => trocarRef.current(overrides)

  function mudarPeriodo(p: { startDate: string; endDate: string }) {
    setStartDate(p.startDate)
    setEndDate(p.endDate)
    navigate(p)
  }

  function clearSearch() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    setSearch('')
    navigate({ search: '' })
  }

  function trocarContas(ids: string[]) {
    setAccountIds(ids)
    // O final pertence ao cartão: trocar a conta solta os finais escolhidos.
    navigate({ accountId: ids.join(','), cardDigits: '' })
  }

  const finaisMarcados = (searchParams.get('cardDigits') ?? '').split(',').filter(Boolean)
  // Quantos filtros estão escondidos atrás do botão no celular. O período com
  // atalho já aparece no seletor ao lado; a conta lembrada da última visita não.
  const filtrosNoBotao = [
    search,
    !hideAccountFilter && accountIds.length > 0,
    finaisMarcados.length > 0,
    !activePeriod && (startDate || endDate),
    includeFuture,
  ].filter(Boolean).length
  // Tipo, categoria e valor moram no cabeçalho da tabela, que não existe no
  // celular. Sem esta pílula, um filtro lembrado ficava ativo e sem saída.
  const filtrosDeColuna = ['types', 'categoryIds', 'minAmount', 'maxAmount']
    .filter((k) => searchParams.get(k)).length
  const limparFiltrosDeColuna = () => navigate({ types: '', categoryIds: '', minAmount: '', maxAmount: '' })

  return (
    <div className="space-y-2 md:flex md:flex-wrap md:items-center md:gap-2 md:space-y-0">
      {/* O seletor traz atalhos, setas e datas; o botão "Filtros" fica ao lado
          do seletor nativo no celular e as datas só abrem com ele. */}
      <SeletorDePeriodo
        modo="intervalo"
        startDate={startDate}
        endDate={endDate}
        aoMudar={mudarPeriodo}
        datasNoCelular={filtersOpen}
        acaoNoCelular={
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {filtrosNoBotao + filtrosDeColuna > 0 && (
              <span className="rounded-full bg-blue-600 px-1.5 text-xs font-semibold tabular-nums text-white">
                {filtrosNoBotao + filtrosDeColuna}
              </span>
            )}
          </button>
        }
      />

      {/* Demais filtros — sempre visíveis no desktop, recolhidos no celular */}
      <div className={`flex-wrap items-center gap-2 md:contents ${filtersOpen ? 'flex' : 'hidden'}`}>

        {/* Search */}
        <div className="relative w-full md:w-auto md:flex-1 md:min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 md:top-2" />
          <input
            placeholder="Buscar descrição..."
            value={search}
            onChange={(e) => {
              const value = e.target.value
              setSearch(value)
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
              searchTimerRef.current = setTimeout(() => navigate({ search: value }), 400)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
                navigate({ search: e.currentTarget.value })
              }
            }}
            className={`h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 text-base text-gray-600 md:h-8 md:text-xs placeholder:text-gray-500 ${
              search ? 'pr-8' : 'pr-3'
            }`}
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca"
              title="Limpar busca"
              onClick={clearSearch}
              className="absolute right-1.5 top-2 rounded p-0.5 md:top-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Contas — várias de uma vez, e a marcada se desmarca no clique */}
        {!hideAccountFilter && (
          <AccountFilter accounts={accounts} selected={accountIds} onChange={trocarContas} />
        )}

        {/* Final do cartão — só quando a fatura marcada tem mais de um */}
        {cardDigitsOptions.length > 1 && (
          <CardDigitsFilter
            options={cardDigitsOptions}
            selected={finaisMarcados}
            onChange={(digits) => navigate({ cardDigits: digits.join(',') })}
          />
        )}

        <button
          type="button"
          aria-pressed={includeFuture}
          onClick={() => navigate({ future: includeFuture ? '' : '1' })}
          title={
            includeFuture
              ? 'Clique para ocultar o que ainda não aconteceu'
              : 'Incluir os lançamentos previstos com data futura'
          }
          className={`${PILULA_BASE} ${
            includeFuture ? 'bg-amber-100 border border-amber-300 text-amber-800' : PILULA_OFF
          }`}
        >
          Lançamentos futuros
        </button>

        {filtrosDeColuna > 0 && (
          <button
            type="button"
            onClick={limparFiltrosDeColuna}
            className={`${PILULA_BASE} ${PILULA_ON} h-9 gap-1.5 md:hidden`}
          >
            Tipo, categoria ou valor
            <X className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Limpar</span>
          </button>
        )}
      </div>
    </div>
  )
}
