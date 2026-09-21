# Conciliação previsto×realizado com aprovação do usuário — design

**Data:** 2026-09-21
**Estende:** migration `00042_forecast_match.sql` e `lib/finance/forecast-match-db.ts`
**Espelha:** `docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md`

---

## 1. O problema

`matchForecastsForAccount` roda depois de cada sync e grava
`transactions.matched_transaction_id` direto: a previsão do template é
declarada cumprida pelo lançamento do banco sem ninguém olhar. O acerto do
casamento é uma aposta de heurística — `matchForecast` casa por sinal, janela
de 7 dias, tolerância de valor de 1% (ou 8% com palavra em comum na
descrição).

O risco não é simétrico. Casar errado **esconde um lançamento de verdade**: a
previsão sai da fila de conciliação e o realizado fica sozinho no saldo, sem
nada apontando que aquele par era mentira. Não casar apenas deixa a previsão
pedindo ação, que é visível e reversível.

Quem decide se dois lançamentos são o mesmo dinheiro é o dono do dinheiro.

## 2. Princípio

> O sistema propõe o par. Quem efetiva é o usuário, um par por vez.

Duas consequências que delimitam o escopo:

- **O saldo não espera ninguém.** O lançamento do banco continua entrando em
  `accounts.balance_cents` na importação, exatamente como hoje. O portão é do
  vínculo, não do dinheiro — segurar o saldo atrás de uma fila deixaria o app
  mostrando um saldo que não é o da conta, que é pior do que o problema.
- **A fila não bloqueia o app.** Diferente do portão de contrapartes
  (`reviewGateClearedAt`), que tranca o dashboard até a primeira limpeza.
  Aqui o custo de não decidir é baixo: a previsão continua com selo pedindo
  ação e fora de qualquer saldo. Trancar o app por causa disso seria
  desproporcional.

## 3. Dado novo

Tabela `forecast_match_proposals`:

| coluna | tipo | papel |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid fk orgs cascade | escopo de tenant |
| `forecast_transaction_id` | uuid fk transactions cascade | a previsão |
| `realized_transaction_id` | uuid fk transactions cascade | o lançamento do banco |
| `status` | text check (`pending`/`approved`/`refused`) | |
| `proposed_at` | timestamptz default now() | |
| `decided_at` | timestamptz null | preenchido na decisão |

`ON DELETE CASCADE` nos dois lados: apagar qualquer uma das duas pontas leva a
proposta junto. Proposta órfã apontando para lançamento que não existe mais
seria linha na fila sem nada para mostrar.

Três índices carregam as regras que o código não deve ter que garantir:

```sql
-- O par recusado nunca volta a ser proposto. O criador insere com
-- ON CONFLICT DO NOTHING, então a recusa é uma parede, não uma checagem.
create unique index on forecast_match_proposals
  (forecast_transaction_id, realized_transaction_id);

-- Uma proposta aberta por previsão.
create unique index on forecast_match_proposals (forecast_transaction_id)
  where status = 'pending';

-- Um realizado não é reivindicado por duas previsões ao mesmo tempo.
-- Espelha idx_transactions_matched_unique da 00042.
create unique index on forecast_match_proposals (realized_transaction_id)
  where status = 'pending';
```

Políticas de RLS no padrão da `00044_app_role_rls.sql`: leitura e escrita
limitadas à org do requisitante.

**O que NÃO muda:** `transactions.matched_transaction_id` continua sendo a
única verdade do "conciliado" — quem lê saldo, selo e fila de casamento não
precisa saber que propostas existem. Ele passa a ser gravado só na aprovação.

## 4. Fluxo

```
sync importa                    → lançamento no saldo (como hoje)
    ↓
criarPropostasParaConta         → proposta pending
    ↓
fila /transactions/matches
    ↓
  "É o mesmo"                   → matched_transaction_id + status approved
  "São diferentes"              → status refused; previsão segue aberta
```

**Criação.** `matchForecastsForAccount` (hoje em
`lib/finance/forecast-match-db.ts`) para de gravar o vínculo e passa a inserir
propostas. A função pura `matchForecast` do `@floow/core-finance` não muda —
só o destino da escrita. O universo de candidatos ganha um filtro: previsão
que já tem proposta pendente sai da lista, e o par já recusado é barrado pelo
índice único na inserção.

