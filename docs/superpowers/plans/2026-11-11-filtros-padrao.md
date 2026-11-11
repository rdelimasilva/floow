# Filtros padronizados e recorte compartilhado: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um recorte (período + contas) que acompanha o usuário entre as telas de finanças, um conjunto único de controles de filtro, e todo total de categoria/mês abrindo em Transações uma lista que soma exatamente aquele total.

**Architecture:** A URL continua sendo a fonte da verdade de cada tela. Um cookie `recorte` guarda o último período/contas escolhido e um helper de servidor redireciona a tela que chega sem recorte. Os controles moram em `components/finance/filtros/` e escrevem na URL por um hook só. Transações ganha dois filtros visíveis (`caixa=1` e `fatura=`), para reproduzir os critérios das telas de origem.

**Tech Stack:** Next.js App Router (server components + `redirect`), React client components, drizzle-orm, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-10-filtros-padrao-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (`CLAUDE.md`). Se passar, divida antes.
- Mês e "hoje" sempre no calendário de São Paulo: `hojeEmSaoPaulo()` (`lib/finance/filtros-lembrados.ts`). Nunca `new Date()` do servidor para decidir mês.
- Banco só por `withUserDb` (o teste `__tests__/auth/rls-ledger.test.ts` barra `getDb()` novo).
- Trocar filtro usa `router.replace(url, { scroll: false })`, nunca `push`.
- Sem "Limpar tudo". Cada filtro se desliga no próprio controle.
- Nenhum filtro ativo sem aparecer na tela, em qualquer largura.
- Sem dependência nova. Gaveta do celular com `@radix-ui/react-dialog`, que já está instalado (ver `components/ui/confirm-dialog.tsx`).
- Texto visível e comentários passam pela skill `humanizer`. Rótulos neutros: "Todo o período", "Todas as contas", "Todos os cartões", "Todas as categorias", "Todos os tipos", "Todos os finais do cartão".
- Cada fase termina com `npx tsc --noEmit`, `npx vitest run` (sem falha nova; hoje 8 já falham no master: conciliar, regras, auth-boundary, rls-ledger por `simulador-actions.ts`, esqueletos) e `npx next build`. Cada fase vai para produção sozinha: merge em master + push.
- Testes mockam o banco. Toda consulta nova ou alterada (fases 3 e 5) é conferida no banco real com transação e rollback antes do merge (memória: "Testes mockam o banco").

## Review Focus

1. **Cookie antigo.** Quem tem só `tx-filters`/`tx-accounts` abre Transações no recorte que tinha. Teste em `recorte.test.ts` (Tarefa 1).
2. **Conta do recorte que não existe na tela** (cartão aberto em Gastos, conta de investimento em Transações, conta excluída). A tela abre em "Todas as contas" sem apagar o recorte. Teste em `contasValidas` (Tarefa 1) e em Cartões (Tarefa 7).
3. **Período aberto nas telas de mês** ("Todo o período" ou só data inicial). A tela abre no mês atual de SP, não em 1970 nem em `NaN`. Teste em `mesParaTelaDeMes` (Tarefa 1).
4. **Redirect em laço.** Cookie com recorte vazio ou inválido não pode redirecionar para a mesma URL. Teste em `destinoComRecorte` (Tarefa 1).
5. **Total e lista divergentes por um centavo.** Estorno, lançamento ignorado ou previsão conciliada na categoria. Teste de soma nas Tarefas 11 e 12.

---

## Fase 1: base do recorte (nada muda na tela)

### Tarefa 1: módulo do recorte

**Files:**
- Create: `lib/finance/recorte.ts`
- Test: `__tests__/finance/recorte.test.ts`

