# Corrigir regra de contraparte — Plano, parte 2 (tela, extrato, script)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a correção de regra para a tela (Classificar e extrato), com o CPF próprio decidido lançamento a lançamento e a sugestão pelo par.

**Architecture:** As queries de Classificar ganham `ehCpfProprio` e a sugestão de conta. A seção "Já confirmadas" sai para `regras-confirmadas.tsx`, com editor, prévia e caixa "aplicar ao histórico". O extrato ganha um link para a regra.

**Tech Stack:** Next.js (App Router, server components + client), Drizzle, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-corrigir-regra-contraparte-design.md`

## Global Constraints

Os mesmos da parte 1, e mais:
- `counterparty-queue-client.tsx` (351 linhas) não pode passar de 500. O editor de regras confirmadas vai para um arquivo próprio.
- Nenhum item de menu novo. A correção vive em `/transactions/review`.

## Review Focus

- **Grupo de CPF próprio com um lançamento sem conta escolhida:** o botão Confirmar recusa com aviso; nunca envia. Teste na Task 7.
- **Dois candidatos de par para o mesmo Pix:** sem sugestão (nunca chutar). Teste na Task 6.
- **`?regra=` de outra org ou inexistente:** a página abre normalmente, sem editor aberto. Teste na Task 8.
- **Prévia pedida e decisão alterada depois:** a prévia antiga some e é recalculada antes de salvar. Teste na Task 8.
- **Lançamento sem `counterparty_id` no extrato** (manual, importado por OFX): não mostra "Corrigir regra". Teste na Task 9.

**Arquivos do plano (executar em ordem):** `2026-09-24-corrigir-regra-contraparte-1a-backend.md` (Tasks 1-2), `2026-09-24-corrigir-regra-contraparte-1b-backend.md` (Task 3), `2026-09-24-corrigir-regra-contraparte-1c-backend.md` (Tasks 4-5), `2026-09-24-corrigir-regra-contraparte-2a-tela.md` (Tasks 6-7), `2026-09-24-corrigir-regra-contraparte-2b-tela.md` (Task 8), `2026-09-24-corrigir-regra-contraparte-2c-tela.md` (Tasks 9-10).

---

### Task 8: Editor de regras confirmadas com prévia

**Files:**
- Create: `apps/web/components/openfinance/regras-confirmadas.tsx` (`'use client'`)
- Modify: `apps/web/components/openfinance/counterparty-queue-client.tsx` (renderiza `<RegrasConfirmadas>` no lugar do bloco removido; nova prop `regraAberta?: string`)
- Modify: `apps/web/components/openfinance/counterparty-queue.tsx` (repassa `regraAberta`)
- Modify: `apps/web/app/(app)/transactions/review/page.tsx` (lê `?regra=`)
- Test: `apps/web/__tests__/openfinance/regras-confirmadas.test.tsx`

**Interfaces:**
- Consumes:
  - `corrigirRegra`, `previaCorrecaoDeRegra`, `PreviaCorrecao` (parte 1, Task 5)
  - `ConfirmedCounterparty` (Task 6)
- Produces: `RegrasConfirmadas({ confirmed, categoryOptions, accountOptions, regraAberta }: { confirmed: ConfirmedCounterparty[]; categoryOptions: CategoryOption[]; accountOptions: AccountOption[]; regraAberta?: string })`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, it, expect, beforeEach } from 'vitest'

const corrigir = vi.fn(async () => ({ reprocessados: 11, ignorados: 0 }))
const previa = vi.fn(async () => ({ mudam: 11, foraPorParDoOutroLado: [], deltas: { xp: 6446627, corretora: -6446627 } }))
vi.mock('@/lib/openfinance/corrigir-regra-actions', () => ({ corrigirRegra: (...a: any[]) => corrigir(...a), previaCorrecaoDeRegra: (...a: any[]) => previa(...a) }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

import { RegrasConfirmadas } from '@/components/openfinance/regras-confirmadas'

const regra = { id: 'r1', displayName: 'Resgate CDB DI', nature: 'transfer' as const, categoryId: null, transferAccountId: 'xp', transferAccountName: 'XP Corretora', confirmedAt: '2026-09-08T19:18:09Z', keyType: 'description' as const, direction: 'in' as const, ehCpfProprio: false }
const contas = [{ id: 'xp', name: 'XP Corretora' }, { id: 'corretora', name: 'Itaú - Corretora' }]

beforeEach(() => { corrigir.mockClear(); previa.mockClear(); refresh.mockClear() })

it('abre direto pela ?regra= e mostra a prévia quando marca o histórico', async () => {
  render(<RegrasConfirmadas confirmed={[regra]} categoryOptions={[]} accountOptions={contas} regraAberta="r1" />)
  await userEvent.click(screen.getByRole('combobox'))
  await userEvent.click(screen.getByRole('option', { name: 'Itaú - Corretora' }))
  await userEvent.click(screen.getByLabelText('Aplicar também aos lançamentos já classificados'))
  expect(await screen.findByText(/11 lançamentos mudam/)).toBeInTheDocument()
  expect(screen.getByText(/XP Corretora \+R\$ 64\.466,27/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Salvar correção' }))
  expect(corrigir).toHaveBeenCalledWith({ counterpartyId: 'r1', nature: 'transfer', categoryId: null, transferAccountId: 'corretora', aplicarAoHistorico: true })
  expect(refresh).toHaveBeenCalled()
})

it('mudar a decisão depois da prévia descarta a prévia antiga', async () => {
  render(<RegrasConfirmadas confirmed={[regra]} categoryOptions={[]} accountOptions={contas} regraAberta="r1" />)
  await userEvent.click(screen.getByLabelText('Aplicar também aos lançamentos já classificados'))
  await screen.findByText(/11 lançamentos mudam/)
  await userEvent.click(screen.getByRole('combobox'))
  await userEvent.click(screen.getByRole('option', { name: 'Itaú - Corretora' }))
  expect(previa).toHaveBeenCalledTimes(2)
})

it('?regra= desconhecida: lista fechada, sem erro', () => {
  render(<RegrasConfirmadas confirmed={[regra]} categoryOptions={[]} accountOptions={contas} regraAberta="nao-existe" />)
  expect(screen.queryByRole('button', { name: 'Salvar correção' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Corrigir' })).toBeInTheDocument()
})

it('regra do CPF próprio não pede conta', async () => {
  render(<RegrasConfirmadas confirmed={[{ ...regra, keyType: 'tax_id', ehCpfProprio: true }]} categoryOptions={[]} accountOptions={contas} regraAberta="r1" />)
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.getByText(/voltam para Classificar/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/regras-confirmadas.test.tsx`
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implement `regras-confirmadas.tsx`**

