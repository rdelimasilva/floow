'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@floow/core-finance/src/balance'
import { corrigirRegra, previaCorrecaoDeRegra } from '@/lib/openfinance/corrigir-regra-actions'
import type { PreviaCorrecao } from '@/lib/openfinance/previa-correcao'
import type { ConfirmedCounterparty } from '@/lib/openfinance/counterparty-queries'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'

type Nature = 'income' | 'expense' | 'transfer'
type CategoryOption = { id: string; label: string; type: Nature }
type AccountOption = { id: string; name: string }
type Decisao = { nature: Nature; categoryId: string | null; transferAccountId: string | null }

interface Props {
  confirmed: ConfirmedCounterparty[]
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
  regraAberta?: string
}

const rotulo = (n: Nature) => (n === 'expense' ? 'Despesa' : n === 'income' ? 'Receita' : 'Transferência')

/**
 * "Já confirmadas" de Classificar, agora corrigíveis (spec §3-4). A caixa de
 * histórico vem desmarcada: só daqui pra frente é o padrão seguro. Marcada,
 * a prévia mostra o que muda antes de salvar.
 */
export function RegrasConfirmadas({ confirmed, categoryOptions, accountOptions, regraAberta }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [aberta, setAberta] = useState<string | null>(
    confirmed.some((c) => c.id === regraAberta) ? regraAberta! : null,
  )
  const [decisao, setDecisao] = useState<Decisao | null>(null)
  const [historico, setHistorico] = useState(false)
  const [previa, setPrevia] = useState<PreviaCorrecao | null>(null)
  const [salvando, setSalvando] = useState(false)

  const regra = confirmed.find((c) => c.id === aberta) ?? null
  const atual: Decisao | null = regra
    ? (decisao ?? { nature: regra.nature, categoryId: regra.categoryId, transferAccountId: regra.ehCpfProprio ? null : regra.transferAccountId })
    : null

  useEffect(() => {
    setPrevia(null)
    if (!regra || !atual || !historico) return
    if (atual.nature === 'transfer' && !atual.transferAccountId && !regra.ehCpfProprio) return
    if (atual.nature !== 'transfer' && !atual.categoryId) return
    let vivo = true
    previaCorrecaoDeRegra({ counterpartyId: regra.id, ...atual })
      .then((p) => {
        if (vivo) setPrevia(p)
      })
      .catch((e) => toast(e instanceof Error ? e.message : 'Não foi possível calcular a prévia', 'error'))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, historico, atual?.nature, atual?.categoryId, atual?.transferAccountId])

  function abrir(id: string) {
    setAberta(id)
    setDecisao(null)
    setHistorico(false)
    setPrevia(null)
  }

  async function salvar() {
    if (!regra || !atual) return
    setSalvando(true)
    try {
      const r = await corrigirRegra({ counterpartyId: regra.id, ...atual, aplicarAoHistorico: historico })
      toast(historico ? `${r.reprocessados} lançamentos reprocessados.` : 'Regra corrigida. Vale para os próximos lançamentos.')
      setAberta(null)
      router.refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (confirmed.length === 0) return null
  const naturezas = (['expense', 'income', 'transfer'] as const).filter(
    (n) => !(n === 'income' && regra?.direction === 'out') && !(n === 'expense' && regra?.direction === 'in'),
  )
  const nomeDaConta = (id: string) => accountOptions.find((a) => a.id === id)?.name ?? 'outra conta'

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900">Já confirmadas</h2>
      <p className="mt-1 text-xs text-gray-500">Quem você já classificou. Vale para os lançamentos futuros também.</p>
      <ul className="mt-3 space-y-2">
        {confirmed.map((c) => (
          <li key={c.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-900">{c.displayName}</span>
              <span className="flex items-center gap-2 text-gray-500">
                {c.nature === 'transfer' ? `Transferência · ${c.ehCpfProprio ? 'por lançamento' : c.transferAccountName ?? '?'}` : rotulo(c.nature)}
                {aberta !== c.id && (
                  <Button type="button" variant="outline" onClick={() => abrir(c.id)}>
                    Corrigir
                  </Button>
                )}
              </span>
            </div>

            {aberta === c.id && atual && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {!c.ehCpfProprio &&
                    naturezas.map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={atual.nature === n ? 'primary' : 'outline'}
                        onClick={() => setDecisao({ nature: n, categoryId: null, transferAccountId: null })}
                      >
                        {rotulo(n)}
                      </Button>
                    ))}
                  {atual.nature === 'transfer' && !c.ehCpfProprio && (
                    <Select value={atual.transferAccountId ?? ''} onValueChange={(v) => setDecisao({ ...atual, transferAccountId: v })}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {atual.nature !== 'transfer' && (
                    <Select value={atual.categoryId ?? ''} onValueChange={(v) => setDecisao({ ...atual, categoryId: v })}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions
                          .filter((o) => o.type === atual.nature)
                          .map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {c.ehCpfProprio && (
                  <p className="text-xs text-gray-500">
                    Pix para você mesmo não tem conta fixa. Com o histórico marcado, os lançamentos voltam para Classificar e você escolhe a
                    conta de cada um.
                  </p>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={historico} onChange={(e) => setHistorico(e.target.checked)} />
                  Aplicar também aos lançamentos já classificados
                </label>

                {historico && previa && (
                  <div className="rounded bg-gray-50 p-2 text-xs text-gray-700">
                    <p>{previa.mudam} lançamentos mudam</p>
                    {Object.entries(previa.deltas).map(([conta, v]) => (
                      <p key={conta}>
                        {nomeDaConta(conta)} {v >= 0 ? '+' : ''}
                        {formatBRL(v)}
                      </p>
                    ))}
                    {previa.foraPorParDoOutroLado.length > 0 && (
                      <p className="mt-1 text-gray-500">
                        {previa.foraPorParDoOutroLado.length} seguem o par feito pela outra conta; corrija por lá.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="button" disabled={salvando || (historico && !previa)} onClick={salvar}>
                    {salvando ? 'Salvando…' : 'Salvar correção'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAberta(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
