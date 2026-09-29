# Conciliar: um fluxo só, sem trava — design

**Data:** 2026-09-29
**Revoga:** a decisão de 22/09/2026 de manter as filas separadas
**Remove:** o portão de `2026-09-04-openfinance-counterparty-review-design.md`
(o app deixa de trancar até Classificar ficar vazia)
**Depende de:** `2026-09-28-conciliacao-unica-design.md` (em produção desde
29/09), que já absorve sozinho perna de transferência e lançamento manual

---

## 1. O problema

Para o usuário, decidir se dois lançamentos são o mesmo, dizer o que é uma
contraparte e tirar uma cópia repetida são a mesma tarefa: **conciliar**. Hoje
são três telas, com três caminhos de entrada:

| Fila | Rota | Trava o app? |
|---|---|---|
| Remover repetidos | `/transactions/duplicates` | não |
| Classificar lançamentos | `/transactions/review` | **sim** (`ReviewGate` no layout) |
| Confirmar previsões | `/transactions/matches` | não |

A faixa `PendingQueuesNotice` já ordena as três (repetido → classificar →
confirmar), mas cada uma continua sendo um destino separado. E Classificar
tranca o app inteiro, o que as outras duas não fazem: não existe fila "meio
bloqueante", então três telas com dois modelos de urgência diferentes.

Decisão do usuário em 28/09: "é tudo conciliação, tem que estar no mesmo
workflow", e **nada trava o app** ("o mais simples e que abarque todos os
contextos").

## 2. A regra

> Uma tela, "Conciliar", com tudo que pede decisão sobre lançamento
> importado. Nenhuma decisão tranca o app.

Unifica a **jornada**, não os domínios. Contraparte continua sendo entidade
com memória (a decisão vale para os próximos lançamentos do mesmo CNPJ);
repetido e previsão continuam sendo propostas par a par. As ações, as tabelas
e as regras de cada fila não mudam.

## 3. Mudanças

### 3.1 Tela única `/transactions/conciliar`

Página nova `app/(app)/transactions/conciliar/page.tsx`, com três seções na
ordem da faixa de hoje:

1. **Repetidos** — `DuplicateProposalQueue` (dados de `getDuplicatasPendentes`)
2. **Classificar** — `CounterpartyQueue mode="page"` (grupos pendentes + regras
   confirmadas, como hoje em `/transactions/review`)
3. **Confirmar** — `MatchProposalQueue` (dados de `getPropostasPendentes`)

- Cada seção tem título com contador e `id` âncora (`#repetidos`,
  `#classificar`, `#confirmar`).
- Seção vazia não aparece. A seção Classificar aparece sempre que houver regras
  confirmadas para editar, mesmo sem pendentes — hoje a lista de regras mora
  nessa tela e continua morando.
- Tudo vazio (e nenhuma regra para editar): estado "Tudo conciliado".
- `?regra=<counterpartyId>` ("Corrigir regra" do menu da linha) continua
  funcionando: abre a seção Classificar com a regra em edição.
- As três seções carregam em paralelo, cada uma em seu `<Suspense>`; falha de
  uma não derruba as outras (mesmo princípio de `pending-queues-slot.tsx`, em
  que contagem que falha vira 0).

### 3.2 Rotas antigas redirecionam

`/transactions/review` → `/transactions/conciliar#classificar` (preservando
`?regra=`), `/transactions/matches` → `#confirmar`,
`/transactions/duplicates` → `#repetidos`. `redirect()` do Next no
`page.tsx` de cada uma. Links salvos, o WhatsApp e e-mails antigos continuam
chegando.

### 3.3 Sai a trava

- `app/(app)/layout.tsx`: remove a chamada a `getReviewGateStatusSafe()` e o
  ramo que renderiza `<ReviewGate>` no lugar do app.
- Apaga `components/openfinance/review-gate.tsx` e o `mode="blocking"` de
  `CounterpartyQueue`/`FilaDeClassificar` (estado vazio bloqueante incluído).
- `getReviewGateStatus`, `getReviewGateStatusSafe`, `reviewGateTag` e o trecho
  de `confirmCounterparty` que grava `reviewGateClearedAt` saem.
- A coluna `orgs.review_gate_cleared_at` fica no banco sem uso (sem
  migration). Remover numa limpeza futura.

### 3.4 Como o usuário chega lá

