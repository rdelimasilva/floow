# Conciliar: um fluxo só, sem trava — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Juntar Remover repetidos, Classificar lançamentos e Confirmar previsões numa tela só, `/transactions/conciliar`, e tirar o portão que tranca o app até Classificar ficar vazia.

**Arquitetura:** Uma página nova monta três seções, cada uma um server component assíncrono dentro do seu `<Suspense>`, que busca os próprios dados, some quando vazia e vira aviso de falha sem derrubar as outras. Um helper único, `contarItensParaConciliar`, soma as três contagens para a faixa, o botão de Transações e o assistente de conexão. As rotas antigas viram `redirect()`; o portão (`ReviewGate`, `getReviewGateStatus*`, `reviewGateTag`, gravação de `reviewGateClearedAt`) sai inteiro. Ações, queries das filas e tabelas não mudam.

**Stack:** Next.js App Router (server components + server actions), React 19, Drizzle, vitest + React Testing Library (testes mockam o banco).

**Spec:** `docs/superpowers/specs/2026-09-29-conciliar-fluxo-unico-design.md`

## Restrições globais

- Nenhum arquivo passa de 500 linhas (CLAUDE.md). Os maiores tocados: `counterparty-queue-client.tsx` (412 → ~405), `transaction-display-row.tsx` (351), `counterparty-queries.ts` (329 → ~240), `connect-wizard.tsx` (269 → ~280), `transactions/page.tsx` (240 → ~245). Rode `wc -l` antes de cada commit.
- Nomes e textos em português do Brasil ("você", "tela"); nomes de código seguem o padrão do repo (`contarItensParaConciliar`, `SecaoRepetidos`).
- Comentários dizem o PORQUÊ, na densidade do código em volta.
- **Menu lateral: sem item novo.** `__tests__/finance/filas-fora-do-menu.test.tsx` continua passando.
- Rotas antigas: `redirect()` do Next no `page.tsx`; `/transactions/review` preserva `?regra=`.
- Âncoras das seções: `#repetidos`, `#classificar`, `#confirmar`, nessa ordem na tela.
- A coluna `orgs.review_gate_cleared_at` fica no banco, sem migration.
- Não mexer em: `confirmCounterparty` (fora o trecho do portão), `corrigirRegra`, `aprovarProposta`, `recusarProposta`, `aprovarDuplicata`, `recusarDuplicata`, nas queries das filas nem em `conciliarConta`.
- Arquivo novo que chame `getDb()` precisa entrar em `__tests__/auth/rls-ledger.test.ts`. Os arquivos novos deste plano só usam funções que já passam por `withUserDb`/`withUserDbFor`, então não entram.
- Git: tudo no worktree da branch `feat/conciliar-fluxo-unico`. Antes de cada commit, `git branch --show-current` precisa imprimir `feat/conciliar-fluxo-unico` (outra sessão pode trocar a branch no mesmo diretório). `git add` só com caminhos explícitos, nunca `-A` nem `.`. Merge e push ficam com o controlador.
- Comandos de teste rodam da raiz do worktree: `pnpm --filter @floow/web exec vitest run <caminho>`.
- Toda mensagem de commit termina com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## Foco da revisão

1. **Link com âncora para seção que chega por streaming** (`/transactions/conciliar#confirmar` vindo do selo da linha): a seção entra depois do primeiro paint, e o navegador já desistiu de rolar. O esperado é a tela parar na seção. Teste em `rolar-para-a-secao.test.tsx` (Tarefa 3).
2. **`?regra=` sem nada pendente para classificar:** "Corrigir regra" num lançamento antigo, com a fila zerada. O esperado é a seção Classificar aparecer (as regras moram nela) já com a regra aberta. Teste em `secoes-de-conciliar.test.tsx` (Tarefa 3) e em `pagina-conciliar.test.tsx` (Tarefa 4).
3. **Uma contagem falha ou não há usuário resolvido:** a faixa e o botão não podem sumir nem quebrar a tela de Transações. O esperado é a contagem que falhou valer 0 e as outras seguirem. Teste em `itens-para-conciliar.test.ts` (Tarefa 1).
4. **`?regra=` com caractere especial ou vazio** na rota antiga: o esperado é o id chegar codificado e `?regra=` vazio não virar `?regra=` no destino. Teste em `rotas-antigas-de-conciliar.test.ts` (Tarefa 4).
5. **Conexão concluída com conta ambígua ou faltando:** a tela do assistente mostra "escolha qual vai para onde"; ir para Conciliar esconderia esse aviso. O esperado é o assistente ficar na tela quando há pendência de vínculo, mesmo com itens para conciliar. Teste em `wizard-passos.test.ts` (Tarefa 7).

---

## Mapa de arquivos

Novos:
- `apps/web/lib/finance/itens-para-conciliar.ts`: `contarItensParaConciliar` (soma as três filas; falha vale 0).
- `apps/web/lib/finance/itens-para-conciliar-actions.ts`: server action `totalParaConciliar` para o assistente (cliente).
- `apps/web/components/finance/secao-de-conciliar.tsx`: moldura da seção (título, contador, âncora), `FalhaDaSecao`, `TudoConciliado`, textos das seções.
- `apps/web/components/finance/rolar-para-a-secao.tsx`: cliente, rola até a seção do `#hash` quando ela monta.
- `apps/web/components/finance/secoes-de-conciliar.tsx`: `SecaoRepetidos`, `SecaoClassificar`, `SecaoConfirmar` (async, cada uma busca os próprios dados).
- `apps/web/components/finance/botao-conciliar.tsx`: botão "Conciliar (N)" do cabeçalho de Transações.
- `apps/web/app/(app)/transactions/conciliar/page.tsx` e `loading.tsx`.

Alterados: `app/(app)/layout.tsx`, `transactions/{review,matches,duplicates}/page.tsx`, `transactions/page.tsx`, `pending-queues-notice.tsx`, `pending-queues-slot.tsx`, `transaction-display-row.tsx`, `menu-de-acoes-da-linha.tsx`, `counterparty-queue-client.tsx`, `counterparty-queries.ts`, `counterparty-actions.ts`, `cache-tags.ts`, `connect-wizard.tsx`, `wizard-passos.ts`, `command-palette.tsx`, `lib/ajuda/conteudo.ts`, `forecast-match-queries.ts` (só docblock).

Removidos: `components/openfinance/review-gate.tsx`, `components/openfinance/counterparty-queue.tsx` (a busca de dados dela passa para `SecaoClassificar`), `lib/finance/forecast-match-badge.ts`, `__tests__/finance/forecast-match-badge.test.ts`, `__tests__/openfinance/counterparty-queries.test.ts` (o arquivo inteiro testa o portão).

---

### Tarefa 1: Contagem única `contarItensParaConciliar`

**Arquivos:**
- Criar: `apps/web/lib/finance/itens-para-conciliar.ts`
- Criar: `apps/web/lib/finance/itens-para-conciliar-actions.ts`
- Teste: `apps/web/__tests__/finance/itens-para-conciliar.test.ts`

**Interfaces:**
- Consome: `contarDuplicatasPendentes(orgId: string, userId: string): Promise<number>` (`lib/finance/duplicata-queries.ts`), `contarLancamentosAClassificar(orgId: string): Promise<number>` (`lib/openfinance/counterparty-queries.ts`), `contarPropostasPendentes(orgId: string, userId: string): Promise<number>` (`lib/finance/forecast-match-queries.ts`), `getOrgId()` (`lib/finance/queries`), `getVerifiedIdentity(): Promise<{ userId: string } | null>` (`lib/auth/session`).
- Produz:
  - `interface ItensParaConciliar { repetidos: number; classificar: number; confirmar: number; total: number }`
  - `contarItensParaConciliar(orgId: string, userId: string | null): Promise<ItensParaConciliar>` (envolto em `cache` do React)
  - `totalParaConciliar(): Promise<number>` (server action; nunca lança)

- [ ] **Passo 1: Escrever o teste que falha**

`apps/web/__tests__/finance/itens-para-conciliar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A faixa, o botão de Transações e o assistente de conexão leem o mesmo total.
 * Contagem que falha vale 0: um aviso não pode custar a tela que ele existe
 * para melhorar.
 */

const contarDuplicatasPendentes = vi.fn(async (_orgId: string, _userId: string) => 2)
const contarLancamentosAClassificar = vi.fn(async (_orgId: string) => 5)
const contarPropostasPendentes = vi.fn(async (_orgId: string, _userId: string) => 1)
const getOrgId = vi.fn(async () => 'org-1')
const getVerifiedIdentity = vi.fn(async () => ({ userId: 'user-1' }) as { userId: string } | null)

vi.mock('@/lib/finance/duplicata-queries', () => ({ contarDuplicatasPendentes }))
vi.mock('@/lib/openfinance/counterparty-queries', () => ({ contarLancamentosAClassificar }))
vi.mock('@/lib/finance/forecast-match-queries', () => ({ contarPropostasPendentes }))
vi.mock('@/lib/finance/queries', () => ({ getOrgId }))
vi.mock('@/lib/auth/session', () => ({ getVerifiedIdentity }))

const { contarItensParaConciliar } = await import('@/lib/finance/itens-para-conciliar')
const { totalParaConciliar } = await import('@/lib/finance/itens-para-conciliar-actions')

beforeEach(() => {
  contarDuplicatasPendentes.mockReset().mockResolvedValue(2)
  contarLancamentosAClassificar.mockReset().mockResolvedValue(5)
  contarPropostasPendentes.mockReset().mockResolvedValue(1)
  getOrgId.mockReset().mockResolvedValue('org-1')
  getVerifiedIdentity.mockReset().mockResolvedValue({ userId: 'user-1' })
})

describe('contarItensParaConciliar', () => {
  it('devolve cada fila e a soma das três', async () => {
    expect(await contarItensParaConciliar('org-1', 'user-1')).toEqual({
      repetidos: 2, classificar: 5, confirmar: 1, total: 8,
    })
    expect(contarDuplicatasPendentes).toHaveBeenCalledWith('org-1', 'user-1')
    expect(contarPropostasPendentes).toHaveBeenCalledWith('org-1', 'user-1')
    expect(contarLancamentosAClassificar).toHaveBeenCalledWith('org-1')
  })

  it('contagem que falha vale 0 e não derruba as outras', async () => {
    contarLancamentosAClassificar.mockRejectedValue(new Error('db indisponível'))

    expect(await contarItensParaConciliar('org-1', 'user-1')).toEqual({
      repetidos: 2, classificar: 0, confirmar: 1, total: 3,
    })
  })

  it('sem usuário resolvido, repetidos e previsões contam 0 sem consultar', async () => {
    expect(await contarItensParaConciliar('org-1', null)).toEqual({
      repetidos: 0, classificar: 5, confirmar: 0, total: 5,
    })
    expect(contarDuplicatasPendentes).not.toHaveBeenCalled()
    expect(contarPropostasPendentes).not.toHaveBeenCalled()
  })
})

describe('totalParaConciliar', () => {
  it('devolve o total da org de quem chama', async () => {
    expect(await totalParaConciliar()).toBe(8)
  })

  it('falha em resolver a org vira 0, não erro na tela do assistente', async () => {
    getOrgId.mockRejectedValue(new Error('No organization found for user'))

    expect(await totalParaConciliar()).toBe(0)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/finance/itens-para-conciliar.test.ts`
