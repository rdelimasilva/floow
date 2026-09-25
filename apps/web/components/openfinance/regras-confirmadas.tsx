'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@floow/core-finance/src/balance'
import { corrigirRegra, previaCorrecaoDeRegra } from '@/lib/openfinance/corrigir-regra-actions'
import type { PreviaCorrecao } from '@/lib/openfinance/previa-correcao'
import { mensagemNaContaNova, MSG_CONTA_DA_REGRA } from '@/lib/openfinance/mesma-conta'
import type { ConfirmedCounterparty } from '@/lib/openfinance/counterparty-queries'
import { filtrarRegras } from '@/lib/openfinance/filtrar-regras'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

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
  const [busca, setBusca] = useState('')

  const regra = confirmed.find((c) => c.id === aberta) ?? null
  const atual: Decisao | null = regra
    ? (decisao ?? { nature: regra.nature, categoryId: regra.categoryId, transferAccountId: regra.ehCpfProprio ? null : regra.transferAccountId })
    : null

  /**
   * Falta escolher categoria (receita/despesa) ou conta (transferência, exceto
   * CPF próprio, que não tem conta fixa) — mesmo com histórico desmarcado, não
   * dá pra salvar assim: o servidor rejeitaria (`decisaoSchema.refine`, fix
   * round 1). Reaproveitada pelo efeito da prévia, que também não deve rodar
   * com a decisão pela metade.
   */
  function decisaoCompleta(d: Decisao): boolean {
    if (d.nature === 'transfer') return Boolean(d.transferAccountId) || Boolean(regra?.ehCpfProprio)
    return Boolean(d.categoryId)
  }

  // Troca a decisão E limpa a prévia antiga na mesma atualização — sem isso,
  // a prévia de antes ficava visível (e o Salvar liberado por ela) por um
  // paint inteiro antes de o efeito abaixo rodar (fix round 1).
  function mudarDecisao(nova: Decisao) {
    setDecisao(nova)
    setPrevia(null)
  }

  function mudarHistorico(v: boolean) {
    setHistorico(v)
    setPrevia(null)
  }

  useEffect(() => {
    setPrevia(null)
    if (!regra || !atual || !historico) return
    if (!decisaoCompleta(atual)) return
    let vivo = true
    previaCorrecaoDeRegra({ counterpartyId: regra.id, ...atual })
      .then((p) => {
        if (vivo) setPrevia(p)
      })
      .catch((e) => toast(mensagemDeErro(e, 'Não foi possível calcular a prévia'), 'error'))
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
      toast(mensagemDeErro(e, 'Não foi possível salvar'), 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (confirmed.length === 0) return null
  const naturezas = (['expense', 'income', 'transfer'] as const).filter(
    (n) => !(n === 'income' && regra?.direction === 'out') && !(n === 'expense' && regra?.direction === 'in'),
  )
  const nomeDaConta = (id: string) => accountOptions.find((a) => a.id === id)?.name ?? 'outra conta'
  // Transferência para a própria conta: o servidor recusa, mas em produção o
  // Next esconde a mensagem dele. A tela avisa e trava o Salvar antes.
  const avisoMesmaConta = !regra || !atual
    ? null
    : atual.nature === 'transfer' && atual.transferAccountId && atual.transferAccountId === regra.accountId
      ? MSG_CONTA_DA_REGRA
      : historico && previa && previa.naContaNova > 0
        ? mensagemNaContaNova(previa.naContaNova)
        : null

  // A regra aberta (inclusive pelo link do extrato) não some quando o filtro
  // não a inclui: sumir no meio da edição perderia o que já foi escolhido.
  const filtradas = filtrarRegras(confirmed, busca)
  const visiveis = regra && !filtradas.includes(regra) ? [regra, ...filtradas] : filtradas

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900">Já confirmadas</h2>
      <p className="mt-1 text-xs text-gray-500">Quem você já classificou. Vale para os lançamentos futuros também.</p>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="search"
          aria-label="Buscar regra"
          placeholder="Buscar por nome ou conta"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full max-w-sm rounded-md border border-gray-200 px-3 py-1.5 text-sm"
        />
        {busca.trim() && (
          <span className="shrink-0 text-xs text-gray-500">
            {filtradas.length} de {confirmed.length} regras
          </span>
        )}
      </div>
      {visiveis.length === 0 && <p className="mt-3 text-sm text-gray-500">Nenhuma regra encontrada.</p>}
      <ul className="mt-3 space-y-2">
        {visiveis.map((c) => (
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
                  {/* CPF próprio também troca a natureza: um Pix para você mesmo
                      confirmado como Receita tem de poder virar Transferência.
                      Só o seletor de conta some (a conta é por lançamento). */}
                  {naturezas.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant={atual.nature === n ? 'primary' : 'outline'}
                      onClick={() => mudarDecisao({ nature: n, categoryId: null, transferAccountId: null })}
                    >
                      {rotulo(n)}
                    </Button>
                  ))}
                  {atual.nature === 'transfer' && !c.ehCpfProprio && (
                    <Select value={atual.transferAccountId ?? ''} onValueChange={(v) => mudarDecisao({ ...atual, transferAccountId: v })}>
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
                    <Select value={atual.categoryId ?? ''} onValueChange={(v) => mudarDecisao({ ...atual, categoryId: v })}>
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

                {c.ehCpfProprio && atual.nature === 'transfer' && (
                  <p className="text-xs text-gray-500">
                    Pix para você mesmo não tem conta fixa. Com o histórico marcado, os lançamentos voltam para Classificar e você escolhe a
                    conta de cada um.
                  </p>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={historico} onChange={(e) => mudarHistorico(e.target.checked)} />
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

                {avisoMesmaConta && <p className="text-xs text-red-600">{avisoMesmaConta}</p>}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={salvando || !decisaoCompleta(atual) || (historico && !previa) || Boolean(avisoMesmaConta)}
                    onClick={salvar}
                  >
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