Nada obriga, então o caminho tem de estar onde o assunto aparece:

- **Faixa na tela de Transações:** `PendingQueuesNotice` vira uma linha só —
  "N itens para conciliar →" — somando as três contagens, link para
  `/transactions/conciliar`. Mantém o destaque âmbar quando há repetido (é o
  que distorce o saldo).
- **Botão do cabeçalho de Transações:** "Classificar lançamentos" vira
  "Conciliar", com o total entre parênteses quando > 0.
- **Depois de conectar um banco:** o assistente (`connect-wizard.tsx`, nos dois
  pontos que hoje fazem `router.refresh()` depois de importar) leva para
  `/transactions/conciliar` se o total for > 0. Hoje é o portão que faz esse
  papel; sem ele, o primeiro import precisa de um destino explícito.
- **Selo "confirmar?" da linha** (`transaction-display-row.tsx`): link para
  `/transactions/conciliar#confirmar`.
- **Paleta de comandos:** a entrada "Classificar" vira "Conciliar".
- **Menu lateral: sem item novo.** "Transações" continua destacado na sub-rota
  (regra de `sidebar.tsx` e teste `filas-fora-do-menu`).

A contagem total sai de um helper só, `contarItensParaConciliar(orgId)`, que
soma `contarDuplicatasPendentes`, `contarLancamentosAClassificar` e
`contarPropostasPendentes` em paralelo (falha de uma conta como 0). Usado pela
faixa, pelo botão e pelo assistente.

### 3.5 Limpeza

`lib/finance/forecast-match-badge.ts` (`contagemDeConciliacoesPendentes`) não é
usado por nenhuma página: sai, com o teste.

## 4. O que não muda

- Ações: `confirmCounterparty`, `corrigirRegra`, `aprovarProposta`,
  `recusarProposta`, `aprovarDuplicata`, `recusarDuplicata`.
- Queries de cada fila e a ordem de cada lista.
- Tabelas `duplicate_proposals`, `forecast_match_proposals`, `counterparties`.
- O motor de conciliação (`conciliarConta`) e o que ele manda para a fila.

## 5. Testes

- Página Conciliar: renderiza as seções não vazias na ordem
  repetidos → classificar → confirmar; esconde as vazias; "Tudo conciliado"
  com tudo vazio; seção Classificar visível só com regras confirmadas;
  `?regra=` abre a edição; falha de uma seção não derruba as outras.
- Redirects das três rotas antigas (com `?regra=` preservado).
- Layout: com lançamentos pendentes de classificar, o app renderiza normal
  (não há mais portão).
- `contarItensParaConciliar`: soma, e falha de uma contagem vira 0.
- Faixa: uma linha com o total e link; âmbar só com repetido.
- Assistente de conexão: vai para Conciliar com total > 0, fica com 0.
- Os testes existentes das três filas passam a mirar os componentes (não as
  rotas); `filas-fora-do-menu` continua passando; saem os testes do portão
  (`counterparty-queries.test.ts` na parte do gate) e de `forecast-match-badge`.

## 6. Arquivos

Novos:

- `apps/web/app/(app)/transactions/conciliar/page.tsx`
- `apps/web/lib/finance/itens-para-conciliar.ts` (`contarItensParaConciliar`)

Alterados:

- `apps/web/app/(app)/layout.tsx` — sem portão
- `apps/web/app/(app)/transactions/{review,matches,duplicates}/page.tsx` —
  viram redirects
- `apps/web/app/(app)/transactions/page.tsx` — botão "Conciliar"
- `apps/web/components/finance/pending-queues-notice.tsx`,
  `pending-queues-slot.tsx` — uma linha com o total
- `apps/web/components/finance/transaction-display-row.tsx` — link do selo
- `apps/web/components/openfinance/counterparty-queue.tsx`,
  `counterparty-queue-client.tsx` — sem `mode="blocking"`
- `apps/web/lib/openfinance/counterparty-queries.ts`,
  `counterparty-actions.ts` — sem portão
- `apps/web/app/(app)/accounts/connect/connect-wizard.tsx` — destino depois do
  import
- `apps/web/components/layout/command-palette.tsx` — "Conciliar"

Removidos:

- `apps/web/components/openfinance/review-gate.tsx`
- `apps/web/lib/finance/forecast-match-badge.ts` e seu teste