```tsx
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
  const [aberta, setAberta] = useState<string | null>(confirmed.some((c) => c.id === regraAberta) ? regraAberta! : null)
  const [decisao, setDecisao] = useState<Decisao | null>(null)
  const [historico, setHistorico] = useState(false)
  const [previa, setPrevia] = useState<PreviaCorrecao | null>(null)
  const [salvando, setSalvando] = useState(false)

  const regra = confirmed.find((c) => c.id === aberta) ?? null
  const atual: Decisao | null = regra
    ? decisao ?? { nature: regra.nature, categoryId: regra.categoryId, transferAccountId: regra.ehCpfProprio ? null : regra.transferAccountId }
    : null

  useEffect(() => {
    setPrevia(null)
    if (!regra || !atual || !historico) return
    if (atual.nature === 'transfer' && !atual.transferAccountId && !regra.ehCpfProprio) return
    if (atual.nature !== 'transfer' && !atual.categoryId) return
    let vivo = true
    previaCorrecaoDeRegra({ counterpartyId: regra.id, ...atual })
      .then((p) => { if (vivo) setPrevia(p) })
      .catch((e) => toast(e instanceof Error ? e.message : 'Não foi possível calcular a prévia', 'error'))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, historico, atual?.nature, atual?.categoryId, atual?.transferAccountId])

  function abrir(id: string) {
    setAberta(id); setDecisao(null); setHistorico(false); setPrevia(null)
  }

  async function salvar() {
    if (!regra || !atual) return
    setSalvando(true)
    try {
      const r = await corrigirRegra({ counterpartyId: regra.id, ...atual, aplicarAoHistorico: historico })
      toast(historico ? `${r.reprocessados} lançamentos corrigidos.` : 'Regra corrigida. Vale para os próximos lançamentos.')
      setAberta(null)
      router.refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (confirmed.length === 0) return null
  const naturezas = (['expense', 'income', 'transfer'] as const).filter((n) =>
    !(n === 'income' && regra?.direction === 'out') && !(n === 'expense' && regra?.direction === 'in'))
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
                  <Button type="button" variant="outline" onClick={() => abrir(c.id)}>Corrigir</Button>
                )}
              </span>
            </div>

            {aberta === c.id && atual && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {!c.ehCpfProprio && naturezas.map((n) => (
                    <Button key={n} type="button" variant={atual.nature === n ? 'primary' : 'outline'}
                      onClick={() => setDecisao({ nature: n, categoryId: null, transferAccountId: null })}>
                      {rotulo(n)}
                    </Button>
                  ))}
                  {atual.nature === 'transfer' && !c.ehCpfProprio && (
                    <Select value={atual.transferAccountId ?? ''} onValueChange={(v) => setDecisao({ ...atual, transferAccountId: v })}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="Conta" /></SelectTrigger>
                      <SelectContent>
                        {accountOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {atual.nature !== 'transfer' && (
                    <Select value={atual.categoryId ?? ''} onValueChange={(v) => setDecisao({ ...atual, categoryId: v })}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
                      <SelectContent>
                        {categoryOptions.filter((o) => o.type === atual.nature).map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {c.ehCpfProprio && (
                  <p className="text-xs text-gray-500">Pix para você mesmo não tem conta fixa. Com o histórico marcado, os lançamentos voltam para Classificar e você escolhe a conta de cada um.</p>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={historico} onChange={(e) => setHistorico(e.target.checked)} />
                  Aplicar também aos lançamentos já classificados
                </label>

                {historico && previa && (
                  <div className="rounded bg-gray-50 p-2 text-xs text-gray-700">
                    <p>{previa.mudam} lançamentos mudam</p>
                    {Object.entries(previa.deltas).map(([conta, v]) => (
                      <p key={conta}>{nomeDaConta(conta)} {v >= 0 ? '+' : ''}{formatBRL(v)}</p>
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
                  <Button type="button" variant="outline" onClick={() => setAberta(null)}>Cancelar</Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

(Se o texto do `formatBRL` de 6446627 não sair "R$ 64.466,27" com espaço normal, porque o `Intl` usa NBSP, trocar no teste o espaço por `\s`: `/XP Corretora \+R\$\s64\.466,27/`.)

- [ ] **Step 4: Ligar a página**

`app/(app)/transactions/review/page.tsx`:

```tsx
interface Props { searchParams: Promise<{ regra?: string }> }

export default async function ReviewPage({ searchParams }: Props) {
  const orgId = await getOrgId()
  const { regra } = await searchParams
  // ...
        <CounterpartyQueue orgId={orgId} mode="page" regraAberta={regra} />
```

- `counterparty-queue.tsx`: aceitar `regraAberta?: string` e repassar para o client.
- `counterparty-queue-client.tsx`: aceitar `regraAberta?: string` em `Props`. No lugar do bloco removido, renderizar:

```tsx
      {mode === 'page' && (
        <RegrasConfirmadas confirmed={confirmed} categoryOptions={categoryOptions} accountOptions={accountOptions} regraAberta={regraAberta} />
      )}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/ && pnpm tsc --noEmit`
Expected: PASS, zero erros de tipo.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/components/openfinance/regras-confirmadas.tsx apps/web/components/openfinance/counterparty-queue-client.tsx apps/web/components/openfinance/counterparty-queue.tsx "apps/web/app/(app)/transactions/review/page.tsx" apps/web/__tests__/openfinance/regras-confirmadas.test.tsx
git commit -m "feat(classificar): corrigir regra confirmada com previa do historico"
```

---

