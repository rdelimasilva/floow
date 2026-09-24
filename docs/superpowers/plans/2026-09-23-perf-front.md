# Performance do front — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cortar as idas à rede que ficam no caminho crítico de toda navegação e o JS/re-render desnecessário no cliente, sem mudar comportamento visível.

**Architecture:** O ganho maior está no servidor: o layout `(app)` hoje faz `getUser()` (rede, Auth do Supabase) e depois a trava de revisão (transação RLS sem cache) antes até do skeleton. Troca-se por claims locais do JWT (ES256, verificado por `getClaims()`) e cache por tag. Depois, removem-se waterfalls por página e round trips do `withRls`. No cliente, reduz-se o bundle (barrel do core-finance, recharts estático, Sentry 100%) e re-renders (toast, `router.refresh()` redundante).

**Tech Stack:** Next.js 16.2 (App Router, `unstable_cache`, `revalidateTag`), React 19, Drizzle + postgres-js via pgbouncer (transaction mode), Supabase Auth (`@supabase/ssr`), Vitest.

**Spec:** estudo feito nesta sessão (resumo na conversa de 2026-09-23); os achados estão reproduzidos na seção de cada task.

## Global Constraints

- Nenhum arquivo pode passar de 500 linhas (CLAUDE.md).
- Identidade só via `lib/auth/session.ts` (`getVerifiedIdentity`/`getOrgId`); nunca decodificar JWT na mão, nunca `getSession()`.
- Toda leitura disparada por usuário continua sob `withUserDb`/`withUserDbFor` quando já estava; não trocar RLS por `getDb()`.
- Callback de `unstable_cache` não pode ler cookies — identidade entra por parâmetro (`withUserDbFor`).
- Textos em pt-BR.
- Não mexer em `balanceAfter` de `getTransactionsWithCount` (já medido: 129ms vs 127ms da alternativa).

## Review Focus

1. Org com portão ainda fechado e pendências: o layout precisa continuar bloqueando — cache só pode esconder o estado "destravada", que é permanente.
2. Usuário sem `full_name`/`avatar_url` no token (login por e-mail): o shell mostra o e-mail, sem quebrar.
3. Edição inline de transação: depois de salvar, a linha e o saldo aparecem atualizados sem `router.refresh()`.
4. `invalidateTag` chamado de Route Handler/cron (não Server Action): não pode lançar.
5. Tela de Transações sem `page` na URL continua abrindo na última página (ou na de hoje com futuros).

---

### Task 1: `withRls` com um único `set_config`

**Files:**
- Modify: `packages/db/src/rls.ts:66-70`
- Test: `apps/web/__tests__/auth/with-user-db.test.ts` (ver se já cobre; senão `packages/db/src/__tests__/rls.test.ts`)

- [ ] Teste: `withRls` executa exatamente 1 `tx.execute` antes de `fn`, e o SQL contém os dois `set_config(..., true)`.
- [ ] Rodar e ver falhar (hoje são 2 execute).
- [ ] Implementar:

```ts
return db.transaction(async (tx) => {
  await tx.execute(
    sql`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`,
  )
  return fn(tx)
})
```

- [ ] Testes passam; commit `perf(db): contexto de RLS num unico round trip`.

### Task 2: layout sem ida ao Auth; identidade do shell pelas claims

**Files:**
- Modify: `apps/web/lib/auth/session.ts` (nova `getShellProfile`)
- Modify: `apps/web/app/(app)/layout.tsx`
- Modify: `apps/web/app/(app)/transactions/page.tsx:120-121` (usar `getVerifiedIdentity` em vez de `getAuthenticatedUser`)
- Test: `apps/web/__tests__/auth/session.test.ts`

**Interfaces:**
- Produces: `getShellProfile(): Promise<{ userId: string; email: string; name: string | null; avatarUrl: string | null } | null>` — `cache()`d, lê `getClaims()` (mesma chamada deduplicada), nunca `getUser()`.