**Interfaces:**
- Consumes: `getPeriodDates`, `detectActivePeriod`, `PERIOD_KEYS` (exportar a constante, hoje privada), `restaurarFiltros`, `FILTERS_COOKIE`, `hojeEmSaoPaulo` de `lib/finance/filtros-lembrados.ts`.
- Produces:
  - `RECORTE_COOKIE = 'recorte'`
  - `type Recorte = { startDate: string; endDate: string; accountIds: string[] }` (string vazia = ponta aberta)
  - `serializarRecorte(r: Recorte, hoje?: string): string`: atalho relativo vira `period=<key>`, como `serializarFiltros`.
  - `lerRecorte(cookies: Record<string, string | undefined>, hoje?: string): Recorte | null`: lê `recorte`; se não houver, monta de `tx-filters` (só período) + `tx-accounts`; null se nada.
  - `recorteDaUrl(params: Record<string, string | undefined>): Partial<Recorte>`: só as chaves presentes. `month=YYYY-MM-01` vira o mês inteiro.
  - `temRecorteNaUrl(params): boolean`: `startDate`, `endDate`, `accountId` ou `month` presentes.
  - `contasValidas(ids: string[], permitidas: string[]): string[]`
  - `mesParaTelaDeMes(r: Recorte | null, hoje?: string): string`: `YYYY-MM-01` do `endDate`; sem `endDate`, mês de `hoje`.
  - `destinoComRecorte(path: string, params: Record<string, string | undefined>, r: Recorte | null, modo: 'intervalo' | 'mes', opts?: { contas?: boolean }): string | null`: URL para redirecionar, ou null quando a URL já tem recorte, `r` é null, ou o destino seria igual ao atual.
  - `gravarRecorte(parcial: Partial<Recorte>): void` (cliente; funde com o cookie atual e grava com `path=/; max-age=31536000; SameSite=Lax`).
  - `RECORTE_PADRAO(hoje?: string): Recorte`: "Este mês" (`getPeriodDates('month')`), sem contas.

- [ ] **Step 1: testes que falham**

```ts
it('relativo continua relativo', () => {
  const s = serializarRecorte({ ...getPeriodDates('last3Months', '2026-11-11'), accountIds: ['a'] }, '2026-11-11')
  expect(lerRecorte({ recorte: s }, '2027-01-05')).toEqual({ ...getPeriodDates('last3Months', '2027-01-05'), accountIds: ['a'] })
})
it('sem cookie novo, herda tx-filters e tx-accounts', () => {
  expect(lerRecorte({ 'tx-filters': 'startDate=2026-03-01&endDate=2026-03-31&search=uber', 'tx-accounts': 'a,b' }))
    .toEqual({ startDate: '2026-03-01', endDate: '2026-03-31', accountIds: ['a', 'b'] })
})
it('month vira o mês inteiro', () => expect(recorteDaUrl({ month: '2026-02-01' })).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' }))
it('tela de mês sem fim usa o mês de hoje', () => {
  expect(mesParaTelaDeMes({ startDate: '2025-01-01', endDate: '', accountIds: [] }, '2026-11-11')).toBe('2026-11-01')
  expect(mesParaTelaDeMes(null, '2026-11-11')).toBe('2026-11-01')
})
it('conta desconhecida sai sem apagar as outras', () => expect(contasValidas(['x', 'a'], ['a', 'b'])).toEqual(['a']))
it('não redireciona em laço', () => {
  expect(destinoComRecorte('/transactions', { startDate: '2026-01-01' }, RECORTE_PADRAO(), 'intervalo')).toBeNull()
  expect(destinoComRecorte('/transactions', {}, { startDate: '', endDate: '', accountIds: [] }, 'intervalo')).toBeNull()
})
it('tela de mês recebe month', () => {
  expect(destinoComRecorte('/budgets/spending', {}, { startDate: '2026-10-01', endDate: '2026-10-31', accountIds: ['a'] }, 'mes'))
    .toBe('/budgets/spending?month=2026-10-01')
})
it('preserva os outros parâmetros', () => {
  expect(destinoComRecorte('/transactions', { pageSize: '50' }, { startDate: '2026-10-01', endDate: '2026-10-31', accountIds: [] }, 'intervalo'))
    .toBe('/transactions?pageSize=50&startDate=2026-10-01&endDate=2026-10-31')
})
```

