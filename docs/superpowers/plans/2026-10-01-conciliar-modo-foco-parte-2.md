# Conciliar em modo foco — Implementation Plan (parte 2: tela)

> Continuação de `2026-10-01-conciliar-modo-foco.md` e `-parte-1b.md` (Global Constraints e Review Focus valem aqui). Spec: `docs/superpowers/specs/2026-10-01-conciliar-modo-foco-design.md` §2. Mockups aprovados: `.superpowers/brainstorm/174309-1790862318/content/card-foco.html` e `card-foco-conta.html`.

Visual: siga o estilo atual do app (Tailwind cinza, `Button` de `@/components/ui/button` com `variant="primary"` no botão verde, `Select` de `@/components/ui/select`, `useToast`, `formatBRL` de `@floow/core-finance/src/balance`). Não introduza paleta nova (decisão registrada: redesenhos visuais app-wide foram rejeitados).

### Task 8: Estado da fila (puro)

**Files:**
- Create: `apps/web/components/finance/conciliar/estado-da-fila.ts`
- Test: `apps/web/__tests__/finance/estado-da-fila.test.ts`

**Interfaces — Consumes:** `ItemDaFila` (parte 1, Task 4). **Produces:**

```ts
export type Fase = 'repetido' | 'candidatas' | 'classificar'
export function faseDe(item: ItemDaFila): Fase | null
export interface EstadoDaFila { itens: ItemDaFila[]; pulados: string[]; feitos: number }
export type Evento =
  | { tipo: 'resolvido'; id: string }
  | { tipo: 'semRepetido'; id: string }
  | { tipo: 'semVinculo'; id: string }
  | { tipo: 'regraConfirmada'; counterpartyId: string }
  | { tipo: 'pulado'; id: string }
  | { tipo: 'revisarPulados' }
export function reduzir(estado: EstadoDaFila, evento: Evento): EstadoDaFila
export function soRestamPulados(estado: EstadoDaFila): boolean
```

- [ ] **Step 1: Testes falhando:**

```ts
import { describe, it, expect } from 'vitest'
import { faseDe, reduzir, soRestamPulados } from '@/components/finance/conciliar/estado-da-fila'

const it_ = (id: string, p: Record<string, unknown> = {}) =>
  ({ id, candidatas: [], repetido: null, classificacao: null, ...p }) as any
const cls = (counterpartyId: string) => ({ counterpartyId })

describe('faseDe', () => {
  it('repetido → candidatas → classificar', () => {
    expect(faseDe(it_('a', { repetido: {}, candidatas: [{}], classificacao: {} }))).toBe('repetido')
    expect(faseDe(it_('a', { candidatas: [{}], classificacao: {} }))).toBe('candidatas')
    expect(faseDe(it_('a', { classificacao: {} }))).toBe('classificar')
    expect(faseDe(it_('a'))).toBeNull()
  })
})

describe('reduzir', () => {
  const inicial = (itens: any[]) => ({ itens, pulados: [], feitos: 0 })
  it('resolvido tira o item e conta feito', () => {
    const e = reduzir(inicial([it_('a'), it_('b')]), { tipo: 'resolvido', id: 'a' })
    expect(e.itens.map((i) => i.id)).toEqual(['b'])
    expect(e.feitos).toBe(1)
  })
  it('"não é repetido" mantém o item na fase seguinte; sem mais nada, sai', () => {
    let e = reduzir(inicial([it_('a', { repetido: {}, classificacao: cls('x') })]), { tipo: 'semRepetido', id: 'a' })
    expect(faseDe(e.itens[0])).toBe('classificar')
    e = reduzir(inicial([it_('a', { repetido: {} })]), { tipo: 'semRepetido', id: 'a' })
    expect(e.itens).toEqual([])
  })
  it('"não é nenhum" leva de candidatas para classificar (Review Focus 2)', () => {
    const e = reduzir(inicial([it_('a', { candidatas: [{}], classificacao: cls('x') })]), { tipo: 'semVinculo', id: 'a' })
    expect(faseDe(e.itens[0])).toBe('classificar')
  })
  it('regra confirmada resolve os da mesma contraparte; quem tem candidata fica, já classificado', () => {
    const e = reduzir(
      inicial([it_('a', { classificacao: cls('net') }), it_('b', { classificacao: cls('net'), candidatas: [{}] }), it_('c', { classificacao: cls('uber') })]),
      { tipo: 'regraConfirmada', counterpartyId: 'net' },
    )
    expect(e.itens.map((i) => i.id)).toEqual(['b', 'c'])
    expect(e.itens[0].classificacao).toBeNull()
    expect(e.feitos).toBe(1)
  })
  it('pular manda para o fim; só pulados → oferece revisar', () => {
    let e = reduzir(inicial([it_('a'), it_('b')]), { tipo: 'pulado', id: 'a' })
    expect(e.itens.map((i) => i.id)).toEqual(['b', 'a'])
    e = reduzir(e, { tipo: 'pulado', id: 'b' })
    expect(soRestamPulados(e)).toBe(true)
    expect(soRestamPulados(reduzir(e, { tipo: 'revisarPulados' }))).toBe(false)
  })
})
```