- [ ] Testes: (a) devolve email/nome/avatar a partir de `claims.email` e `claims.user_metadata.{full_name|name, avatar_url|picture}`; (b) nunca chama `getUser`; (c) sem claims → `null`; (d) sem metadata → `name`/`avatarUrl` null.
- [ ] Implementar reaproveitando a chamada de `getClaims()`: extrair `readClaims = cache(async () => (await createClient()).auth.getClaims())` usado por `getVerifiedIdentity` e `getShellProfile`.
- [ ] Layout: `const [profile, gate] = await Promise.all([getShellProfile(), getReviewGateStatusSafe()])`; `if (!profile) redirect('/auth')`; props do `AppShell` vêm de `profile`.
- [ ] `/transactions`: `const userId = (await getVerifiedIdentity())?.userId ?? null`.
- [ ] `/settings` e `/billing` continuam com `getAuthenticatedUser()` (precisam do estado atual).
- [ ] Testes + typecheck; commit `perf(layout): shell usa claims do token, sem ida ao Auth`.

Nota: nome editado em Configurações só aparece no shell após o refresh do token (≤1h, ou no próximo refresh do middleware). Aceitável; `updateUser` já força novo token na sessão do navegador, e o `router.refresh()` do settings-form fica.

### Task 3: trava de revisão com cache por tag

**Files:**
- Modify: `apps/web/lib/cache-tags.ts` (+ `reviewGateTag(orgId)`)
- Modify: `apps/web/lib/openfinance/counterparty-queries.ts:20-68`
- Modify: `apps/web/lib/openfinance/counterparty-actions.ts:~318` (invalidar tag quando grava `reviewGateClearedAt`)
- Test: `apps/web/__tests__/openfinance/counterparty-queries.test.ts`

**Interfaces:**
- Produces: `reviewGateTag(orgId: string): string` = `review-gate:${orgId}`.
- `getReviewGateStatus(orgId, userId)` — passa a receber `userId` (para `withUserDbFor` dentro do cache).

- [ ] Implementar: `isReviewGateCleared = (orgId, userId) => unstable_cache(() => withUserDbFor(userId, tx => select reviewGateClearedAt ... ), ['review-gate', orgId], { tags: [reviewGateTag(orgId)] })()` retornando boolean. `getReviewGateStatus`: se cleared → `{blocked:false}` sem mais nada; senão roda a consulta de pendência (sem cache — é o caso raro e precisa estar fresco).
- [ ] `getReviewGateStatusSafe`: `const { userId } = await requireIdentity()` junto com `getOrgId()`.
- [ ] `confirmCounterparty`: após a transação, `invalidateTag(reviewGateTag(orgId))`.
- [ ] Ajustar mocks do teste (mock de `next/cache` com `unstable_cache: (fn) => fn`, `withUserDbFor`) e manter os 4 cenários + o de fail-open.
- [ ] Commit `perf(openfinance): trava de revisao destravada sai do caminho de toda tela`.

### Task 4: invalidação imediata e fim do `router.refresh()` redundante

**Files:**
- Modify: `apps/web/lib/cache-tags.ts:4-6`
- Modify: `apps/web/components/finance/transaction-edit-row.tsx:107`
- Modify: `apps/web/app/(app)/fixed-assets/[id]/update-value-form.tsx:33`
- Modify: `apps/web/components/finance/reparar-hierarquia.tsx:21`

Por quê: `revalidateTag(tag, 'default')` é stale-while-revalidate e, com perfil SWR, o Next **não** marca o path como revalidado na resposta da Server Action (`revalidate.js:204-210`). O cliente compensava com `router.refresh()` = segundo render RSC completo. `{ expire: 0 }` expira na hora, funciona também em Route Handler, e faz a própria resposta da action trazer o RSC novo.

- [ ] `invalidateTag`: `revalidateTag(tag, { expire: 0 })`.
- [ ] Remover os três `router.refresh()` (e `useRouter` se ficar sem uso). Manter os de `settings-form` (Supabase client, não action), `reset-password` e `link-resources` (fluxo raro de Open Finance).
- [ ] Typecheck + testes; verificação manual no app: editar transação inline e ver valor/saldo atualizados.
- [ ] Commit `perf(cache): invalidacao imediata; sem router.refresh apos action`.