- [ ] **Step 2:** `npx vitest run __tests__/finance/recorte.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** implementar `lib/finance/recorte.ts` com as assinaturas acima. `gravarRecorte` lê `document.cookie`, funde e grava.
- [ ] **Step 4:** rodar de novo → PASS.
- [ ] **Step 5:** commit `feat(filtros): módulo do recorte compartilhado`.

### Tarefa 2: hook de URL

**Files:**
- Create: `components/finance/filtros/use-filtros-na-url.ts`
- Test: `__tests__/finance/use-filtros-na-url.test.tsx`

**Interfaces:**
- Consumes: `gravarRecorte`, `recorteDaUrl` (Tarefa 1).
- Produces: `useFiltrosNaUrl(baseUrl: string, opts?: { gravaRecorte?: boolean; aoMudar?: (p: URLSearchParams) => void }): { params: URLSearchParams; trocar: (over: Record<string, string>) => void }`. `trocar`: valor vazio apaga a chave, tira `page`, chama `router.replace(\`${baseUrl}?${qs}\`, { scroll: false })` dentro de `startTransition`. Com `gravaRecorte` (padrão true), grava o que for recorte da URL nova. `aoMudar` existe para Transações seguir chamando `lembrarFiltros` com a busca e os filtros de coluna.

- [ ] **Step 1:** testes com `next/navigation` mockado, como em `__tests__/finance/*` que já mockam `useRouter`:
  - `trocar({ search: '' })` sobre `?search=x&page=3&accountId=a` chama `replace('/transactions?accountId=a', { scroll: false })`.
  - `trocar({ startDate: '2026-10-01' })` grava o cookie `recorte` com o novo início.
  - com `gravaRecorte: false`, o cookie não muda.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(filtros): hook único para escrever filtro na URL`.

---

## Fase 2: controles padronizados (mesmo comportamento, um código só)

### Tarefa 3: lista com caixas e pílula

**Files:**
- Create: `components/finance/filtros/lista-com-caixas.tsx`, `components/finance/filtros/pilula.ts`
- Modify: `components/finance/account-filter.tsx`, `components/finance/card-digits-filter.tsx`, `components/finance/column-filter-dropdown.tsx` (Tipo e Categoria), `components/finance/transaction-filters.tsx:57-58`, `components/finance/cash-flow-client.tsx:64-66`, `components/investments/mostrar-encerrados.tsx`
- Test: `__tests__/finance/lista-com-caixas.test.tsx`; os testes atuais de `AccountFilter`/`CardDigitsFilter` continuam passando sem mudança de asserção, exceto o rótulo "Todos os finais do cartão".

**Interfaces:**
- Produces:
  - `ListaComCaixas<T extends string>(props: { rotulo: string; rotuloTodos: string; opcoes: { valor: T; rotulo: string; grupo?: string }[]; marcados: T[]; aoMudar: (v: T[]) => void; resumo?: (marcados: T[]) => string; atalhos?: React.ReactNode; alinhar?: 'esquerda' | 'direita' })`. Painel fecha com clique fora e com Esc, e o foco volta ao botão. Botão escuro quando há marcado.
  - `pilula.ts`: `PILULA_BASE`, `PILULA_OFF`, `PILULA_ON` (os valores de `cash-flow-client.tsx:64-66`, com `h-8`). `MostrarEncerrados` passa a usá-las.
- `AccountFilter`, `CardDigitsFilter`, `TypeFilter` e `CategoryFilter` mantêm as props públicas e passam a renderizar `ListaComCaixas`. O atalho por titular de `AccountFilter` vai em `atalhos`.

- [ ] **Step 1:** testes: Esc fecha e devolve o foco ao botão; clicar fora fecha; "Todas as contas" esvazia `marcados`; com 2 marcados o resumo padrão é "2 selecionados".
- [ ] **Step 2:** FAIL. **Step 3:** implementar e migrar os quatro filtros e as duas cópias de pílula. **Step 4:** `npx vitest run __tests__/finance` → PASS.
- [ ] **Step 5:** commit `refactor(filtros): lista com caixas e pílula únicas`.

### Tarefa 4: seletor de período único

**Files:**
- Create: `components/finance/filtros/seletor-de-periodo.tsx`
- Modify: `lib/finance/filtros-lembrados.ts` (nova `andarMes(mes: string, delta: number): string`, formato `YYYY-MM-01`); `components/finance/transaction-filters.tsx:177-268` (troca o trecho inline); remove `components/finance/cash-flow-period-filter.tsx` e passa `cash-flow-client.tsx` a usar o novo; remove os `shiftMonth` de `app/(app)/budgets/{spending,pacing,investing}/client.tsx` e de `components/finance/parcelados-no-cartao.tsx`, usando `andarMes`.
- Test: `__tests__/finance/seletor-de-periodo.test.tsx`, `__tests__/finance/filtros-lembrados.test.ts` (adicionar `andarMes`)

**Interfaces:**
- Produces: `SeletorDePeriodo(props: { modo: 'intervalo' | 'mes'; startDate: string; endDate: string; aoMudar: (p: { startDate: string; endDate: string }, atalho: PeriodKey | null) => void })`.
  - `intervalo`: botão de atalhos (`PeriodFilter`), setas de mês (`MonthNavigator`), duas datas com ×. No celular, `<select>` nativo + setas, como hoje em Transações.
  - `mes`: só `MonthNavigator`, devolvendo o mês inteiro.
- `andarMes('2026-01-01', -1) === '2025-12-01'`.

- [ ] **Step 1:** testes: setas em `mes` sobre outubro de 2026 chamam `aoMudar({ startDate: '2026-11-01', endDate: '2026-11-30' }, null)`; escolher "Últimos 3 meses" passa a chave; × da data inicial chama com `startDate: ''`; `andarMes` cobre virada de ano.
- [ ] **Step 2:** FAIL. **Step 3:** implementar e migrar. As telas de mês continuam com `?month=`, agora por `router.replace`. **Step 4:** PASS.
- [ ] **Step 5:** commit `refactor(filtros): um seletor de período para todas as telas`.

Fim da fase 2: verificação global, merge e push. Visualmente igual, salvo "Todos os finais do cartão", Esc nos popovers e Orçamentos/Dívidas sem poluir o histórico.

---

## Fase 3: o recorte vale em todas as telas

### Tarefa 5: Transações e Conta usam o recorte

**Files:**
- Modify: `app/(app)/transactions/page.tsx:50-74` (troca os dois redirects por um `destinoComRecorte(..., 'intervalo', { contas: true })` com `lerRecorte(jar)`); `components/finance/transaction-filters.tsx` e `transaction-list-wrapper.tsx` (escrevem por `useFiltrosNaUrl`; Transações segue gravando `tx-filters` via `aoMudar` para a busca e as colunas); `app/(app)/accounts/[accountId]/page.tsx` (redirect de período, `contas: false`); `components/layout/sidebar.tsx:99-112` (`hrefDoItem`: Transações, Análises e Orçamentos montam a URL a partir de `lerRecorte(lerCookies())`); `lib/finance/filtros-lembrados.ts` (`urlDeTransacoes` passa a usar o recorte; `tx-accounts` deixa de ser gravado).
- Test: atualizar `__tests__/finance/*transactions-page*`/`filtros-lembrados` e criar casos em `__tests__/layout/sidebar*.test.tsx`.

- [ ] **Step 1:** testes:
  - Transações sem nada na URL e com o cookie `recorte` de outubro + conta `a` redireciona para `?startDate=2026-10-01&endDate=2026-10-31&accountId=a`.
  - Sem cookie nenhum, abre em "Este mês" (`RECORTE_PADRAO`).
  - Conta `/accounts/x` com recorte de outubro redireciona com período e sem `accountId`.
  - O link da sidebar para Gastos com recorte de outubro é `/budgets/spending?month=2026-10-01`.
  - A conta de investimento do recorte não aparece marcada em Transações (`contasValidas` com `contasParaLancamento`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(filtros): Transações e Conta abrem no recorte compartilhado`.

### Tarefa 6: Análises pela URL, com período longo

**Files:**
- Modify: `app/(app)/cash-flow/page.tsx` (recebe `searchParams`, redireciona com `destinoComRecorte(..., 'intervalo', { contas: true })`, consulta pelo período); `lib/finance/queries-transactions.ts:409` (`getRecentTransactions(orgId, opts: { inicio?: string; fim?: string })` no lugar de `months`; manter um caminho compatível para os outros chamadores, achados com `grep -rn getRecentTransactions`); `components/finance/cash-flow-client.tsx` (período e contas vêm de `searchParams` e escrevem por `useFiltrosNaUrl`; localStorage fica só com `chartType`, `showLabels`, `hideTransfers`, `viewMode`); `app/api/cash-flow/export/route.ts` (lê `startDate`/`endDate`/`accountId` da query); `BotaoDeExportar` em `cash-flow/page.tsx` recebe a URL com o recorte.
- Test: `__tests__/finance/cash-flow-*.test.tsx` existentes, mais um caso para a visão.

**Visão (spec, "Visão Realizado/Projetado"):** `visaoInicial(pref: ViewMode, startDate: string, endDate: string, hoje: string): ViewMode`, exportada de `cash-flow-client.tsx` ou de um módulo vizinho. Período todo no futuro dá `projected`. Todo no passado com `pref === 'projected'` dá `realized`. Fora isso, `pref`. `trocarVisao`, quando estica o período, escreve na URL (e assim grava o recorte).

- [ ] **Step 1:** testes: `visaoInicial('realized', '2026-12-01', '2027-02-28', '2026-11-11') === 'projected'`; `visaoInicial('projected', '2026-01-01', '2026-03-31', '2026-11-11') === 'realized'`; com `?startDate=2020-01-01` a página pede ao banco desde 2020, e não 24 meses; a rota de export com `?startDate=2026-10-01&endDate=2026-10-31` só traz outubro.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS. Conferir a consulta no banco real com rollback para "Todo o período" (tempo e linhas).
- [ ] **Step 5:** commit `feat(filtros): Análises no recorte compartilhado, sem corte de 24 meses`.

### Tarefa 7: Cartões no recorte

**Files:**
- Modify: `app/(app)/cash-flow/cartoes/page.tsx`; `lib/finance/queries-gastos-cartao.ts` (`getGastosDosCartoes(orgId, { inicio: string; fim: string })`: faturas cujo `fechamento` está no intervalo; sem período, as últimas 12 como hoje); `components/finance/gastos-dos-cartoes.tsx:127-148` (cartão vira `ListaComCaixas` de cartões, sobre `accountId` da URL; categoria vira `ListaComCaixas` por id em `?categoryIds=`, que não grava no recorte; o seletor de período entra no topo com `modo="intervalo"`).
- Test: `__tests__/finance/gastos-dos-cartoes*.test.tsx` e o de consulta.

- [ ] **Step 1:** testes: o recorte com um cartão e uma conta corrente mostra só o cartão marcado, e a conta corrente continua no cookie; o período de 01/09 a 31/10 traz só faturas com fechamento nesse intervalo; categoria filtrada por id.
- [ ] **Step 2–4:** FAIL, implementar, PASS. Conferir no banco real.
- [ ] **Step 5:** commit `feat(filtros): Cartões no recorte, por fatura`.

### Tarefa 8: telas de mês no recorte

**Files:**
- Modify: `app/(app)/budgets/spending/page.tsx:17-23`, `budgets/pacing/page.tsx:26`, `budgets/investing/page.tsx:18`, `budgets/spending/simulador/page.tsx`, `app/(app)/debts/page.tsx:21-25`. Cada uma: sem `month` na URL, `redirect(destinoComRecorte(path, params, lerRecorte(jar), 'mes'))`, e o default sem cookie passa a ser `mesParaTelaDeMes(null)`. Valida `month` com a regex de `debts/page.tsx:23` e, se inválido, trata como ausente. Os clients gravam o recorte ao andar o mês (`useFiltrosNaUrl`).
- Test: um teste por página no padrão de `__tests__/finance/*page*.test.tsx`.

Dívidas hoje abre na próxima fatura com parcela. Com o recorte, abre no mês do recorte. Sem recorte nenhum, mantém a regra atual.

- [ ] **Step 1:** testes: Gastos sem `month` e com recorte de outubro redireciona para `?month=2026-10-01`; `?month=abc` se comporta como ausente; andar para novembro grava o recorte de 01/11 a 30/11.
- [ ] **Step 2–4:** FAIL, implementar, PASS.
- [ ] **Step 5:** commit `feat(filtros): Orçamentos e Dívidas seguem o mês do recorte`.

Fim da fase 3: verificação global, merge e push. Registrar na memória do projeto o rollback desta fase (cookie `recorte` novo; `tx-filters` segue sendo gravado, então voltar a versão não perde nada).

---

## Fase 4: celular

### Tarefa 9: gaveta de filtros

**Files:**
- Create: `components/finance/filtros/gaveta-de-filtros.tsx`
- Modify: `components/finance/transaction-filters.tsx` (o botão "Filtros" abre a gaveta e a linha expandida sai; tira a pílula "Tipo, categoria ou valor" da etapa A, porque a gaveta passa a ter os controles); `components/finance/cash-flow-client.tsx` e `gastos-dos-cartoes.tsx` (mesmo padrão: período e setas visíveis, o resto na gaveta).
- Test: `__tests__/finance/gaveta-de-filtros.test.tsx`

**Interfaces:**
- Produces: `GavetaDeFiltros(props: { contador: number; children: React.ReactNode })`: botão "Filtros" com contador (`md:hidden`) e Radix Dialog ancorado embaixo. Fecha com Esc, pelo botão "Ver resultados" e tocando fora.
- Transações coloca na gaveta: busca, contas, finais, futuros, `TypeFilter`, `CategoryFilter`, `AmountFilter`, ordenação (um `<select>` com as colunas de `buildTransactionOrder` e a direção) e, depois da Tarefa 11, as pílulas de critério. O contador conta tudo isso.

- [ ] **Step 1:** testes: com `?types=expense&categoryIds=a` o contador mostra 2; dentro da gaveta, o `CategoryFilter` desmarca e chama `replace` sem `categoryIds`; a ordenação muda `sortBy`/`sortDir`.
- [ ] **Step 2–4:** FAIL, implementar, PASS. Conferir em 375 px no navegador (skill `run`) que nenhum filtro fica inalcançável.
- [ ] **Step 5:** commit `feat(filtros): gaveta de filtros no celular`.

Fim da fase 4: verificação global, merge e push.

---

## Fase 5: do total ao lançamento

### Tarefa 10: filtros de critério em Transações

**Files:**
- Modify: `lib/finance/filtros-da-url.ts` (lê `caixa` e `situacao`); `lib/finance/queries-transactions.ts:95` (`buildTransactionConditions`); `lib/finance/filtros-lembrados.ts:55-58` (`FILTER_KEYS` ganha `caixa`, `situacao`); `components/finance/transaction-filters.tsx` (pílulas visíveis).
- Test: `__tests__/finance/build-transaction-conditions*.test.ts` (ou o arquivo que já testa a função).

**Interfaces:**
- `caixa=1` → `isIgnored = false`, `reviewState = 'confirmed'`, `effectiveAffectsCashFlow`. Pílula "Só o que entra nas análises", ativa em `PILULA_ON`. O × desliga.
- `situacao=realizado` → `somenteRealizado`. `situacao=previsto` → `balanceApplied = false` e `matchedTransactionId` nulo (já é a regra geral), sem o corte em hoje. Pílula "Só realizados" ou "Só previstos".
- `effectiveAffectsCashFlow` precisa do `leftJoin(categories)`. Conferir que a consulta de contagem e a de linhas fazem esse join. Se a de contagem não fizer, adicionar.

- [ ] **Step 1:** testes das condições geradas para cada parâmetro e do texto das pílulas.
- [ ] **Step 2–4:** FAIL, implementar, PASS.
- [ ] **Step 5:** commit `feat(transacoes): filtros visíveis de critério das análises`.

### Tarefa 11: links de total em Gastos, Ritmo e Análises

**Files:**
- Create: `lib/finance/link-do-total.ts`
- Modify: linhas de categoria em `app/(app)/budgets/spending/client.tsx` e `budgets/pacing/client.tsx`, mais "Ver todos no mês" em `components/finance/pacing-transactions-dialog.tsx`; células por categoria × mês em `components/finance/cash-flow-breakdown.tsx` (o `serialize` de `cash-flow/page.tsx` passa a levar `categoryId`, e o detalhamento agrupa por id, mostrando o nome); receitas e despesas do mês em `components/finance/quick-stats-row.tsx` (Dashboard).
- Test: `__tests__/finance/link-do-total.test.ts`, mais um teste de soma por origem.

**Interfaces:**
- `linkDoTotal(o: { inicio: string; fim: string; categoryIds?: string[]; accountIds?: string[]; tipos?: ('income' | 'expense')[]; caixa?: boolean; situacao?: 'realizado' | 'previsto' }): string`. Sempre `/transactions?...`, com as chaves na ordem de `FILTER_KEYS`.
- `idsComFilhas(categoryId: string, categorias: { id: string; parentId: string | null }[]): string[]`.
- Por origem:
  - **Gastos/Ritmo:** `tipos: ['expense'], caixa: true, situacao: 'realizado'`, categoria com as filhas, mês da tela.
  - **Análises:** `caixa: true`, `situacao` pela visão (`both` omite), `tipos: ['income','expense']` quando "ocultar transferências" está ligado, contas e período da tela restritos ao mês da célula.
  - **Dashboard:** os critérios de `getMonthlyCashFlowSummary`, que o implementador lê e reproduz. Se não for reproduzível com os filtros da Tarefa 10, o card fica sem link e isso é registrado no commit.

- [ ] **Step 1:** testes de `linkDoTotal` e `idsComFilhas`. Teste de soma: com o banco mockado no padrão dos testes de consulta, a soma de `getSpendingByCategory` para (categoria, mês) é igual à soma de `buildTransactionConditions(filtrosDaUrl(params do link))` sobre o mesmo conjunto de linhas. Monte as linhas com um estorno, um ignorado, uma previsão conciliada e uma aplicação que não afeta o caixa.
- [ ] **Step 2–4:** FAIL, implementar, PASS. Conferir no banco real: para três categorias de outubro, a soma da tela é igual à da lista.
- [ ] **Step 5:** commit `feat(filtros): total de categoria abre os lançamentos que o compõem`.

### Tarefa 12: Cartões abre a fatura

**Files:**
- Modify: `lib/finance/filtros-da-url.ts` e `queries-transactions.ts` (`fatura=YYYY-MM-DD`, válido só com exatamente uma conta-cartão em `accountId`: o servidor calcula os ids da fatura com a mesma função de `getGastosDosCartoes` (`gastosPorFatura`, `packages/core-finance/src/gastos-do-cartao`) e filtra por `inArray(transactions.id, ids)`); `FILTER_KEYS` ganha `fatura`; pílula visível "Fatura de <mês/ano> ×"; `components/finance/gastos-dos-cartoes.tsx` (barra e linha de categoria viram link: `accountId` do cartão, `fatura` e, na linha, `categoryIds` com as filhas).
- Test: teste de soma: `totalCents` de uma fatura de `getGastosDosCartoes` é igual à soma da lista filtrada, com uma parcela de compra antiga e um lançamento com `bill_id`.

Spec: se o ciclo por datas reproduzir o total, quem constrói pode usar datas. O teste de soma decide. Este plano escolhe `fatura=` porque `gastosPorFatura` usa `purchaseDate`, parcelas e `billForecastMonth`, que um intervalo de datas não reproduz.

- [ ] **Step 1–4:** teste de soma FAIL, implementar, PASS. Conferir no banco real com uma fatura de cartão parcelado.
- [ ] **Step 5:** commit `feat(filtros): fatura do cartão abre os lançamentos dela`.

Fim da fase 5: verificação global, merge e push.

---

## Fase 6: Investimentos

### Tarefa 13: conta da carteira não se perde

**Files:**
- Modify: `components/investments/abas-de-investimentos.tsx:7-13` (as abas levam `accountId` da URL atual); `app/(app)/investments/[assetId]/page.tsx:65-70` (o Voltar leva `?accountId` se veio); `components/investments/position-table.tsx` (o link do ativo leva `?accountId`); `portfolio-event-form.tsx:142,333`, `asset-form.tsx:67,162`, `asset-edit-form.tsx:38` (voltam para `/investments` com o `accountId` recebido por prop); `components/investments/filtro-de-conta-da-carteira.tsx` e `mostrar-encerrados.tsx` (usam `useFiltrosNaUrl('/investments', { gravaRecorte: false })`); `lib/investments/contas-dos-ativos.ts:5-8` (`ContaComAtivos` ganha `titular`, para o atalho por titular aparecer).
- Test: `__tests__/investments/abas-de-investimentos.test.tsx` e o de posições.

- [ ] **Step 1:** testes: em `/investments?accountId=a`, a aba Resumo linka `/investments/dashboard?accountId=a`; o link de um ativo leva `accountId=a` e o Voltar dele retorna a `/investments?accountId=a`; o filtro da carteira não grava o cookie `recorte`.
- [ ] **Step 2–4:** FAIL, implementar, PASS.
- [ ] **Step 5:** commit `fix(investimentos): conta escolhida acompanha abas e ativo`.

Fim da fase 6: verificação global, merge e push.