- [ ] **Step 2:** `npx vitest run __tests__/finance/estado-da-fila.test.ts` → FAIL.
- [ ] **Step 3: Implementar:**

```ts
import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'

/** A ordem de decidir dentro do card é a mesma da fila: repetido, vínculo, classificação (spec §2.3). */
export function faseDe(item: ItemDaFila): Fase | null {
  if (item.repetido) return 'repetido'
  if (item.candidatas.length > 0) return 'candidatas'
  if (item.classificacao) return 'classificar'
  return null
}

function atualizar(estado: EstadoDaFila, id: string, mudar: (i: ItemDaFila) => ItemDaFila): EstadoDaFila {
  const itens = estado.itens.map((i) => (i.id === id ? mudar(i) : i))
  const resolvidos = itens.filter((i) => faseDe(i) === null).length
  return { ...estado, itens: itens.filter((i) => faseDe(i) !== null), feitos: estado.feitos + resolvidos }
}

export function reduzir(estado: EstadoDaFila, evento: Evento): EstadoDaFila {
  switch (evento.tipo) {
    case 'resolvido':
      return { ...estado, itens: estado.itens.filter((i) => i.id !== evento.id), feitos: estado.feitos + 1 }
    case 'semRepetido':
      return atualizar(estado, evento.id, (i) => ({ ...i, repetido: null }))
    case 'semVinculo':
      return atualizar(estado, evento.id, (i) => ({ ...i, candidatas: [] }))
    case 'regraConfirmada': {
      let e = estado
      for (const i of estado.itens) {
        if (i.classificacao?.counterpartyId === evento.counterpartyId) e = atualizar(e, i.id, (x) => ({ ...x, classificacao: null }))
      }
      return e
    }
    case 'pulado': {
      const item = estado.itens.find((i) => i.id === evento.id)
      if (!item) return estado
      return {
        ...estado,
        itens: [...estado.itens.filter((i) => i.id !== evento.id), item],
        pulados: estado.pulados.includes(evento.id) ? estado.pulados : [...estado.pulados, evento.id],
      }
    }
    case 'revisarPulados':
      return { ...estado, pulados: [] }
  }
}

export function soRestamPulados(estado: EstadoDaFila): boolean {
  return estado.itens.length > 0 && estado.itens.every((i) => estado.pulados.includes(i.id))
}
```

- [ ] **Step 4:** teste → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(conciliar): estado da fila do modo foco"` (com `git add` dos dois arquivos).

---

### Task 9: Cards e a fila em modo foco

**Files:**
- Create: `apps/web/components/finance/conciliar/card-conta.tsx`, `card-repetido.tsx`, `card-candidatos.tsx`, `card-classificar.tsx`, `procurar-previsao.tsx`, `fila-foco.tsx`, `tudo-conciliado.tsx` (mover `TudoConciliado` de `secao-de-conciliar.tsx` sem mudança)
- Test: `apps/web/__tests__/finance/fila-foco.test.tsx`