Esperado: FAIL, com erro de import (`Failed to resolve import "@/lib/finance/itens-para-conciliar"`).

- [ ] **Passo 3: Implementar**

`apps/web/lib/finance/itens-para-conciliar.ts`:

```ts
import { cache } from 'react'
import { contarDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { contarPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { contarLancamentosAClassificar } from '@/lib/openfinance/counterparty-queries'

export interface ItensParaConciliar {
  repetidos: number
  classificar: number
  confirmar: number
  total: number
}

/**
 * Quanto espera decisão na tela Conciliar, fila por fila e somado.
 *
 * Uma fonte só para a faixa e o botão de Transações e para o assistente de
 * conexão: se cada um somasse do seu jeito, o número do botão e o da faixa
 * poderiam discordar na mesma tela.
 *
 * Falha numa contagem vale 0 e não derruba as outras. É o mesmo "fail open"
 * da faixa: um aviso não pode custar a tela que ele existe para melhorar. Sem
 * usuário resolvido, as filas que precisam dele para o RLS (`withUserDbFor`)
 * contam zero.
 *
 * `cache` do React: a tela de Transações pergunta duas vezes no mesmo request
 * (faixa e botão), e as três consultas só precisam rodar uma vez.
 */
export const contarItensParaConciliar = cache(
  async (orgId: string, userId: string | null): Promise<ItensParaConciliar> => {
    const [repetidos, classificar, confirmar] = await Promise.all([
      userId === null ? 0 : contarDuplicatasPendentes(orgId, userId).catch(() => 0),
      contarLancamentosAClassificar(orgId).catch(() => 0),
      userId === null ? 0 : contarPropostasPendentes(orgId, userId).catch(() => 0),
    ])
    return { repetidos, classificar, confirmar, total: repetidos + classificar + confirmar }
  },
)
```

`apps/web/lib/finance/itens-para-conciliar-actions.ts`:

```ts
'use server'

import { getOrgId } from '@/lib/finance/queries'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { contarItensParaConciliar } from './itens-para-conciliar'

/**
 * O total da tela Conciliar para quem está no cliente: o assistente de
 * conexão, depois do primeiro import, decide se leva o usuário para lá.
 *
 * Nunca lança. Sem o portão, este número só escolhe o destino de uma
 * navegação, e erro aqui não pode virar tela de erro no fim de uma conexão
 * que deu certo: na dúvida, 0, e o assistente fica onde está.
 */
export async function totalParaConciliar(): Promise<number> {
  try {
    const [orgId, identity] = await Promise.all([getOrgId(), getVerifiedIdentity()])
    const { total } = await contarItensParaConciliar(orgId, identity?.userId ?? null)
    return total
  } catch {
    return 0
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/finance/itens-para-conciliar.test.ts`
Esperado: PASS (5 testes).

- [ ] **Passo 5: Commit**

```bash
git branch --show-current   # precisa imprimir feat/conciliar-fluxo-unico
git add apps/web/lib/finance/itens-para-conciliar.ts apps/web/lib/finance/itens-para-conciliar-actions.ts apps/web/__tests__/finance/itens-para-conciliar.test.ts
git commit -m "feat(conciliar): contagem única das três filas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Tirar o portão

**Arquivos:**
- Modificar: `apps/web/app/(app)/layout.tsx:8-9,19-34`
- Remover: `apps/web/components/openfinance/review-gate.tsx`
- Modificar: `apps/web/lib/openfinance/counterparty-queries.ts:1-101,149-165`
- Modificar: `apps/web/lib/openfinance/counterparty-actions.ts:4-11,111-144`
- Modificar: `apps/web/lib/cache-tags.ts:17-20`
- Modificar: `apps/web/components/openfinance/counterparty-queue-client.tsx:20-27,42,197-201,407`
- Modificar: `apps/web/components/openfinance/counterparty-queue.tsx` (sem `mode`)
- Modificar: `apps/web/app/(app)/transactions/review/page.tsx:24` (sem `mode="page"`)
- Teste: criar `apps/web/__tests__/layout/sem-portao.test.tsx`
- Teste: modificar `apps/web/__tests__/openfinance/counterparty-actions.test.ts:125-185`, `counterparty-actions-par.test.ts`
- Teste: remover `apps/web/__tests__/openfinance/counterparty-queries.test.ts`
- Teste: tirar `mode: 'page'` de `counterparty-queue-client.test.tsx`, `counterparty-queue-client-ressincroniza.test.tsx`, `fila-detalhes-do-extrato.test.tsx`

**Interfaces:**
- Consome: nada das tarefas anteriores.
- Produz: `CounterpartyQueueClient` com props `{ pending: PendingGroup[]; confirmed: ConfirmedCounterparty[]; categoryOptions: CategoryOption[]; accountOptions: AccountOption[]; regraAberta?: string }` (sem `mode`). `counterparty-queries.ts` deixa de exportar `getReviewGateStatus` e `getReviewGateStatusSafe`; `cache-tags.ts` deixa de exportar `reviewGateTag`.

- [ ] **Passo 1: Escrever os testes que falham**

`apps/web/__tests__/layout/sem-portao.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * Nenhuma decisão tranca o app (spec 2026-09-29, §3.3). Até aqui o layout
 * trocava o app inteiro pela fila de Classificar enquanto houvesse pendência.
 *
 * O mock abaixo responde "bloqueado", como o portão responderia para uma org
 * recém-conectada. Se o layout voltar a perguntar, o app some e este teste
 * quebra.
 */

vi.mock('@/lib/openfinance/counterparty-queries', () => ({
  getReviewGateStatusSafe: async () => ({ ok: true, orgId: 'org-1', blocked: true }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/lib/auth/session', () => ({
  getShellProfile: async () => ({ email: 'ana@exemplo.com', name: 'Ana', avatarUrl: null }),
}))
vi.mock('@/components/layout/app-shell', () => ({ AppShell: () => null }))
vi.mock('@/components/layout/sidebar-layout', async () => {
  const React = await import('react')
  return { SidebarLayout: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children) }
})
vi.mock('@/components/layout/sidebar-context', async () => {
  const React = await import('react')
  return {
    SIDEBAR_COOKIE_NAME: 'sidebar-pinned',
    SidebarProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  }
})
vi.mock('@/components/providers/apply-due-provider', async () => {
  const React = await import('react')
  return { ApplyDueProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }
})

const { default: AppLayout } = await import('@/app/(app)/layout')

describe('layout do app sem portão', () => {
  it('com lançamentos pendentes de classificar, o app renderiza normal', async () => {
    render(await AppLayout({ children: React.createElement('p', null, 'conteúdo do app') }))

    screen.getByText('conteúdo do app')
    expect(screen.queryByText('Antes de continuar')).toBeNull()
  })
})
```

Em `apps/web/__tests__/openfinance/counterparty-actions.test.ts`, troque os dois testes do portão (linhas 155-185: `'zera a última pendência resolvível da org: grava reviewGateClearedAt em orgs'` e `'ainda sobra pendência resolvível na org: não grava reviewGateClearedAt'`) por este:

```ts
  it('zerar a fila não grava nada em orgs: não há mais portão para destravar', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties
    updateQueue.push([{ id: 'tx-1' }]) // 1 transação reclassificada
    // Se a checagem do portão ainda existisse, este "nada pendente" a faria
    // gravar `reviewGateClearedAt` em orgs.
    selectQueue.push([])

    await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
    })

    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
    expect(ops.some((o) => o.table === 'orgs')).toBe(false)
  })
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/layout/sem-portao.test.tsx __tests__/openfinance/counterparty-actions.test.ts`
Esperado: FAIL nos dois. O layout renderiza o `ReviewGate` ("Antes de continuar") no lugar de "conteúdo do app"; `confirmCounterparty` grava em `orgs` (`['counterparties', 'transactions', 'orgs']`).

- [ ] **Passo 3: Tirar o portão do layout**

Em `apps/web/app/(app)/layout.tsx`, apague os imports das linhas 8-9 (`getReviewGateStatusSafe` e `ReviewGate`) e troque as linhas 19-39 por:

```tsx
  // Nenhuma ida ao servidor de Auth: o perfil vem do token já verificado. Este
  // layout roda em toda navegação, antes até do skeleton, e cada ida à rede
  // aqui é espera em todas as telas.
  //
  // O portão de Classificar saiu (spec 2026-09-29): nenhuma decisão tranca o
  // app. As filas se anunciam na tela de Transações (`PendingQueuesNotice`),
  // e o layout volta a não consultar nada além do perfil.
  const profile = await getShellProfile()

  if (!profile) {
    redirect('/auth')
  }

  const cookieStore = await cookies()
  const sidebarPinned = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'
