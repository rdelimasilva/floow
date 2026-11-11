'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { AccountFilter } from './account-filter'
import { CardDigitsFilter } from './card-digits-filter'
import { PILULA_BASE, PILULA_OFF, PILULA_ON } from './filtros/pilula'
import { useGravarRecorteNaChegada } from './filtros/use-gravar-recorte-na-chegada'
import { CampoDeData, SeletorDePeriodo } from './filtros/seletor-de-periodo'
import { GavetaDeFiltros } from './filtros/gaveta-de-filtros'
import { CamposDeColunaNaGaveta, contarFiltrosDeColuna } from './filtros/campos-de-coluna-na-gaveta'
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
  /** Categorias para o filtro dentro da gaveta do celular. */
  categories?: { id: string; name: string; parentId?: string | null }[]
}

/**
 * Cada filtro se desliga onde foi ligado.
 *
 * Antes havia um "Limpar" separado: longe do controle e com alcance total —
 * soltar o período levava embora a busca e a conta no mesmo clique. Agora a
 * pílula ativa clicada volta ao neutro, a busca tem o × dentro do campo e cada
 * data tem o seu, então nenhum clique mexe em filtro que o usuário não tocou.
 */
export function TransactionFilters({ accounts, hideAccountFilter, baseUrl = '/transactions', includeFuture = false, cardDigitsOptions = [], categories = [] }: TransactionFiltersProps) {
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

  // A página da conta não tem filtro de conta: as contas do recorte ficam como estão.
  useGravarRecorteNaChegada(hideAccountFilter ? null : accounts)

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
  // Critérios que vêm de um link das análises: só aparecem ligados, e cada um
  // se desliga na própria pílula.
  const soAnalises = searchParams.get('caixa') === '1'
  const situacao = searchParams.get('situacao')
  const criterios = [
    soAnalises && { chave: 'caixa', texto: 'Só o que entra nas análises' },
    situacao === 'realizado' && { chave: 'situacao', texto: 'Só realizados' },
    situacao === 'previsto' && { chave: 'situacao', texto: 'Só previstos' },
    situacao === 'ambos' && { chave: 'situacao', texto: 'Realizados e previstos' },
  ].filter(Boolean) as { chave: string; texto: string }[]
  // Quantos filtros estão escondidos atrás do botão no celular. O período com
  // atalho já aparece no seletor ao lado; a conta lembrada da última visita não.
  const filtrosNoBotao = [
    search,
    !hideAccountFilter && accountIds.length > 0,
    finaisMarcados.length > 0,
    !activePeriod && (startDate || endDate),
    includeFuture,
    ...criterios,
  ].filter(Boolean).length
  const filtrosDeColuna = contarFiltrosDeColuna(searchParams)

  // Os mesmos controles servem à linha do desktop e à gaveta do celular.
  const campos = (naGaveta: boolean) => (
    <>
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
        <AccountFilter accounts={accounts} selected={accountIds} onChange={trocarContas} naGaveta={naGaveta} />
      )}

      {/* Final do cartão — só quando a fatura marcada tem mais de um */}
      {cardDigitsOptions.length > 1 && (
        <CardDigitsFilter
          options={cardDigitsOptions}
          naGaveta={naGaveta}
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

      {criterios.map(({ chave, texto }) => (
        <button
          key={chave}
          type="button"
          aria-pressed
          title="Clique para desligar este filtro"
          onClick={() => navigate({ [chave]: '' })}
          className={`${PILULA_BASE} ${PILULA_ON} inline-flex items-center gap-1.5`}
        >
          {texto}
          <X className="h-3 w-3" aria-hidden />
        </button>
      ))}
    </>
  )

  return (
    <div className="space-y-2 md:flex md:flex-wrap md:items-center md:gap-2 md:space-y-0">
      {/* Celular: período e setas à vista; o resto mora na gaveta do botão "Filtros". */}
      <SeletorDePeriodo
        modo="intervalo"
        startDate={startDate}
        endDate={endDate}
        aoMudar={mudarPeriodo}
        datasNoCelular={false}
        acaoNoCelular={
          <GavetaDeFiltros contador={filtrosNoBotao + filtrosDeColuna}>
            <div className="flex items-center gap-2">
              <CampoDeData valor={startDate} rotulo="Data inicial" mudar={(v) => mudarPeriodo({ startDate: v, endDate })} />
              <span className="text-xs text-gray-500">até</span>
              <CampoDeData valor={endDate} rotulo="Data final" mudar={(v) => mudarPeriodo({ startDate, endDate: v })} />
            </div>
            {campos(true)}
            <CamposDeColunaNaGaveta params={searchParams} categories={categories} navigate={navigate} />
          </GavetaDeFiltros>
        }
      />

      {/* Desktop: filtros sempre em linha. */}
      <div className="hidden md:contents">
        {campos(false)}
      </div>
    </div>
  )
}