**Interfaces — Consumes:** `ItemDaFila`, `Candidata`, `reduzir`/`faseDe`/`soRestamPulados` (Task 8); actions `vincularPrevisao`, `marcarSemVinculo`, `classificarSoEste`, `procurarPrevisoes` (`@/lib/finance/conciliacao/vincular-actions`), `aprovarDuplicata`, `recusarDuplicata` (`@/lib/finance/duplicata-actions`), `confirmCounterparty` (`@/lib/openfinance/counterparty-actions`). **Produces:**

```ts
export type CategoryOption = { id: string; label: string; type: 'income' | 'expense' | 'transfer' }
export type AccountOption = { id: string; name: string }
export function FilaFoco(props: { itens: ItemDaFila[]; total: number; categoryOptions: CategoryOption[]; accountOptions: AccountOption[] }): JSX.Element
export function rotuloDaConta(conta: ContaDoItem, cardLastDigits: string | null): { titulo: string; detalhe: string | null }
```

- [ ] **Step 1: Testes falhando** (`fila-foco.test.tsx`; mockar as actions e `next/navigation` `useRouter` → `{ refresh: vi.fn() }`; envolver em `ToastProvider` de `@/components/ui/toast`):

```tsx
const vincularPrevisao = vi.fn().mockResolvedValue({ efetivada: true })
const marcarSemVinculo = vi.fn().mockResolvedValue({ ok: true })
const classificarSoEste = vi.fn().mockResolvedValue({ ok: true })
const confirmCounterparty = vi.fn().mockResolvedValue({ reclassified: 3 })
const aprovarDuplicata = vi.fn().mockResolvedValue({ efetivada: true })
const recusarDuplicata = vi.fn().mockResolvedValue({ recusada: true })
vi.mock('@/lib/finance/conciliacao/vincular-actions', () => ({ vincularPrevisao, marcarSemVinculo, classificarSoEste, procurarPrevisoes: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/finance/duplicata-actions', () => ({ aprovarDuplicata, recusarDuplicata }))
vi.mock('@/lib/openfinance/counterparty-actions', () => ({ confirmCounterparty }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const conta = { id: 'itau', nome: 'Conta Itaú', tipo: 'checking', instituicao: 'Itaú', agencia: '0123', numero: '45219' }
const base = { date: '2026-09-12', amountCents: -150000, cardLastDigits: null, importedAt: '2026-09-13T10:00:00Z', conta, repetido: null, classificacao: null, candidatas: [] }
const cand = (id: string, extra = {}) => ({ id, accountId: 'itau', contaNome: 'Conta Itaú', date: '2026-09-10', amountCents: -150000, description: `Prev ${id}`, categoriaNome: 'Aluguel', diasDeDiferenca: 2, diferencaCents: 0, outraConta: false, propostaId: null, ...extra })
const classificacao = { counterpartyId: 'cp-1', displayName: 'NETFLIX.COM', nature: 'expense', categoryId: 'cat-1', suggestionSource: 'historico', sugestaoContaId: null, ehCpfProprio: false, outrosNaFila: 2 }
const opts = { categoryOptions: [{ id: 'cat-1', label: 'Assinaturas', type: 'expense' }], accountOptions: [{ id: 'itau', name: 'Conta Itaú' }, { id: 'nu', name: 'Nubank' }] }

describe('FilaFoco', () => {
  it('mostra a conta em destaque e o progresso', () => {
    montar([{ ...base, id: 'a', description: 'PIX JOAO', candidatas: [cand('p1')] }], 27)
    expect(screen.getByText(/Itaú · Conta corrente/)).toBeInTheDocument()
    expect(screen.getByText(/••••5219/)).toBeInTheDocument()
    expect(screen.getByText('1 de 27')).toBeInTheDocument()
  })
  it('Enter vincula a melhor candidata; 2 vincula a segunda', async () => {
    montar([{ ...base, id: 'a', description: 'A', candidatas: [cand('p1'), cand('p2')] }, { ...base, id: 'b', description: 'B', candidatas: [cand('p3'), cand('p4')] }])
    await act(async () => { fireEvent.keyDown(document, { key: 'Enter' }) })
    expect(vincularPrevisao).toHaveBeenCalledWith('a', 'p1')
    await act(async () => { fireEvent.keyDown(document, { key: '2' }) })
    expect(vincularPrevisao).toHaveBeenCalledWith('b', 'p4')
  })
  it('"Não é nenhum" grava e passa para a classificação já preenchida', async () => {
    montar([{ ...base, id: 'a', description: 'NETFLIX', candidatas: [cand('p1')], classificacao }])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Não é nenhum/ })) })
    expect(marcarSemVinculo).toHaveBeenCalledWith('a')
    expect(screen.getByRole('checkbox', { name: /daqui pra frente/ })).toBeChecked()
    expect(screen.getByText('+2 na fila')).toBeInTheDocument()
  })
  it('confirmar com regra chama confirmCounterparty; sem regra, classificarSoEste', async () => {
    montar([{ ...base, id: 'a', description: 'X', classificacao }, { ...base, id: 'b', description: 'Y', classificacao: { ...classificacao, counterpartyId: 'cp-2' } }])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(confirmCounterparty).toHaveBeenCalledWith({ counterpartyId: 'cp-1', nature: 'expense', categoryId: 'cat-1', transferAccountId: null })
    fireEvent.click(screen.getByRole('checkbox', { name: /daqui pra frente/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(classificarSoEste).toHaveBeenCalledWith({ transactionId: 'b', counterpartyId: 'cp-2', nature: 'expense', categoryId: 'cat-1', transferAccountId: null })
  })
  it('atalho não dispara com foco num campo ou botão (Review Focus 5)', async () => {
    montar([{ ...base, id: 'a', description: 'X', classificacao }])
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(confirmCounterparty).not.toHaveBeenCalled()
  })
  it('previsão de outra conta aparece com aviso', () => {
    montar([{ ...base, id: 'a', description: 'X', candidatas: [cand('p1', { outraConta: true, contaNome: 'Nubank' })] }])
    expect(screen.getByText('outra conta')).toBeInTheDocument()
  })
  it('repetido: descartar chama aprovarDuplicata; "não é repetido" segue no mesmo lançamento', async () => {
    const repetido = { propostaId: 'd-1', outro: { id: 'm', date: '2026-09-12', description: 'UBER', amountCents: -2340 }, horasEntreEmissoes: 3 }
    montar([{ ...base, id: 'a', description: 'UBER', repetido, classificacao }])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Não é repetido/ })) })
    expect(recusarDuplicata).toHaveBeenCalledWith('d-1')
    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeInTheDocument()
  })
  it('pular manda para o fim; acabou → Tudo conciliado', async () => {
    montar([{ ...base, id: 'a', description: 'PRIMEIRO', classificacao }])
    fireEvent.click(screen.getByRole('button', { name: /Pular/ }))
    expect(screen.getByText(/1 pulado/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Revisar agora/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(screen.getByText('Tudo conciliado')).toBeInTheDocument()
  })
})
```
(`montar(itens, total = itens.length)` renderiza `<ToastProvider><FilaFoco itens={itens} total={total} {...opts} /></ToastProvider>`; `beforeEach` limpa os mocks.)