```

O `return` que vem depois (linhas 43-61) fica como está.

- [ ] **Passo 4: Apagar o componente do portão**

```bash
git rm apps/web/components/openfinance/review-gate.tsx
```

- [ ] **Passo 5: Tirar o portão das queries**

Em `apps/web/lib/openfinance/counterparty-queries.ts`:

1. Troque as linhas 1-11 (imports) por:

```ts
import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { transactions, counterparties, accounts } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { condicaoForaDeParDeTransferenciaPendente } from '@/lib/finance/forecast-match-db'
import { carregarHashesDoTitular, ehCpfProprio } from '@/lib/openfinance/cpf-proprio'
import { carregarCandidatosDePar, sugerirContaDoPar } from '@/lib/openfinance/sugestao-par'
```

2. Apague as linhas 13-101 inteiras (docblock + `getReviewGateStatus`, `isReviewGateCleared`, `ReviewGateSafeResult`, `getReviewGateStatusSafe`).

3. As linhas 149-165 têm dois docblocks colados: o de `getPendingCounterpartyGroups` ficou órfão em cima do de `contarLancamentosAClassificar`. Troque os dois pelo docblock abaixo (em cima de `contarLancamentosAClassificar`) e mova "Contrapartes pendentes da org…" para logo acima de `export async function getPendingCounterpartyGroups`:

```ts
/**
 * Quantos lançamentos esperam classificação.
 *
 * Mesma condição da fila (`getPendingCounterpartyGroups`): `review_state =
 * 'pending'` com contraparte já identificada. Contador que anuncia o que a
 * tela não mostra manda o usuário procurar decisão que não existe.
 *
 * Conta LANÇAMENTOS, não contrapartes: é o número que o usuário vê na lista.
 * A fila agrupa por contraparte para decidir de uma vez, mas isso é detalhe
 * da tela de lá.
 */
```

```ts
/**
 * Contrapartes pendentes da org, com os lançamentos por trás de cada uma.
 * Ordenada por dinheiro — o mesmo princípio que o detector antigo já validou:
 * "R$ 92 mil" move o usuário, "12 lançamentos" não.
 */
```

- [ ] **Passo 6: Tirar o portão da action**

Em `apps/web/lib/openfinance/counterparty-actions.ts`:

1. Imports (linhas 4-11) passam a ser:

```ts
import { and, eq } from 'drizzle-orm'
import { getDb, counterparties } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { assertAccountOwnership } from '@/lib/finance/account-actions'
import { requireIdentity } from '@/lib/auth/session'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { conciliarContas } from '@/lib/finance/conciliacao/conciliar-conta'
```

2. Apague as linhas 111-135 (o comentário "Se esta foi a última pendência…", o `select` de `stillPending` e o `update(orgs)`), deixando `return reclassifiedCount` logo depois de `aplicarDecisaoAosPendentes`.

3. Apague as linhas 142-144 (o comentário "O layout guarda em cache se o portão…" e `invalidateTag(reviewGateTag(orgId))`).


- [ ] **Passo 7: Tirar a tag do portão**

Em `apps/web/lib/cache-tags.ts`, apague as linhas 17-20 (docblock e `reviewGateTag`).

- [ ] **Passo 8: Tirar o modo bloqueante da fila**

Em `apps/web/components/openfinance/counterparty-queue-client.tsx`:

- Na `interface Props` (linha 21), apague `mode: 'blocking' | 'page'`.
- Linha 42: `function FilaDeClassificar({ pending: initialPending, confirmed, categoryOptions, accountOptions, regraAberta }: Props) {`
- Apague as linhas 197-201 (o `if (pending.length === 0 && mode === 'blocking')` com o "Tudo revisado — atualizando…").
- Linha 407: `{confirmed.length > 0 && (`

Em `apps/web/components/openfinance/counterparty-queue.tsx`, troque a função por:

```tsx
export async function CounterpartyQueue({ orgId, regraAberta }: { orgId: string; regraAberta?: string }) {
  const [pending, confirmed, categories, accounts] = await Promise.all([
    getPendingCounterpartyGroups(orgId),
    getConfirmedCounterparties(orgId),
    getCategories(orgId),
    getAccounts(orgId),
  ])

  const categoryOptions = toCategoryOptions(
    categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
  )
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))

  return (
    <CounterpartyQueueClient
      pending={pending}
      confirmed={confirmed}
      categoryOptions={categoryOptions}
      accountOptions={accountOptions}
      regraAberta={regraAberta}
    />
  )
}
```

(Ele some de vez na Tarefa 4, quando `/transactions/review` vira redirect.)

Em `apps/web/app/(app)/transactions/review/page.tsx:24`: `<CounterpartyQueue orgId={orgId} regraAberta={regra} />`

- [ ] **Passo 9: Limpar os testes do portão**

```bash
git rm apps/web/__tests__/openfinance/counterparty-queries.test.ts
# a checagem do portão era o último select da transação; os testes enfileiravam a resposta dela
sed -i -E "/selectQueue\.push\(\[\{ one: 1 \}\]\)/d" apps/web/__tests__/openfinance/counterparty-actions.test.ts apps/web/__tests__/openfinance/counterparty-actions-par.test.ts
# a prop `mode` saiu do cliente
sed -i -E "s/mode: 'page', //; /^\s*mode: 'page'( as const)?,\s*$/d" apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx apps/web/__tests__/openfinance/counterparty-queue-client-ressincroniza.test.tsx apps/web/__tests__/openfinance/fila-detalhes-do-extrato.test.tsx
grep -rn "mode: 'page'\|one: 1\|reviewGate" apps/web/__tests__/openfinance
```

Esperado no `grep`: nenhuma linha. No teste de `counterparty-actions.test.ts`, confira também se o comentário do teste `'atualiza a contraparte e só as transações pendentes dela'` não ficou citando o portão.

- [ ] **Passo 10: Rodar e ver passar**

Rode:
```bash
pnpm --filter @floow/web exec vitest run __tests__/layout/sem-portao.test.tsx __tests__/openfinance
pnpm --filter @floow/web typecheck
```
Esperado: PASS, e o typecheck sem erro (nenhum import restante de `getReviewGateStatus*`, `ReviewGate`, `reviewGateTag` ou `mode`).

- [ ] **Passo 11: Commit**

```bash
git branch --show-current   # feat/conciliar-fluxo-unico
wc -l apps/web/components/openfinance/counterparty-queue-client.tsx apps/web/lib/openfinance/counterparty-queries.ts
git add apps/web/app/\(app\)/layout.tsx apps/web/lib/openfinance/counterparty-queries.ts apps/web/lib/openfinance/counterparty-actions.ts apps/web/lib/cache-tags.ts apps/web/components/openfinance/counterparty-queue-client.tsx apps/web/components/openfinance/counterparty-queue.tsx apps/web/app/\(app\)/transactions/review/page.tsx apps/web/__tests__/layout/sem-portao.test.tsx apps/web/__tests__/openfinance/counterparty-actions.test.ts apps/web/__tests__/openfinance/counterparty-actions-par.test.ts apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx apps/web/__tests__/openfinance/counterparty-queue-client-ressincroniza.test.tsx apps/web/__tests__/openfinance/fila-detalhes-do-extrato.test.tsx
git commit -m "feat(conciliar): nenhuma decisão tranca o app

O portão de Classificar sai do layout, junto com getReviewGateStatus*,
reviewGateTag, a gravação de reviewGateClearedAt e o modo bloqueante da
fila. A coluna fica no banco sem uso.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Os `git rm` dos Passos 4 e 9 já deixaram as remoções no índice.)

---

### Tarefa 3: As três seções da tela Conciliar

**Arquivos:**
- Criar: `apps/web/components/finance/secao-de-conciliar.tsx`
- Criar: `apps/web/components/finance/rolar-para-a-secao.tsx`
- Criar: `apps/web/components/finance/secoes-de-conciliar.tsx`
- Teste: `apps/web/__tests__/finance/secoes-de-conciliar.test.tsx`
- Teste: `apps/web/__tests__/finance/rolar-para-a-secao.test.tsx`

**Interfaces:**
- Consome: `CounterpartyQueueClient` sem `mode` (Tarefa 2); `getDuplicatasPendentes(orgId): Promise<DuplicataPendente[]>`; `getPropostasPendentes(orgId): Promise<PropostaPendente[]>`; `getPendingCounterpartyGroups(orgId): Promise<PendingGroup[]>`; `getConfirmedCounterparties(orgId): Promise<ConfirmedCounterparty[]>`; `getCategories`, `getAccounts` (`lib/finance/queries`); `toCategoryOptions` (`lib/finance/category-options`); `DuplicateProposalQueue({ propostas })`; `MatchProposalQueue({ propostas })`.
- Produz:
  - `type IdDaSecao = 'repetidos' | 'classificar' | 'confirmar'`
  - `SecaoDeConciliar({ id: IdDaSecao; contagem: number; children?: React.ReactNode })`
  - `FalhaDaSecao({ id: IdDaSecao })`
  - `TudoConciliado()`
  - `RolarParaASecao({ id: string })` (cliente)
  - `SecaoRepetidos({ orgId: string }): Promise<JSX.Element | null>`
  - `SecaoClassificar({ orgId: string; regraAberta?: string }): Promise<JSX.Element | null>`
  - `SecaoConfirmar({ orgId: string }): Promise<JSX.Element | null>`

- [ ] **Passo 1: Escrever os testes que falham**

