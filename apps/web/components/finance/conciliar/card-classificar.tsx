import type { Classificacao } from '@/lib/finance/conciliacao/fila'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { transferAccountLabel } from '@/lib/openfinance/transfer-direction'

export type Nature = 'income' | 'expense' | 'transfer'
export type CategoryOption = { id: string; label: string; type: Nature }
export type AccountOption = { id: string; name: string }
export type Decisao = { nature: Nature; categoryId: string | null; transferAccountId: string | null; regra: boolean }

const NATUREZAS: { valor: Nature; rotulo: string }[] = [
  { valor: 'expense', rotulo: 'Despesa' },
  { valor: 'income', rotulo: 'Receita' },
  { valor: 'transfer', rotulo: 'Transferência' },
]

/**
 * A conta sugerida para a transferência, desde que não seja a do próprio
 * lançamento: transferir para si mesma é o erro de produção de 16/09/2026, e
 * o caminho da regra (`confirmCounterparty`) não barra isso no servidor.
 */
function contaSugerida(c: Classificacao, contaDoItemId: string): string | null {
  return c.sugestaoContaId === contaDoItemId ? null : c.sugestaoContaId
}

/** O card chega com o palpite do floow já marcado (spec §2.3 B). CPF próprio nunca vira regra: cada lançamento é uma conta diferente. */
export function decisaoInicial(c: Classificacao, contaDoItemId: string): Decisao {
  return {
    nature: c.nature,
    categoryId: c.nature === 'transfer' ? null : c.categoryId,
    transferAccountId: c.nature === 'transfer' ? contaSugerida(c, contaDoItemId) : null,
    regra: !c.ehCpfProprio,
  }
}

export function decisaoCompleta(d: Decisao, contaDoItemId: string): boolean {
  if (d.nature !== 'transfer') return d.categoryId !== null
  return d.transferAccountId !== null && d.transferAccountId !== contaDoItemId
}

export function CardClassificar({
  classificacao: c, amountCents, contaDoItemId, decisao: d, onMudar,
  categoryOptions, accountOptions, ocupado, onConfirmar, onProcurar, onPular,
}: {
  classificacao: Classificacao
  amountCents: number
  contaDoItemId: string
  decisao: Decisao
  onMudar: (d: Decisao) => void
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
  ocupado: boolean
  onConfirmar: () => void
  onProcurar: () => void
  onPular: () => void
}) {
  const categorias = categoryOptions.filter((o) => o.type === d.nature)
  // Transferir para a própria conta do lançamento é o erro de produção de 16/09/2026.
  const contas = accountOptions.filter((a) => a.id !== contaDoItemId)
  const ehASugestao = c.suggestionSource !== null && d.nature === c.nature && d.categoryId === c.categoryId && d.nature !== 'transfer'

  function mudarNatureza(nature: Nature) {
    if (nature === d.nature) return
    const categoriaServe = categoryOptions.some((o) => o.id === d.categoryId && o.type === nature)
    onMudar({
      ...d,
      nature,
      categoryId: nature !== 'transfer' && categoriaServe ? d.categoryId : null,
      transferAccountId: nature === 'transfer' ? contaSugerida(c, contaDoItemId) : null,
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Lançar como</p>
      <div className="flex flex-wrap items-center gap-2">
        {NATUREZAS.map((n) => (
          <Button
            key={n.valor}
            type="button"
            size="sm"
            variant={d.nature === n.valor ? 'secondary' : 'outline'}
            aria-pressed={d.nature === n.valor}
            disabled={ocupado}
            onClick={() => mudarNatureza(n.valor)}
          >
            {n.rotulo}
          </Button>
        ))}
        {d.nature === 'transfer' ? (
          <Select value={d.transferAccountId ?? ''} onValueChange={(v) => onMudar({ ...d, transferAccountId: v })}>
            <SelectTrigger className="w-56" aria-label="Conta">
              <SelectValue placeholder={transferAccountLabel(amountCents)} />
            </SelectTrigger>
            <SelectContent>
              {contas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Select value={d.categoryId ?? ''} onValueChange={(v) => onMudar({ ...d, categoryId: v })}>
            <SelectTrigger className="w-56" aria-label="Categoria">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              {categorias.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {ehASugestao && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {c.suggestionSource === 'claude' ? 'sugestão do Claude' : 'sugestão do histórico'}
          </span>
        )}
      </div>
      {!c.ehCpfProprio && (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={d.regra}
            disabled={ocupado}
            onChange={(e) => onMudar({ ...d, regra: e.target.checked })}
          />
          Fazer igual com {c.displayName} daqui pra frente
          {c.outrosNaFila > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">+{c.outrosNaFila} na fila</span>
          )}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={ocupado || !decisaoCompleta(d, contaDoItemId)} onClick={onConfirmar}>Confirmar</Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onProcurar}>Procurar previsão</Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onPular}>Pular</Button>
      </div>
    </div>
  )
}