- [ ] **Step 2:** `npx vitest run __tests__/finance/fila-foco.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.** Regras de cada arquivo (cada um < 200 linhas):

`card-conta.tsx` — `rotuloDaConta`: tipo → `{ checking: 'Conta corrente', savings: 'Poupança', credit_card: 'Cartão', brokerage: 'Investimentos', cash: 'Dinheiro' }`; `titulo = [instituicao ?? nome, tipoLegivel].join(' · ')`; `detalhe` = cartão: `Cartão ••••${cardLastDigits}` se houver; senão `ag ${agencia} · cc ••••${numero.slice(-4)}` com as partes que existirem; `null` se nenhuma. `CardConta` renderiza bloco `rounded-lg bg-gray-50 px-3 py-2` com quadrado de 28px contendo a inicial da instituição, `titulo` em `font-semibold`, `detalhe` em `text-gray-600`, e "veio do Open Finance em DD/MM" (de `importedAt`, omitido se nulo).

`card-repetido.tsx` — texto "O banco parece ter mandado isto duas vezes", linha do `outro` com "emitido Nh antes" (`Math.round(horasEntreEmissoes)`), botões **Descartar este repetido** (primary), **Não é repetido**, **Pular**.

`card-candidatos.tsx` — rótulo "É um destes que você já lançou?"; cada candidata numerada `1 ·`, descrição em negrito, `categoriaNome`, `contaNome`, "previsto DD/MM", `formatBRL(amountCents)` e etiqueta do porquê: `diferencaCents === 0 ? 'valor igual' : \`${formatBRL(diferencaCents)} de diferença\`` + ` · ${diasDeDiferenca} dia(s)`; a primeira com borda verde e botão **Vincular** primary, as outras com `variant="outline"`; `outraConta` → etiqueta âmbar "outra conta". Abaixo: **Não é nenhum, lançar como novo** · **É repetido** só se o item tiver repetido (não ocorre nesta fase; omitir) · link **Procurar previsão** · **Pular**.