`apps/web/__tests__/finance/secoes-de-conciliar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'

/**
 * Cada seção da tela Conciliar busca os próprios dados, some quando não há
 * nada para decidir e, se a busca falhar, vira um aviso sem derrubar as
 * outras duas. Classificar aparece também só com regras confirmadas: a lista
 * de regras mora nela.
 */

const getDuplicatasPendentes = vi.fn()
const getPropostasPendentes = vi.fn()
const getPendingCounterpartyGroups = vi.fn()
const getConfirmedCounterparties = vi.fn()

vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))
vi.mock('@/lib/finance/duplicata-queries', () => ({ getDuplicatasPendentes }))
vi.mock('@/lib/finance/forecast-match-queries', () => ({ getPropostasPendentes }))
vi.mock('@/lib/openfinance/counterparty-queries', () => ({ getPendingCounterpartyGroups, getConfirmedCounterparties }))
vi.mock('@/lib/finance/queries', () => ({ getCategories: async () => [], getAccounts: async () => [] }))
vi.mock('@/components/finance/duplicate-proposal-queue', async () => {
  const React = await import('react')
  return {
    DuplicateProposalQueue: ({ propostas }: { propostas: unknown[] }) =>
      React.createElement('div', { 'data-testid': 'fila-repetidos' }, `${propostas.length} propostas`),
  }
})
vi.mock('@/components/finance/match-proposal-queue', async () => {
  const React = await import('react')
  return {
    MatchProposalQueue: ({ propostas }: { propostas: unknown[] }) =>
      React.createElement('div', { 'data-testid': 'fila-confirmar' }, `${propostas.length} propostas`),
  }
})
vi.mock('@/components/openfinance/counterparty-queue-client', async () => {
  const React = await import('react')
  return {
    CounterpartyQueueClient: ({ regraAberta }: { regraAberta?: string }) =>
      React.createElement('div', { 'data-testid': 'fila-classificar', 'data-regra': regraAberta ?? '' }),
  }
})

const { SecaoRepetidos, SecaoClassificar, SecaoConfirmar } = await import('@/components/finance/secoes-de-conciliar')

function grupo(count: number) {
  return { counterpartyId: `cp-${count}`, displayName: 'Loja', keyType: 'tax_id', count, totalCents: -1000, items: [], ehCpfProprio: false }
}

async function montar(secao: Promise<React.ReactElement | null>) {
  const el = await secao
  if (el) render(el)
  return el
}

beforeEach(() => {
  getDuplicatasPendentes.mockReset().mockResolvedValue([])
  getPropostasPendentes.mockReset().mockResolvedValue([])
  getPendingCounterpartyGroups.mockReset().mockResolvedValue([])
  getConfirmedCounterparties.mockReset().mockResolvedValue([])
})

describe('seção Repetidos', () => {
  it('vazia não aparece', async () => {
    expect(await montar(SecaoRepetidos({ orgId: 'org-1' }))).toBeNull()
  })

  it('com propostas, mostra título com contador e âncora', async () => {
    getDuplicatasPendentes.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }])

    await montar(SecaoRepetidos({ orgId: 'org-1' }))

    const secao = screen.getByRole('region', { name: /Remover repetidos/ })
    expect(secao.id).toBe('repetidos')
    within(secao).getByText('2')
    within(secao).getByTestId('fila-repetidos')
  })

  it('falha na busca vira aviso na própria seção, sem lançar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getDuplicatasPendentes.mockRejectedValue(new Error('db indisponível'))

    await montar(SecaoRepetidos({ orgId: 'org-1' }))

    const secao = screen.getByRole('region', { name: /Remover repetidos/ })
    within(secao).getByRole('alert')
  })
})

describe('seção Confirmar', () => {
  it('vazia não aparece', async () => {
    expect(await montar(SecaoConfirmar({ orgId: 'org-1' }))).toBeNull()
  })

  it('com propostas, aparece com âncora #confirmar', async () => {
    getPropostasPendentes.mockResolvedValue([{ id: 'p1' }])

    await montar(SecaoConfirmar({ orgId: 'org-1' }))

    expect(screen.getByRole('region', { name: /Confirmar previsões/ }).id).toBe('confirmar')
  })
})

describe('seção Classificar', () => {
  it('sem pendência e sem regra não aparece', async () => {
    expect(await montar(SecaoClassificar({ orgId: 'org-1' }))).toBeNull()
  })

  it('conta lançamentos, não contrapartes', async () => {
    getPendingCounterpartyGroups.mockResolvedValue([grupo(3), grupo(2)])

    await montar(SecaoClassificar({ orgId: 'org-1' }))

    within(screen.getByRole('region', { name: /Classificar lançamentos/ })).getByText('5')
  })

  it('só com regras confirmadas, aparece e abre a regra pedida', async () => {
    getConfirmedCounterparties.mockResolvedValue([{ id: 'cp-9' }])

    await montar(SecaoClassificar({ orgId: 'org-1', regraAberta: 'cp-9' }))

    const secao = screen.getByRole('region', { name: /Classificar lançamentos/ })
    expect(secao.id).toBe('classificar')
    expect(within(secao).getByTestId('fila-classificar').getAttribute('data-regra')).toBe('cp-9')
  })

  it('falha na busca vira aviso, sem lançar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getPendingCounterpartyGroups.mockRejectedValue(new Error('db indisponível'))

    await montar(SecaoClassificar({ orgId: 'org-1' }))

    within(screen.getByRole('region', { name: /Classificar lançamentos/ })).getByRole('alert')
  })
})
```

`apps/web/__tests__/finance/rolar-para-a-secao.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { SecaoDeConciliar } from '@/components/finance/secao-de-conciliar'

/**
 * O selo "confirmar?" da linha leva para `/transactions/conciliar#confirmar`.
 * A seção chega por streaming, depois do primeiro paint, quando o navegador
 * já desistiu de rolar até a âncora. A própria seção rola quando monta.
 */

const rolar = vi.fn()

beforeEach(() => {
  rolar.mockClear()
  Element.prototype.scrollIntoView = rolar
})
afterEach(() => { window.location.hash = '' })