### Task 5: `/transactions` sem waterfall

**Files:**
- Modify: `apps/web/app/(app)/transactions/page.tsx:87-131`
- Create: `apps/web/components/finance/pending-queues-slot.tsx` (server component async)

- [ ] Disparar `getAccounts`, `getCategories`, `getCategoryUsageOrder` antes do `await` da contagem (promises iniciadas, aguardadas no `Promise.all` final).
- [ ] `PendingQueuesSlot({ orgId, userId })` busca as 3 contagens (com `.catch(() => 0)`) e renderiza `PendingQueuesNotice`; a página o envolve em `<Suspense fallback={null}>`. Sai do caminho crítico da lista.
- [ ] Typecheck; commit `perf(transacoes): contagens das filas em streaming, sem waterfall`.

### Task 6: waterfalls nas outras telas

**Files:**
- Modify: `apps/web/app/(app)/accounts/page.tsx:10-15` → `Promise.all([getAccounts, getSaldosDoBanco])`
- Modify: `apps/web/app/(app)/accounts/[accountId]/page.tsx:28-59` → `getAccountById`, `getCategories`, `getAccounts` e a contagem começam juntos; `notFound()` após o primeiro await.
- Modify: `apps/web/lib/finance/debt-queries.ts:46-70` → uma só `withUserDb` com as duas consultas; progresso filtrado por `inArray(transactions.categoryId, categoriasDasDividas)`.
- Modify: `apps/web/app/(app)/planning/succession/page.tsx:24-36` → remover `getAccounts` morto.
- Modify: `apps/web/app/(app)/settings/page.tsx` → paralelizar se as duas leituras forem independentes.

- [ ] Testes existentes de dívidas continuam passando (`__tests__/finance`); typecheck.
- [ ] Commit `perf(telas): leituras independentes em paralelo`.

### Task 7: bundle do cliente

**Files:**
- Modify: `packages/core-finance/package.json`, `packages/shared/package.json` (`"sideEffects": false`)
- Modify: arquivos `'use client'` que importam só `formatBRL`/`currencyToCents` de `@floow/core-finance` → `@floow/core-finance/src/balance`
- Modify: `apps/web/app/(app)/budgets/pacing/client.tsx:9` → `next/dynamic` com `ssr: false`
- Modify: `apps/web/instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` → `tracesSampleRate: 0.1`
- Modify: `apps/web/app/layout.tsx` → remover `<head>` manual duplicado (metadata já declara título e ícone)
- Modify: `apps/web/package.json` → remover `@tanstack/react-query` (zero imports)

- [ ] Medir antes/depois: soma de `.next/static/chunks` e o JS de `/transactions` (build de referência em `perf-baseline-build.log`).
- [ ] Build; commit `perf(bundle): cliente importa so o que usa`.

### Task 8: re-renders

**Files:**
- Modify: `apps/web/components/ui/toast.tsx:44` → `useMemo(() => ({ toast }), [toast])`
- Modify: `apps/web/components/finance/import-review.tsx:~207` → opções de categoria por tipo calculadas uma vez (`useMemo`)

- [ ] Testes de UI existentes passam; commit `perf(ui): toast e revisao de import sem re-render em cascata`.

### Fora deste plano (registrado)

- `/cash-flow` agregando em SQL em vez de mandar 48 meses crus ao cliente — refatoração do `CashFlowClient`, plano próprio.
- Troca tabela→cards no mobile da lista de transações: renderizar as duas por CSS duplicaria linhas com estado de edição; precisa desenho próprio.
- `balanceAfter` (ver Global Constraints).

### Verificação final

- [ ] `pnpm --filter @floow/web test`, `typecheck`, `build` verdes.
- [ ] Rodar o app e navegar dashboard → transações → contas → dívidas; editar uma transação inline.
- [ ] Merge em master + push (fluxo do projeto), após build.