`card-classificar.tsx` — controlado: props `decisao: { nature; categoryId; transferAccountId; regra: boolean }`, `onMudar(d)`. Três botões de natureza (Despesa/Receita/Transferência); `Select` de categoria filtrado por `type === nature` (oculto em transferência); em transferência `Select` de conta com `accountOptions` **sem a conta do próprio lançamento**; selo "sugestão do histórico"/"sugestão do Claude" conforme `suggestionSource`; checkbox `<label>` "Fazer igual com {displayName} daqui pra frente" + `+{outrosNaFila} na fila` quando > 0 (o checkbox some quando `ehCpfProprio`, que é sempre por lançamento); botões **Confirmar** (primary, desabilitado se a decisão estiver incompleta), **Procurar previsão**, **Pular**.

`procurar-previsao.tsx` — input de busca (descrição ou valor) com debounce de 300 ms chamando `procurarPrevisoes(realizadoId, termo)`, lista os resultados no mesmo formato de `card-candidatos` (reusar o componente de linha exportado de lá: `export function LinhaDaCandidata`), botão **Fechar**.

`fila-foco.tsx` (`'use client'`) — estado `useReducer(reduzir, { itens, pulados: [], feitos: 0 })`; `atual = itens[0]`; `fase = faseDe(atual)`; estado local `decisao` reinicializado de `atual.classificacao` sempre que `atual.id` muda (`regra: !atual.classificacao.ehCpfProprio`); `procurando: boolean`; `ocupado: boolean` (desabilita botões e atalhos durante uma action). Ações:
- vincular(previsaoId): `vincularPrevisao(atual.id, previsaoId)`; `efetivada` → toast "Vinculado"; senão toast info "Esta previsão não está mais disponível. A fila foi atualizada." Em ambos, `resolvido`.
- nenhum: `marcarSemVinculo` → `semVinculo`.
- descartar / nãoÉRepetido: `aprovarDuplicata(repetido.propostaId)` → `resolvido`; `recusarDuplicata` → `semRepetido`.
- confirmar: com `decisao.regra` → `confirmCounterparty({ counterpartyId, nature, categoryId, transferAccountId })` → `regraConfirmada`; sem → `classificarSoEste({ transactionId: atual.id, counterpartyId, ... })`; `'error' in r` → toast error com a mensagem e `resolvido`; senão `resolvido`.
- Toda action em `try/catch` com `toast(mensagemDeErro(error, 'Não foi possível salvar'), 'error')`.
- Atalhos: `useEffect` com `keydown` em `document`; ignora se `ocupado` ou se `(e.target as HTMLElement).closest('button, input, select, textarea, [role="combobox"], [contenteditable="true"]')`; `Enter` = ação verde da fase; `1`–`3` = vincular candidata (fase candidatas); `n`/`N` = nenhum; `ArrowRight` = pular.
- Topo: `${feitos + 1} de ${total}`, barra de progresso `feitos / total`, e a legenda dos atalhos (`hidden sm:block`).
- `soRestamPulados` → "{n} pulado(s). Revisar agora?" com botão **Revisar agora** (`revisarPulados`).
- Lista vazia: se `feitos < total` e nada na mão, `router.refresh()` (próximo lote, spec §3.4) e mostra "Carregando os próximos…"; senão `<TudoConciliado />`.