**Aprovação.** Numa transação: grava `matched_transaction_id` na previsão e
`status='approved'`, `decided_at=now()` na proposta. Idempotente — decidir
uma proposta que não está mais `pending` não faz nada e não é erro (dois
cliques, duas abas).

**Recusa.** Só a proposta muda de status. A previsão não é tocada: continua
aberta, elegível a outra proposta num sync futuro, e o par recusado nunca
reaparece.

**O passado.** Os casamentos que já existem em produção ficam como estão — são
fato consumado, e reabrir todos eles para aprovação transformaria uma melhoria
em mutirão. A migration não cria proposta retroativa. O gate vale do deploy
para frente.

## 5. Tela

Rota `/transactions/matches`, item "Conciliações" na seção "Dia a dia" do
menu, ao lado de Recorrentes.

O contador de pendentes reaproveita o mecanismo que o `Sidebar` já tem para o
`cfoBadgeCount` — a diferença é que hoje **ninguém alimenta aquele prop**: o
`(app)/layout.tsx` não passa contagem nenhuma. Alimentar significa uma
consulta a mais em todo request do app, então ela entra como `count` sob
`unstable_cache` com a tag de transações, que o sync e as decisões da fila já
invalidam. Sem isso, o badge custaria uma ida ao banco por navegação para
mostrar um número que muda poucas vezes por dia.

Cada proposta mostra os dois lados e o motivo do par:

```
┌─ Aluguel ───────────────────────────────┐
│ previsto   01/09   -R$ 1.200,00         │
│ banco      03/09   -R$ 1.200,00   Itaú  │
│ 2 dias de diferença · mesmo valor       │
│                                         │
│   [ É o mesmo ]   [ São diferentes ]    │
└─────────────────────────────────────────┘
```

Ordenada por dinheiro, decrescente — o mesmo princípio que a fila de
contrapartes validou: "R$ 92 mil" move o usuário, "12 itens" não.

Sem "aprovar todas". A decisão é par por par por desenho; um botão de varredura
devolveria o problema que este design existe para resolver.

## 6. Efeito nos selos

`ForecastBadge` (`components/finance/transaction-display-row.tsx`) hoje tem
três estados. A previsão vencida sem par ganha o vermelho "não conciliado",
que significa "exige decisão sua".

Com proposta pendente, a decisão existe e está em outro lugar. O selo passa a
"conciliar?", em âmbar, com link para a fila. O vermelho fica reservado para a
previsão que não tem nem proposta — aquela em que o banco simplesmente não
trouxe nada.

Saldo: nada muda. Previsão nunca entrou em `accounts.balance_cents` (migration
00046) e a vencida sem par também não conta no saldo projetado
(`contaNoSaldoProjetado`). Proposta pendente não move nenhum dos dois.

## 7. Testes

- **Índices** — o par recusado é barrado na reinserção; duas pendentes para a
  mesma previsão ou para o mesmo realizado são barradas.
- **Criador de propostas** — propõe o par que `matchForecast` escolhe; não
  propõe previsão que já tem pendente; não propõe par recusado; não grava
  `matched_transaction_id` (a regressão que este design previne).
- **Aprovar** — grava o vínculo e fecha a proposta na mesma transação; recusa
  decisão de outra org; é idempotente em clique duplo.
- **Recusar** — não toca na previsão; o par não volta na próxima rodada.
- **Fila (RTL)** — mostra os dois lados e o motivo; os dois botões chamam as
  actions certas; fila vazia diz isso.
- **Selo** — proposta pendente mostra "conciliar?" e não o vermelho.

## 8. Fora de escopo

- Aprovar em lote.
- Desfazer uma conciliação já aprovada (hoje também não existe; apagar o
  realizado devolve a previsão ao estado aberto por `ON DELETE SET NULL` da
  00042).
- Reabrir para aprovação os casamentos feitos antes deste deploy.
- Propor casamento entre dois lançamentos do banco, ou entre duas previsões.