describe('rolar até a seção da âncora', () => {
  it('rola até a seção quando o endereço aponta para ela', () => {
    window.location.hash = '#confirmar'

    render(React.createElement(SecaoDeConciliar, { id: 'confirmar', contagem: 1 }, 'fila'))

    expect(rolar).toHaveBeenCalledTimes(1)
    expect(rolar.mock.contexts[0]).toBe(document.getElementById('confirmar'))
  })

  it('não rola quando a âncora é de outra seção', () => {
    window.location.hash = '#repetidos'

    render(React.createElement(SecaoDeConciliar, { id: 'confirmar', contagem: 1 }, 'fila'))

    expect(rolar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/finance/secoes-de-conciliar.test.tsx __tests__/finance/rolar-para-a-secao.test.tsx`
Esperado: FAIL, com erro de import (`secoes-de-conciliar` e `secao-de-conciliar` não existem).

- [ ] **Passo 3: Implementar a moldura e a rolagem**

`apps/web/components/finance/rolar-para-a-secao.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

/**
 * Rola até a seção quando o endereço aponta para ela (`#confirmar`).
 *
 * As seções de Conciliar chegam por streaming, cada uma no seu `<Suspense>`.
 * Quando a do `#hash` monta, o navegador já tentou rolar e não achou o
 * elemento. Sem isto, o selo "confirmar?" da linha deixaria o usuário no
 * topo da tela, procurando a seção.
 */
export function RolarParaASecao({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [id])
  return null
}
```

`apps/web/components/finance/secao-de-conciliar.tsx`:

```tsx
import { RolarParaASecao } from './rolar-para-a-secao'

/**
 * A ordem das seções é a ordem correta de decidir, a mesma da faixa de antes:
 *
 *  1. Repetido primeiro. Classificar ou confirmar um lançamento que vai ser
 *     descartado é trabalho jogado fora.
 *  2. Classificar depois, porque define o que o lançamento é.
 *  3. Confirmar previsão por último: só faz sentido contra um lançamento que
 *     já se sabe real e já se sabe o que é.
 *
 * Os títulos dizem a AÇÃO, não o jargão: "contraparte" é vocabulário de Open
 * Finance e não significa nada para quem usa o app.
 */
export const SECOES = {
  repetidos: {
    titulo: 'Remover repetidos',
    descricao: 'Lançamentos que o banco mandou duas vezes. Nada sai das somas sem você aprovar.',
  },
  classificar: {
    titulo: 'Classificar lançamentos',
    descricao:
      'Lançamentos que vieram do banco e o floow ainda não sabe classificar sozinho. Você decide uma vez e vale para os próximos.',
  },
  confirmar: {
    titulo: 'Confirmar previsões',
    descricao:
      'Previsões suas que parecem já ter acontecido, com o lançamento do banco que as cumpriu. Nada é confirmado sem você aprovar.',
  },
} as const

export type IdDaSecao = keyof typeof SECOES

export function SecaoDeConciliar({
  id,
  contagem,
  children,
}: {
  id: IdDaSecao
  contagem: number
  // Opcional só para o `createElement(SecaoDeConciliar, props, filho)` dos
  // testes tipar; toda seção de verdade passa conteúdo.
  children?: React.ReactNode
}) {
  const tituloId = `${id}-titulo`
  return (
    <section id={id} aria-labelledby={tituloId} className="scroll-mt-20 space-y-3">
      <RolarParaASecao id={id} />
      <div>
        <h2 id={tituloId} className="flex items-center gap-2 text-base font-semibold text-gray-900">
          {SECOES[id].titulo}
          {contagem > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{contagem}</span>
          )}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{SECOES[id].descricao}</p>
      </div>
      {children}
    </section>
  )
}

/** A busca da seção falhou: as outras seguem, e esta diz o que houve. */
export function FalhaDaSecao({ id }: { id: IdDaSecao }) {
  return (
    <SecaoDeConciliar id={id} contagem={0}>
      <p role="alert" className="text-sm text-gray-600">
        Não foi possível carregar esta parte agora. Recarregue a página para tentar de novo.
      </p>
    </SecaoDeConciliar>
  )
}

export function TudoConciliado() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
      <p className="text-base font-medium text-gray-900">Tudo conciliado</p>
      <p className="mt-1 text-sm text-gray-600">
        Nada esperando decisão sua. Quando o banco mandar algo que o floow não resolve sozinho, aparece aqui.
      </p>
    </div>
  )
}
```

- [ ] **Passo 4: Implementar as seções**

`apps/web/components/finance/secoes-de-conciliar.tsx`:

```tsx
import { unstable_rethrow } from 'next/navigation'
import { getDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { getPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { getPendingCounterpartyGroups, getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'
import { getCategories, getAccounts } from '@/lib/finance/queries'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { DuplicateProposalQueue } from '@/components/finance/duplicate-proposal-queue'
import { MatchProposalQueue } from '@/components/finance/match-proposal-queue'
import { CounterpartyQueueClient } from '@/components/openfinance/counterparty-queue-client'
import { SecaoDeConciliar, FalhaDaSecao, type IdDaSecao } from './secao-de-conciliar'

/**
 * As três seções da tela Conciliar. Cada uma busca os próprios dados e entra
 * no seu `<Suspense>`: falha numa não derruba as outras (o mesmo princípio de
 * `pending-queues-slot.tsx`), e a mais lenta não segura as rápidas.
 *
 * Seção vazia devolve `null`: alarme que toca sempre deixa de ser lido.
 */

type Carregado<T> = { ok: true; dados: T } | { ok: false }

async function carregar<T>(id: IdDaSecao, buscar: () => Promise<T>): Promise<Carregado<T>> {
  try {
    return { ok: true, dados: await buscar() }
  } catch (error) {
    // Erro de controle do Next (render dinâmico, redirect) não é falha da
    // seção: engolir aqui esconderia do Next que a rota lê cookies.
    unstable_rethrow(error)
    console.error(`[conciliar] falha ao carregar a seção ${id}:`, error)
    return { ok: false }
  }
}

export async function SecaoRepetidos({ orgId }: { orgId: string }) {
  const r = await carregar('repetidos', () => getDuplicatasPendentes(orgId))
  if (!r.ok) return <FalhaDaSecao id="repetidos" />
  if (r.dados.length === 0) return null

  return (
    <SecaoDeConciliar id="repetidos" contagem={r.dados.length}>
      <DuplicateProposalQueue propostas={r.dados} />
    </SecaoDeConciliar>
  )
}

/**
 * Aparece também sem nada pendente quando há regra confirmada: a lista de
 * regras mora aqui, e é para cá que "Corrigir regra" (`?regra=`) aponta.
 */
export async function SecaoClassificar({ orgId, regraAberta }: { orgId: string; regraAberta?: string }) {
  const r = await carregar('classificar', () =>
    Promise.all([
      getPendingCounterpartyGroups(orgId),
      getConfirmedCounterparties(orgId),
      getCategories(orgId),
      getAccounts(orgId),
    ]),
  )
  if (!r.ok) return <FalhaDaSecao id="classificar" />

  const [pending, confirmed, categories, accounts] = r.dados
  if (pending.length === 0 && confirmed.length === 0) return null

  const categoryOptions = toCategoryOptions(
    categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
  )
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))
  // Lançamentos, não contrapartes: o mesmo número da faixa de Transações.
  const lancamentos = pending.reduce((soma, g) => soma + g.count, 0)

  return (
    <SecaoDeConciliar id="classificar" contagem={lancamentos}>
      <CounterpartyQueueClient
        pending={pending}
        confirmed={confirmed}
        categoryOptions={categoryOptions}
        accountOptions={accountOptions}
        regraAberta={regraAberta}
      />
    </SecaoDeConciliar>
  )
}

export async function SecaoConfirmar({ orgId }: { orgId: string }) {
  const r = await carregar('confirmar', () => getPropostasPendentes(orgId))
  if (!r.ok) return <FalhaDaSecao id="confirmar" />
  if (r.dados.length === 0) return null

  return (
    <SecaoDeConciliar id="confirmar" contagem={r.dados.length}>
      <MatchProposalQueue propostas={r.dados} />
    </SecaoDeConciliar>
  )
}
```

- [ ] **Passo 5: Rodar e ver passar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/finance/secoes-de-conciliar.test.tsx __tests__/finance/rolar-para-a-secao.test.tsx`
Esperado: PASS (11 testes). Se `getByRole('region', …)` não achar a seção, confira que o `<h2>` tem o `id` citado em `aria-labelledby`: é ele que dá nome acessível à `<section>`.

- [ ] **Passo 6: Commit**

```bash
git branch --show-current   # feat/conciliar-fluxo-unico
git add apps/web/components/finance/secao-de-conciliar.tsx apps/web/components/finance/rolar-para-a-secao.tsx apps/web/components/finance/secoes-de-conciliar.tsx apps/web/__tests__/finance/secoes-de-conciliar.test.tsx apps/web/__tests__/finance/rolar-para-a-secao.test.tsx
git commit -m "feat(conciliar): seções de repetidos, classificar e confirmar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Página `/transactions/conciliar` e redirects das rotas antigas

**Arquivos:**
- Criar: `apps/web/app/(app)/transactions/conciliar/page.tsx`
- Criar: `apps/web/app/(app)/transactions/conciliar/loading.tsx`
- Modificar (reescrever): `apps/web/app/(app)/transactions/review/page.tsx`, `matches/page.tsx`, `duplicates/page.tsx`
- Remover: `apps/web/components/openfinance/counterparty-queue.tsx`
- Teste: criar `apps/web/__tests__/finance/pagina-conciliar.test.tsx`, `apps/web/__tests__/finance/rotas-antigas-de-conciliar.test.ts`
- Teste: modificar `apps/web/__tests__/finance/filas-fora-do-menu.test.tsx`

**Interfaces:**
- Consome: `contarItensParaConciliar` (Tarefa 1); `SecaoRepetidos`, `SecaoClassificar`, `SecaoConfirmar`, `TudoConciliado` (Tarefa 3); `getOrgId`; `getVerifiedIdentity`.
- Produz: rota `/transactions/conciliar` (aceita `?regra=<counterpartyId>`), com âncoras `#repetidos`, `#classificar`, `#confirmar`.

- [ ] **Passo 1: Escrever os testes que falham**

`apps/web/__tests__/finance/pagina-conciliar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * A tela Conciliar monta as três seções na ordem de decidir (repetidos →
 * classificar → confirmar). Se cada seção some quando vazia, isso é com ela
 * (ver secoes-de-conciliar.test.tsx). Aqui fica o que é da página: a ordem, o
 * `?regra=` chegando em Classificar e o "Tudo conciliado".
 */

const contarItensParaConciliar = vi.fn()

vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('@/lib/auth/session', () => ({ getVerifiedIdentity: async () => ({ userId: 'user-1' }) }))
vi.mock('@/lib/finance/itens-para-conciliar', () => ({ contarItensParaConciliar }))
vi.mock('@/components/ajuda/link-de-ajuda', () => ({ LinkDeAjuda: () => null }))
vi.mock('@/components/finance/secoes-de-conciliar', async () => {
  const React = await import('react')
  const secao = (id: string) => (props: { regraAberta?: string }) =>
    React.createElement('section', { id, 'aria-label': id, 'data-regra': props.regraAberta ?? '' })
  return {
    SecaoRepetidos: secao('repetidos'),
    SecaoClassificar: secao('classificar'),
    SecaoConfirmar: secao('confirmar'),
  }
})

const { default: ConciliarPage } = await import('@/app/(app)/transactions/conciliar/page')

async function montar(params: { regra?: string } = {}) {
  render(await ConciliarPage({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  contarItensParaConciliar.mockReset().mockResolvedValue({ repetidos: 1, classificar: 2, confirmar: 3, total: 6 })
})

describe('tela Conciliar', () => {
  it('monta as seções na ordem repetidos → classificar → confirmar', async () => {
    await montar()

    expect(screen.getAllByRole('region').map((s) => s.id)).toEqual(['repetidos', 'classificar', 'confirmar'])
    expect(screen.queryByText('Tudo conciliado')).toBeNull()
  })

  it('?regra= chega na seção Classificar', async () => {
    await montar({ regra: 'cp-1' })

    expect(screen.getByRole('region', { name: 'classificar' }).getAttribute('data-regra')).toBe('cp-1')
  })

  it('com tudo zerado, diz "Tudo conciliado"', async () => {
    contarItensParaConciliar.mockResolvedValue({ repetidos: 0, classificar: 0, confirmar: 0, total: 0 })

    await montar()

    screen.getByText('Tudo conciliado')
  })

  it('pergunta a contagem com a org e o usuário da sessão', async () => {
    await montar()

    expect(contarItensParaConciliar).toHaveBeenCalledWith('org-1', 'user-1')
  })
})
```

`apps/web/__tests__/finance/rotas-antigas-de-conciliar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * As três filas viraram seções de /transactions/conciliar. As rotas antigas
 * ficam para links salvos, WhatsApp e e-mails já enviados, e levam direto à
 * seção certa.
 */

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})
vi.mock('next/navigation', () => ({ redirect }))

const { default: ReviewPage } = await import('@/app/(app)/transactions/review/page')
const { default: MatchesPage } = await import('@/app/(app)/transactions/matches/page')
const { default: DuplicatesPage } = await import('@/app/(app)/transactions/duplicates/page')

beforeEach(() => { redirect.mockClear() })

describe('rotas antigas das filas', () => {
  it('Classificar vai para #classificar', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar#classificar')
  })

  it('Classificar preserva ?regra= ("Corrigir regra" de links antigos)', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: 'cp-1' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar?regra=cp-1#classificar')
  })

  it('?regra= vazio não vira parâmetro vazio, e o id sai codificado', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: '' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenLastCalledWith('/transactions/conciliar#classificar')

    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: 'a b&c' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenLastCalledWith('/transactions/conciliar?regra=a%20b%26c#classificar')
  })

  it('Confirmar previsões vai para #confirmar', () => {
    expect(() => MatchesPage()).toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar#confirmar')
  })

  it('Remover repetidos vai para #repetidos', () => {
    expect(() => DuplicatesPage()).toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar#repetidos')
  })
})
```

Em `apps/web/__tests__/finance/filas-fora-do-menu.test.tsx`, logo depois do teste `'em /transactions/duplicates, "Transações" fica ativo'`, acrescente:

```tsx
  it('em /transactions/conciliar, "Transações" fica ativo (sem item próprio)', () => {
    usePathnameMock.mockReturnValue('/transactions/conciliar')

    render(React.createElement(Sidebar, { mobileOpen: false, onMobileClose: () => {} }))

    expect(screen.getByText('Transações').closest('a')?.className).toContain(ATIVO)
    expect(screen.queryByText('Conciliar')).toBeNull()
  })
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/finance/pagina-conciliar.test.tsx __tests__/finance/rotas-antigas-de-conciliar.test.ts __tests__/finance/filas-fora-do-menu.test.tsx`
Esperado: FAIL em `pagina-conciliar` (a página não existe) e em `rotas-antigas-de-conciliar` (as páginas renderizam em vez de redirecionar). `filas-fora-do-menu` já passa, pela regra do `sidebar.tsx`; o teste novo trava a regra para a rota nova.

- [ ] **Passo 3: Criar a página**

`apps/web/app/(app)/transactions/conciliar/page.tsx`:

```tsx
import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { contarItensParaConciliar } from '@/lib/finance/itens-para-conciliar'
import { SecaoRepetidos, SecaoClassificar, SecaoConfirmar } from '@/components/finance/secoes-de-conciliar'
import { TudoConciliado } from '@/components/finance/secao-de-conciliar'
import { PageHeader } from '@/components/ui/page-header'
import { LinkDeAjuda } from '@/components/ajuda/link-de-ajuda'

interface Props {
  searchParams: Promise<{ regra?: string }>
}

/**
 * Tudo que pede decisão sobre lançamento importado, numa tela só. Unifica a
 * JORNADA, não os domínios: cada seção continua com as ações e a memória que
 * tinha (ver docs/superpowers/specs/2026-09-29-conciliar-fluxo-unico-design.md).
 *
 * Nenhuma decisão aqui tranca o app. Quem traz o usuário até aqui é a faixa
 * e o botão da tela de Transações, o selo da linha e o assistente de conexão.
 */
export default async function ConciliarPage({ searchParams }: Props) {
  const [orgId, identity, { regra }] = await Promise.all([getOrgId(), getVerifiedIdentity(), searchParams])
  const { total } = await contarItensParaConciliar(orgId, identity?.userId ?? null)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Conciliar"
        description="O que o banco mandou e o floow não resolve sozinho. Nada muda sem você aprovar."
      >
        <LinkDeAjuda topico="filas" />
      </PageHeader>

      {/* As regras confirmadas moram em Classificar e continuam editáveis com
          tudo zerado; por isso as seções montam mesmo com "Tudo conciliado". */}
      {total === 0 && <TudoConciliado />}

      <Suspense fallback={null}>
        <SecaoRepetidos orgId={orgId} />
      </Suspense>
      <Suspense fallback={null}>
        <SecaoClassificar orgId={orgId} regraAberta={regra} />
      </Suspense>
      <Suspense fallback={null}>
        <SecaoConfirmar orgId={orgId} />
      </Suspense>
    </div>
  )
}
```

`apps/web/app/(app)/transactions/conciliar/loading.tsx` (o teste `__tests__/ui/esqueletos.test.tsx` exige loading próprio em toda tela):

```tsx
import { EsqueletoDeLista } from '@/components/ui/esqueletos'

export default function Loading() {
  return <EsqueletoDeLista />
}
```

- [ ] **Passo 4: Rotas antigas viram redirect**

`apps/web/app/(app)/transactions/review/page.tsx` (conteúdo inteiro):

```tsx
import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ regra?: string }>
}

/**
 * Classificar virou uma seção de /transactions/conciliar. A rota fica para
 * links salvos, WhatsApp e e-mails já enviados, e `?regra=` ("Corrigir regra")
 * continua abrindo a regra em edição.
 */
export default async function ReviewPage({ searchParams }: Props) {
  const { regra } = await searchParams
  const query = regra ? `?regra=${encodeURIComponent(regra)}` : ''
  redirect(`/transactions/conciliar${query}#classificar`)
}
```

`apps/web/app/(app)/transactions/matches/page.tsx` (conteúdo inteiro):

```tsx
import { redirect } from 'next/navigation'

/** Confirmar previsões virou uma seção de /transactions/conciliar; a rota fica para links antigos. */
export default function MatchesPage() {
  redirect('/transactions/conciliar#confirmar')
}
```

`apps/web/app/(app)/transactions/duplicates/page.tsx` (conteúdo inteiro):

```tsx
import { redirect } from 'next/navigation'

/** Remover repetidos virou uma seção de /transactions/conciliar; a rota fica para links antigos. */
export default function DuplicatesPage() {
  redirect('/transactions/conciliar#repetidos')
}
```

Os `loading.tsx` dessas três pastas ficam (o teste de esqueletos cobra loading em toda pasta com `page.tsx`).

- [ ] **Passo 5: Apagar o server component antigo da fila**

`CounterpartyQueue` só era usado por `/transactions/review` e pelo portão; a busca de dados dele agora mora em `SecaoClassificar`.

```bash
git rm apps/web/components/openfinance/counterparty-queue.tsx
grep -rn "openfinance/counterparty-queue'" apps/web --include=*.ts --include=*.tsx
```

Esperado no `grep`: nenhuma linha.

- [ ] **Passo 6: Rodar e ver passar**

Rode:
```bash
pnpm --filter @floow/web exec vitest run __tests__/finance/pagina-conciliar.test.tsx __tests__/finance/rotas-antigas-de-conciliar.test.ts __tests__/finance/filas-fora-do-menu.test.tsx __tests__/ui/esqueletos.test.tsx __tests__/layout
pnpm --filter @floow/web typecheck
```
Esperado: PASS e typecheck limpo.

- [ ] **Passo 7: Commit**

```bash
git branch --show-current   # feat/conciliar-fluxo-unico
git add "apps/web/app/(app)/transactions/conciliar/page.tsx" "apps/web/app/(app)/transactions/conciliar/loading.tsx" "apps/web/app/(app)/transactions/review/page.tsx" "apps/web/app/(app)/transactions/matches/page.tsx" "apps/web/app/(app)/transactions/duplicates/page.tsx" apps/web/__tests__/finance/pagina-conciliar.test.tsx apps/web/__tests__/finance/rotas-antigas-de-conciliar.test.ts apps/web/__tests__/finance/filas-fora-do-menu.test.tsx
git commit -m "feat(conciliar): tela única e redirect das três filas antigas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Faixa e botão "Conciliar" na tela de Transações

**Arquivos:**
- Modificar (reescrever): `apps/web/components/finance/pending-queues-notice.tsx`
- Modificar (reescrever): `apps/web/components/finance/pending-queues-slot.tsx`
- Criar: `apps/web/components/finance/botao-conciliar.tsx`
- Modificar: `apps/web/app/(app)/transactions/page.tsx:178-180,192-198`
- Teste: reescrever `apps/web/__tests__/finance/aviso-de-filas-pendentes.test.tsx`

**Interfaces:**
- Consome: `contarItensParaConciliar(orgId, userId)` (Tarefa 1).
- Produz: `PendingQueuesNotice({ total: number; repetidos: number })`; `PendingQueuesSlot({ orgId: string; userId: string | null })` (mesma assinatura de hoje); `BotaoConciliar({ total: number })`; `BotaoConciliarSlot({ orgId: string; userId: string | null })`.

- [ ] **Passo 1: Escrever o teste que falha**

`apps/web/__tests__/finance/aviso-de-filas-pendentes.test.tsx` (conteúdo inteiro):

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PendingQueuesNotice } from '@/components/finance/pending-queues-notice'
import { BotaoConciliar } from '@/components/finance/botao-conciliar'

/**
 * Sem o portão, nada obriga o usuário a conciliar: o caminho tem de estar
 * onde o assunto aparece, no topo da lista de lançamentos.
 *
 * Uma linha só, com o total das três filas, levando à tela Conciliar. O
 * âmbar fica só quando há repetido, porque é o repetido que distorce o saldo;
 * classificar só rotula.
 */
describe('faixa de itens para conciliar', () => {
  it('não renderiza nada sem item para conciliar', () => {
    const { container } = render(<PendingQueuesNotice total={0} repetidos={0} />)

    expect(container.innerHTML).toBe('')
  })

  it('uma linha só, com o total e link para Conciliar', () => {
    render(<PendingQueuesNotice total={8} repetidos={0} />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/transactions/conciliar')
    screen.getByRole('link', { name: /8 itens para conciliar/i })
  })

  it('fala no singular quando é um só', () => {
    render(<PendingQueuesNotice total={1} repetidos={0} />)

    screen.getByRole('link', { name: /1 item para conciliar/i })
  })

  it('âmbar só com repetido', () => {
    const { rerender } = render(<PendingQueuesNotice total={3} repetidos={1} />)
    expect(screen.getByRole('link').className).toContain('amber')

    rerender(<PendingQueuesNotice total={3} repetidos={0} />)
    expect(screen.getByRole('link').className).not.toContain('amber')
  })
})

describe('botão Conciliar do cabeçalho', () => {
  it('mostra o total entre parênteses quando há o que conciliar', () => {
    render(<BotaoConciliar total={4} />)

    const link = screen.getByRole('link', { name: 'Conciliar (4)' })
    expect(link.getAttribute('href')).toBe('/transactions/conciliar')
  })

  it('sem nada, só "Conciliar"', () => {
    render(<BotaoConciliar total={0} />)

    screen.getByRole('link', { name: 'Conciliar' })
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/finance/aviso-de-filas-pendentes.test.tsx`
Esperado: FAIL (`botao-conciliar` não existe; `PendingQueuesNotice` ainda recebe as três contagens).

- [ ] **Passo 3: Implementar a faixa**

`apps/web/components/finance/pending-queues-notice.tsx` (conteúdo inteiro):

```tsx
import Link from 'next/link'

/**
 * O que espera decisão, anunciado no topo da lista de lançamentos, numa linha
 * só que leva à tela Conciliar.
 *
 * Mora aqui, e não no menu lateral, porque item fixo ocupa lugar permanente
 * para uma decisão que aparece poucas vezes por mês, e some do campo de visão
 * de quem está olhando os lançamentos, que é onde o assunto surge. Sem nada
 * para conciliar não renderiza nada: alarme que toca sempre deixa de ser lido.
 *
 * Âmbar só quando há repetido: aprovar um repetido tira dinheiro do saldo,
 * classificar só rotula. As três filas em amarelo dariam a mesma urgência a
 * decisões de peso diferente.
 */
export function PendingQueuesNotice({ total, repetidos }: { total: number; repetidos: number }) {
  if (total <= 0) return null

  const destaque = repetidos > 0
  const contagem = total === 1 ? '1 item' : `${total} itens`

  return (
    <Link
      href="/transactions/conciliar"
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
        destaque
          ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
          : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
      }`}
    >
      <span>
        {destaque && <span aria-hidden="true">⚠ </span>}
        <strong>{contagem}</strong> para conciliar
      </span>
      <span aria-hidden="true" className={destaque ? 'text-amber-700' : 'text-gray-400'}>
        ›
      </span>
    </Link>
  )
}
```

`apps/web/components/finance/pending-queues-slot.tsx` (conteúdo inteiro):

```tsx
import { PendingQueuesNotice } from '@/components/finance/pending-queues-notice'
import { contarItensParaConciliar } from '@/lib/finance/itens-para-conciliar'

/**
 * Busca o total para conciliar e anuncia se houver algo.
 *
 * Separado da página para entrar num `<Suspense>`: são três transações sob RLS
 * que não mudam nada da lista, e esperar por elas atrasava a tela mais usada
 * do app. Falha numa contagem vale 0 (ver `contarItensParaConciliar`).
 */
export async function PendingQueuesSlot({ orgId, userId }: { orgId: string; userId: string | null }) {
  const { total, repetidos } = await contarItensParaConciliar(orgId, userId)
  return <PendingQueuesNotice total={total} repetidos={repetidos} />
}
```

- [ ] **Passo 4: Implementar o botão**

`apps/web/components/finance/botao-conciliar.tsx`:

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { contarItensParaConciliar } from '@/lib/finance/itens-para-conciliar'

/** "Conciliar (4)": o total no próprio botão, para ninguém abrir a tela à toa. */
export function BotaoConciliar({ total }: { total: number }) {
  return (
    <Button asChild variant="outline">
      <Link href="/transactions/conciliar">{total > 0 ? `Conciliar (${total})` : 'Conciliar'}</Link>
    </Button>
  )
}

/**
 * O botão com a contagem, para entrar num `<Suspense>` cujo fallback é o botão
 * sem número: o cabeçalho não espera as três contagens para aparecer. A faixa
 * pergunta o mesmo total no mesmo request, e o `cache` de
 * `contarItensParaConciliar` evita consultar duas vezes.
 */
export async function BotaoConciliarSlot({ orgId, userId }: { orgId: string; userId: string | null }) {
  const { total } = await contarItensParaConciliar(orgId, userId)
  return <BotaoConciliar total={total} />
}
```

- [ ] **Passo 5: Ligar na tela de Transações**

Em `apps/web/app/(app)/transactions/page.tsx`:

- Acrescente o import, logo abaixo do de `PendingQueuesSlot` (linha 20):
```tsx
import { BotaoConciliar, BotaoConciliarSlot } from '@/components/finance/botao-conciliar'
```
- Troque as linhas 178-180 (botão "Classificar lançamentos") por:
```tsx
        <Suspense fallback={<BotaoConciliar total={0} />}>
          <BotaoConciliarSlot orgId={orgId} userId={userId} />
        </Suspense>
```
- Troque o comentário das linhas 192-195 por:
```tsx
      {/* Uma linha com o total para conciliar, e nao item no menu: item fixo
          ocupa lugar permanente para uma decisao que aparece poucas vezes por
          mes, e some do campo de visao de quem esta olhando os lancamentos.
          Sem nada para conciliar, nao renderiza nada. */}
```

- [ ] **Passo 6: Rodar e ver passar**

Rode:
```bash
pnpm --filter @floow/web exec vitest run __tests__/finance/aviso-de-filas-pendentes.test.tsx
pnpm --filter @floow/web typecheck
```
Esperado: PASS (6 testes) e typecheck limpo.

- [ ] **Passo 7: Commit**

```bash
git branch --show-current   # feat/conciliar-fluxo-unico
git add apps/web/components/finance/pending-queues-notice.tsx apps/web/components/finance/pending-queues-slot.tsx apps/web/components/finance/botao-conciliar.tsx "apps/web/app/(app)/transactions/page.tsx" apps/web/__tests__/finance/aviso-de-filas-pendentes.test.tsx
git commit -m "feat(conciliar): faixa e botão de Transações levam à tela única

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Links da linha, paleta de comandos e ajuda

**Arquivos:**
- Modificar: `apps/web/components/finance/transaction-display-row.tsx:139-147`
- Modificar: `apps/web/components/finance/menu-de-acoes-da-linha.tsx:47`
- Modificar: `apps/web/components/layout/command-palette.tsx:27`
- Modificar: `apps/web/lib/ajuda/conteudo.ts:26-31`
- Teste: modificar `apps/web/__tests__/finance/selo-conciliar.test.tsx:64-69`, `apps/web/__tests__/finance/transaction-display-row-regra.test.tsx:68-70,80-82`, `apps/web/__tests__/layout/paleta-de-comandos.test.ts`

**Interfaces:**
- Consome: rota `/transactions/conciliar` com âncoras (Tarefa 4).
- Produz: nada que outra tarefa use.

- [ ] **Passo 1: Ajustar os testes para o destino novo**

Em `apps/web/__tests__/finance/selo-conciliar.test.tsx`, no teste `'o selo de confirmar leva a fila'`:

```tsx
  it('o selo de confirmar leva à seção Confirmar da tela Conciliar', () => {
    renderRow({ hasPendingMatchProposal: true })

    expect(screen.getByRole('link', { name: 'confirmar?' }).getAttribute('href'))
      .toBe('/transactions/conciliar#confirmar')
  })
```

Em `apps/web/__tests__/finance/transaction-display-row-regra.test.tsx`, nas duas ocorrências (desktop e mobile), troque `'/transactions/review?regra=cp-1'` por `'/transactions/conciliar?regra=cp-1#classificar'`.

Em `apps/web/__tests__/layout/paleta-de-comandos.test.ts`, acrescente no `describe`:

```ts
  it('"Conciliar" substitui "Classificar lançamentos" e é achada pelo nome antigo', () => {
    expect(COMMANDS.map((c) => c.label)).not.toContain('Classificar lançamentos')
    expect(filtrarComandos('classificar').map((c) => c.href)).toContain('/transactions/conciliar')
    expect(filtrarComandos('repetidos').map((c) => c.href)).toContain('/transactions/conciliar')
  })
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/finance/selo-conciliar.test.tsx __tests__/finance/transaction-display-row-regra.test.tsx __tests__/layout/paleta-de-comandos.test.ts`
Esperado: FAIL nos três (hrefs antigos; a paleta ainda tem "Classificar lançamentos").

- [ ] **Passo 3: Implementar**

`apps/web/components/finance/transaction-display-row.tsx`, no bloco `if (tx.hasPendingMatchProposal)` (linhas 139-147):

```tsx
  if (tx.hasPendingMatchProposal) {
    return (
      <Link
        href="/transactions/conciliar#confirmar"
        className="inline-flex shrink-0 items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
        title="O floow encontrou um lançamento do banco que pode ser este. Decida em Conciliar."
      >
        confirmar?
      </Link>
    )
  }
```

`apps/web/components/finance/menu-de-acoes-da-linha.tsx:47`:

```tsx
    itens.push({ rotulo: 'Corrigir regra', icone: SlidersHorizontal, href: `/transactions/conciliar?regra=${tx.counterpartyId}#classificar` })
```

`apps/web/components/layout/command-palette.tsx:27`:

```tsx
  { label: 'Conciliar', href: '/transactions/conciliar', icon: ArrowLeftRight, keywords: ['classificar', 'revisar', 'contraparte', 'fila', 'pendente', 'repetidos', 'duplicata', 'previsao', 'confirmar'] },
```

`apps/web/lib/ajuda/conteudo.ts`, entrada `id: 'filas'` (linhas 26-31):

```ts
  {
    id: 'filas',
    pergunta: 'O que é "Conciliar"?',
    resposta:
      'É a tela, dentro de Transações, com tudo o que veio do banco e pede uma decisão sua: remover lançamentos que o banco mandou duas vezes, classificar os que o floow ainda não sabe classificar (você decide uma vez e vale para os próximos) e confirmar previsões que parecem já ter acontecido. Nada trava o app, e nada muda sem você aprovar.',
  },
```

- [ ] **Passo 4: Rodar e ver passar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/finance/selo-conciliar.test.tsx __tests__/finance/transaction-display-row-regra.test.tsx __tests__/finance/menu-de-acoes-da-linha.test.tsx __tests__/layout/paleta-de-comandos.test.ts __tests__/ui/central-de-ajuda.test.tsx`
Esperado: PASS.

- [ ] **Passo 5: Commit**

```bash
git branch --show-current   # feat/conciliar-fluxo-unico
git add apps/web/components/finance/transaction-display-row.tsx apps/web/components/finance/menu-de-acoes-da-linha.tsx apps/web/components/layout/command-palette.tsx apps/web/lib/ajuda/conteudo.ts apps/web/__tests__/finance/selo-conciliar.test.tsx apps/web/__tests__/finance/transaction-display-row-regra.test.tsx apps/web/__tests__/layout/paleta-de-comandos.test.ts
git commit -m "feat(conciliar): selo, Corrigir regra, paleta e ajuda apontam para Conciliar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Assistente de conexão leva a Conciliar depois do primeiro import

**Arquivos:**
- Modificar: `apps/web/app/(app)/accounts/connect/wizard-passos.ts` (nova função no fim)
- Modificar: `apps/web/app/(app)/accounts/connect/connect-wizard.tsx:1-27,92-104`
- Teste: modificar `apps/web/__tests__/openfinance/wizard-passos.test.ts`
- Teste: criar `apps/web/__tests__/openfinance/wizard-leva-para-conciliar.test.tsx`
- Teste: modificar `apps/web/__tests__/openfinance/connect-wizard-jornada.test.tsx:5-9`

**Interfaces:**
- Consome: `totalParaConciliar(): Promise<number>` (Tarefa 1); `ResultadoDaConexaoGuiada` (`etapa`, `ambiguos`, `faltando`).
- Produz: `destinoDepoisDaConclusao(r: Conclusao, totalParaConciliar: number): string | null` em `wizard-passos.ts`.

**Nota sobre a spec:** a spec cita os dois `router.refresh()` do assistente (`:102` e `:173`). Só o de `:102` (dentro de `verificar`, depois de `concluirConexaoGuiada`) vem depois de importar. O de `:173` roda logo depois de abrir a aba do banco, quando ainda não há nada importado, e fica como está.

- [ ] **Passo 1: Escrever os testes que falham**

Em `apps/web/__tests__/openfinance/wizard-passos.test.ts`, acrescente `destinoDepoisDaConclusao` ao import de `@/app/(app)/accounts/connect/wizard-passos` e, no fim do arquivo:

```ts
describe('destinoDepoisDaConclusao', () => {
  const concluida = {
    etapa: 'concluida' as const, vinculados: 1, ambiguos: [], faltando: [], importadas: 12, erro: null,
    atualizacao: { status: 'AUTHORISED' },
  }

  it('primeiro import com itens para conciliar vai para Conciliar', () => {
    expect(destinoDepoisDaConclusao(concluida, 3)).toBe('/transactions/conciliar')
  })

  it('sem nada para conciliar, fica', () => {
    expect(destinoDepoisDaConclusao(concluida, 0)).toBeNull()
  })

  it('ainda esperando o banco, fica', () => {
    expect(destinoDepoisDaConclusao({ ...concluida, etapa: 'aguardando-contas' }, 3)).toBeNull()
  })

  it('conta ambígua ou faltando pede decisão nesta tela: fica', () => {
    expect(destinoDepoisDaConclusao({ ...concluida, ambiguos: ['ACCOUNT'] }, 3)).toBeNull()
    expect(destinoDepoisDaConclusao({ ...concluida, faltando: ['CREDIT_CARD_ACCOUNT'] }, 3)).toBeNull()
  })
})
```

(Se `ambiguos`/`faltando` pedirem o tipo `TipoDeRecurso`, faça `as never` nos literais, como `selo-conciliar.test.tsx` faz com `tx`.)

`apps/web/__tests__/openfinance/wizard-leva-para-conciliar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * Sem o portão, o primeiro import precisa de destino explícito: o portão é
 * que levava o usuário à fila. Concluída a conexão com algo para conciliar,
 * o assistente vai para Conciliar; com zero, fica e só atualiza.
 */

const push = vi.fn()
const refresh = vi.fn()
const concluirConexaoGuiada = vi.fn()
const totalParaConciliar = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/lib/openfinance/conexao-guiada-actions', () => ({
  iniciarConexaoGuiada: vi.fn(async () => ({ connectionId: 'con-1', authUrl: 'https://banco' })),
  concluirConexaoGuiada,
}))
vi.mock('@/lib/openfinance/abrir-autorizacao', () => ({
  abrirAutorizacao: async (obterUrl: () => Promise<string>) => {
    await obterUrl()
    return 'nova-aba'
  },
}))
vi.mock('@/lib/finance/itens-para-conciliar-actions', () => ({ totalParaConciliar }))

const { ConnectWizard } = await import('@/app/(app)/accounts/connect/connect-wizard')
const { ToastProvider } = await import('@/components/ui/toast')

const CONCLUIDA = {
  etapa: 'concluida', atualizacao: { status: 'AUTHORISED' }, vinculados: 1,
  ambiguos: [], faltando: [], importadas: 12, erro: null,
}

async function ateVerificar() {
  render(
    <ToastProvider>
      <ConnectWizard
        institutions={[{ id: 'itau', name: 'Itaú', logoUrl: null, type: 'PERSONAL' }]}
        loadError={null}
        contas={[{ id: 'cc', name: 'Corrente Itaú', type: 'checking' }]}
      />
    </ToastProvider>,
  )
  fireEvent.change(screen.getByLabelText('Os lançamentos vão para'), { target: { value: 'cc' } })
  fireEvent.click(screen.getByText('Continuar'))
  fireEvent.click(screen.getByLabelText('Itaú'))
  fireEvent.change(screen.getByLabelText('CPF do titular'), { target: { value: '529.982.247-25' } })
  fireEvent.click(screen.getByText('Continuar'))
  fireEvent.click(screen.getByText('Autorizar no banco'))
  fireEvent.click(await screen.findByText('Verificar de novo'))
}

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
  concluirConexaoGuiada.mockReset().mockResolvedValue(CONCLUIDA)
  totalParaConciliar.mockReset()
})

describe('assistente depois do primeiro import', () => {
  it('com itens para conciliar, vai para Conciliar', async () => {
    totalParaConciliar.mockResolvedValue(7)

    await ateVerificar()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/transactions/conciliar'))
  })

  it('com zero, fica na tela e só atualiza', async () => {
    totalParaConciliar.mockResolvedValue(0)

    await ateVerificar()

    await waitFor(() => expect(totalParaConciliar).toHaveBeenCalled())
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
  })
})
```

Em `apps/web/__tests__/openfinance/connect-wizard-jornada.test.tsx`, logo abaixo do `vi.mock('@/lib/openfinance/conexao-guiada-actions', …)`, acrescente (o assistente passa a importar a action nova, e este teste não deve tocar no banco):

```tsx
vi.mock('@/lib/finance/itens-para-conciliar-actions', () => ({ totalParaConciliar: vi.fn(async () => 0) }))
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/openfinance/wizard-passos.test.ts __tests__/openfinance/wizard-leva-para-conciliar.test.tsx`
Esperado: FAIL (`destinoDepoisDaConclusao` não existe; o assistente nunca chama `push`).

- [ ] **Passo 3: Implementar a regra do destino**

No fim de `apps/web/app/(app)/accounts/connect/wizard-passos.ts`:

```ts
/**
 * Para onde o assistente leva depois de concluir a conexão, ou `null` para
 * ficar.
 *
 * Sem o portão, o primeiro import precisa de destino explícito: era o portão
 * que punha o usuário diante da fila. Com algo para conciliar, vai para lá.
 * Mas conta ambígua ou faltando pede decisão NESTA tela ("escolha qual vai
 * para onde"); sair dela esconderia o aviso. Os itens para conciliar esperam,
 * e a faixa de Transações os anuncia.
 */
export function destinoDepoisDaConclusao(r: Conclusao, totalParaConciliar: number): string | null {
  if (r.etapa !== 'concluida' || totalParaConciliar <= 0) return null
  if (r.ambiguos.length > 0 || r.faltando.length > 0) return null
  return '/transactions/conciliar'
}
```

- [ ] **Passo 4: Ligar no assistente**

Em `apps/web/app/(app)/accounts/connect/connect-wizard.tsx`:

- Acrescente os imports (junto dos de `./wizard-passos` e das actions):
```tsx
import { totalParaConciliar } from '@/lib/finance/itens-para-conciliar-actions'
```
e `destinoDepoisDaConclusao` na lista importada de `./wizard-passos`.

- Troque a função `verificar` (linhas 92-104) por:
```tsx
  function verificar() {
    if (!aguardando || emAndamento.current) return
    emAndamento.current = true
    // Relê o status e, se as contas chegaram, vincula e importa sozinho.
    // Falha aqui não merece alarme: a próxima volta para a aba tenta de novo.
    concluirConexaoGuiada(aguardando)
      .then(async (r) => {
        setResultado(r)
        // Só pergunta o total depois de importar: antes disso não há o que
        // conciliar vindo desta conexão.
        return r.etapa === 'concluida' ? destinoDepoisDaConclusao(r, await totalParaConciliar()) : null
      })
      .catch(() => null)
      .then((destino) => {
        emAndamento.current = false
        if (destino) router.push(destino)
        else router.refresh()
      })
  }
```

- [ ] **Passo 5: Rodar e ver passar**

Rode: `pnpm --filter @floow/web exec vitest run __tests__/openfinance/wizard-passos.test.ts __tests__/openfinance/wizard-leva-para-conciliar.test.tsx __tests__/openfinance/connect-wizard-jornada.test.tsx __tests__/openfinance/connect-wizard-produtos.test.tsx`
Esperado: PASS. Se `connect-wizard-produtos.test.tsx` falhar ao importar a action nova, acrescente nele o mesmo `vi.mock('@/lib/finance/itens-para-conciliar-actions', …)` do Passo 1.

- [ ] **Passo 6: Commit**

```bash
git branch --show-current   # feat/conciliar-fluxo-unico
wc -l "apps/web/app/(app)/accounts/connect/connect-wizard.tsx" "apps/web/app/(app)/accounts/connect/wizard-passos.ts"
git add "apps/web/app/(app)/accounts/connect/wizard-passos.ts" "apps/web/app/(app)/accounts/connect/connect-wizard.tsx" apps/web/__tests__/openfinance/wizard-passos.test.ts apps/web/__tests__/openfinance/wizard-leva-para-conciliar.test.tsx apps/web/__tests__/openfinance/connect-wizard-jornada.test.tsx
git commit -m "feat(conciliar): assistente de conexão leva a Conciliar depois do import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Se tiver mexido em `connect-wizard-produtos.test.tsx`, inclua o caminho no `git add`.)

---

### Tarefa 8: Limpeza do badge morto e verificação final

**Arquivos:**
- Remover: `apps/web/lib/finance/forecast-match-badge.ts`, `apps/web/__tests__/finance/forecast-match-badge.test.ts`
- Modificar: `apps/web/lib/finance/forecast-match-queries.ts:124-131` (docblock de `contarPropostasPendentes`)

**Interfaces:**
- Consome: tudo das tarefas anteriores.
- Produz: branch pronta para o controlador fazer merge e push.

- [ ] **Passo 1: Apagar o badge e confirmar que ninguém usa**

```bash
git rm apps/web/lib/finance/forecast-match-badge.ts apps/web/__tests__/finance/forecast-match-badge.test.ts
grep -rn "forecast-match-badge\|contagemDeConciliacoesPendentes" apps/web --include=*.ts --include=*.tsx
```

Esperado no `grep`: só o docblock de `forecast-match-queries.ts` (corrigido no próximo passo).

- [ ] **Passo 2: Corrigir o docblock de `contarPropostasPendentes`**

Em `apps/web/lib/finance/forecast-match-queries.ts`, troque o docblock acima de `contarPropostasPendentes` (linhas 124-131) por:

```ts
/**
 * Quantas propostas esperam decisão; entra no total de
 * `contarItensParaConciliar`.
 *
 * Recebe o `userId` em vez de resolvê-lo da requisição, com `withUserDbFor`:
 * a contagem roda em paralelo com as das outras filas e não depende de
 * cookies (ver o docblock de `withUserDbFor` em `lib/db/rls.ts`).
 */
```

- [ ] **Passo 3: Varrer as sobras**

```bash
grep -rn "transactions/review\|transactions/matches\|transactions/duplicates\|ReviewGate\|reviewGate\|getReviewGateStatus" apps/web --include=*.ts --include=*.tsx | grep -v "__tests__/finance/filas-fora-do-menu\|__tests__/finance/rotas-antigas-de-conciliar\|__tests__/layout/sem-portao"
```

Esperado: nenhuma linha. (`packages/db` continua com a coluna `reviewGateClearedAt`: está fora da busca, e sem migration de propósito.)

- [ ] **Passo 4: Tamanho dos arquivos**

```bash
wc -l apps/web/components/openfinance/counterparty-queue-client.tsx apps/web/lib/openfinance/counterparty-queries.ts apps/web/components/finance/transaction-display-row.tsx "apps/web/app/(app)/transactions/page.tsx" "apps/web/app/(app)/accounts/connect/connect-wizard.tsx" apps/web/components/finance/secoes-de-conciliar.tsx apps/web/components/finance/secao-de-conciliar.tsx
```

Esperado: todos abaixo de 500.

- [ ] **Passo 5: Suíte inteira, typecheck e build**

```bash
pnpm --filter @floow/web test
pnpm --filter @floow/web typecheck
pnpm --filter @floow/web build
```

Esperado: os três sem erro. O build importa porque é produção: `redirect()` em página sem JSX e página async com `searchParams` só dão erro no build, não no vitest. Se algum teste falhar fora dos arquivos deste plano, confira se ele citava rota antiga ou o portão antes de mexer em código.

- [ ] **Passo 6: Commit**

```bash
git branch --show-current   # feat/conciliar-fluxo-unico
git add apps/web/lib/finance/forecast-match-queries.ts
git commit -m "chore(conciliar): remove o badge de conciliações sem uso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git status --short   # deve sobrar só o que já estava fora do plano (ex.: apps/web/.gitignore)
```

Merge em `master` e push ficam com o controlador.