- [ ] **Step 4:** teste → PASS; `wc -l components/finance/conciliar/*` (todos < 500).
- [ ] **Step 5: Commit** — `git add apps/web/components/finance/conciliar apps/web/__tests__/finance/fila-foco.test.tsx && git commit -m "feat(conciliar): cards e fila em modo foco"`

---

### Task 10: Página, Regras, links e remoção das seções

**Files:**
- Modify: `apps/web/app/(app)/transactions/conciliar/page.tsx`, `apps/web/app/(app)/transactions/{review,matches,duplicates}/page.tsx`, `apps/web/components/finance/menu-de-acoes-da-linha.tsx:47`, `apps/web/components/finance/transaction-display-row.tsx:142`, `apps/web/lib/ajuda/conteudo.ts` (tópico `filas`)
- Create: `apps/web/app/(app)/transactions/conciliar/regras/page.tsx`
- Delete: `components/finance/secoes-de-conciliar.tsx`, `secao-de-conciliar.tsx`, `rolar-para-a-secao.tsx`, `match-proposal-queue.tsx`, `duplicate-proposal-queue.tsx`, `components/openfinance/counterparty-queue-client.tsx`, `counterparty-item-row.tsx` e os testes deles: `__tests__/finance/{secoes-de-conciliar,rolar-para-a-secao,fila-de-conciliacao}.test.tsx`, `__tests__/openfinance/{counterparty-queue-client,counterparty-queue-client-ressincroniza,fila-detalhes-do-extrato}.test.tsx`
- Test: `__tests__/finance/pagina-conciliar.test.tsx`, `__tests__/finance/rotas-antigas-de-conciliar.test.ts`, `__tests__/finance/pagina-regras.test.tsx`

- [ ] **Step 1: Testes falhando.** Reescrever `pagina-conciliar.test.tsx`: mockar `@/lib/finance/conciliacao/fila-db` (`carregarFila`), `@/lib/finance/queries` (`getOrgId`, `getCategories` → `[]`, `getAccounts` → `[]`), `next/navigation` (`redirect` que lança) e `@/components/finance/conciliar/fila-foco` (renderiza `<div data-testid="fila" data-total={total} />`). Casos: (a) renderiza a fila com `total`; (b) link "Regras" aponta para `/transactions/conciliar/regras`; (c) `?regra=cp-1` → `redirect('/transactions/conciliar/regras?regra=cp-1')`; (d) `total 0` → "Tudo conciliado". Em `rotas-antigas-de-conciliar.test.ts`, trocar as expectativas: review → `/transactions/conciliar` (com `?regra=x` → `/transactions/conciliar/regras?regra=x`), matches e duplicates → `/transactions/conciliar`. `pagina-regras.test.tsx`: com regras, renderiza `RegrasConfirmadas` com `regraAberta`; sem regras, "Nenhuma regra confirmada ainda".
- [ ] **Step 2:** rodar os três → FAIL.
- [ ] **Step 3: Implementar.** `conciliar/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOrgId, getCategories, getAccounts } from '@/lib/finance/queries'
import { carregarFila } from '@/lib/finance/conciliacao/fila-db'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { FilaFoco } from '@/components/finance/conciliar/fila-foco'
import { TudoConciliado } from '@/components/finance/conciliar/tudo-conciliado'
import { PageHeader } from '@/components/ui/page-header'
import { LinkDeAjuda } from '@/components/ajuda/link-de-ajuda'

interface Props { searchParams: Promise<{ regra?: string }> }

/**
 * Um lançamento do banco por vez, com tudo que se decide sobre ele (spec
 * 2026-10-01). Nada aqui tranca o app; quem traz até aqui é a faixa e o botão
 * de Transações, o selo da linha e o assistente de conexão.
 */
export default async function ConciliarPage({ searchParams }: Props) {
  const { regra } = await searchParams
  if (regra) redirect(`/transactions/conciliar/regras?regra=${encodeURIComponent(regra)}`)

  const orgId = await getOrgId()
  const [{ itens, total }, categories, accounts] = await Promise.all([carregarFila(orgId), getCategories(orgId), getAccounts(orgId)])
  const categoryOptions = toCategoryOptions(categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })))

  return (
    <div className="space-y-6">
      <PageHeader title="Conciliar" description="Um lançamento do banco por vez. Nada muda sem você aprovar.">
        <Link href="/transactions/conciliar/regras" className="text-sm text-gray-600 underline">Regras</Link>
        <LinkDeAjuda topico="filas" />
      </PageHeader>
      {total === 0 ? (
        <TudoConciliado />
      ) : (
        <FilaFoco itens={itens} total={total} categoryOptions={categoryOptions} accountOptions={accounts.map((a) => ({ id: a.id, name: a.name }))} />
      )}
    </div>
  )
}
```

`conciliar/regras/page.tsx`: `getConfirmedCounterparties`, `getCategories`, `getAccounts` → `<PageHeader title="Regras" description="O que o floow faz sozinho com cada favorecido. Corrigir aqui vale para os próximos.">` com link "Voltar para Conciliar"; lista vazia → "Nenhuma regra confirmada ainda."; senão `<RegrasConfirmadas confirmed={...} categoryOptions={...} accountOptions={...} regraAberta={regra} />`.

Rotas antigas: `duplicates` e `matches` → `redirect('/transactions/conciliar')`; `review` → com `regra`, `/transactions/conciliar/regras?regra=...`, senão `/transactions/conciliar`. Atualizar os docblocks ("viraram o modo foco").
`menu-de-acoes-da-linha.tsx:47` → ``href: `/transactions/conciliar/regras?regra=${tx.counterpartyId}` ``. `transaction-display-row.tsx:142` → `href="/transactions/conciliar"`.
`lib/ajuda/conteudo.ts`, tópico `filas`: reescrever o texto para o modo foco (um lançamento por vez; vincular a um parecido, descartar repetido ou classificar; atalhos Enter/1-3/N/→; regras em "Regras"). Ler o texto atual antes e manter o tom.

Apagar os arquivos listados com `git rm`. Antes, `grep -rn` por cada nome de componente em `apps/web/app apps/web/components apps/web/lib` — tem de sobrar zero importação.

- [ ] **Step 4:** `npx vitest run` (suíte inteira) → PASS (anote e investigue qualquer falha nova); `npx tsc --noEmit -p .` limpo.
- [ ] **Step 5: Commit** — `git add` dos arquivos modificados/criados (o `git rm` já indexou as remoções) e `git commit -m "feat(conciliar): tela em modo foco substitui as três seções"`

---

### Task 11: Verificação no banco real e build

- [ ] **Step 1:** Abrir `supabase/migrations/00072_vinculo_revisado.sql` no editor para o usuário copiar e aplicar no SQL Editor do projeto `vntvwvhpquyayuiypacf` (conferir o projeto selecionado). Não colar SQL pelo terminal.
- [ ] **Step 2:** Script descartável no scratchpad que, com `getDb()` e `DATABASE_URL` do `.env.local`, abre `db.transaction`, roda `lerFila(tx, <orgId com dados>)`, imprime contagem por tipo e as 3 primeiras candidatas, chama `vincularNoBanco` no primeiro item com candidata, confere `matched_transaction_id` e `review_state`, e lança `new Error('rollback')` no fim. Esperado: lista não vazia, vínculo gravado dentro da transação, nada persistido depois.
- [ ] **Step 3:** `cd apps/web && npm run build` → sucesso.
- [ ] **Step 4:** Subir `npm run dev`, abrir `/transactions/conciliar` no Chrome logado na org com dados, percorrer 3 cards (vincular, não é nenhum, pular) e conferir o contador da faixa de Transações.
- [ ] **Step 5:** Relatar ao usuário; o merge em `master` e o push só com o ok dele (fluxo do projeto: merge direto + push, build antes).
