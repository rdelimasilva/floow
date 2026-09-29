# Conciliação única: o extrato é a verdade — design

**Data:** 2026-09-28
**Substitui em parte:** §3.1–3.3 de `2026-09-24-transferencia-sempre-com-par-design.md`
(a perna de transferência deixa de ir para a fila)
**Mantém:** `2026-09-21-forecast-match-approval-gate-design.md` para previsões
de recorrência

---

## 1. O problema

Em 28/09 duas transferências Itaú → Nubank (R$ 200 em 18/09, R$ 123 em 01/09)
pesaram duas vezes no saldo do Nubank. Quando o sync do Itaú rodou, o Nubank
ainda era conta manual: nasceu a perna real `…:transfer-dest`, já somada no
saldo. Em 24/09 o Nubank foi conectado ao Open Finance, e o primeiro sync com
extrato (a partir de 01/01/2026) trouxe as mesmas entradas pelo lado do
Nubank. Nada liga uma à outra — o próprio `transfer-leg.ts` já registrava a
brecha ("podem conviver como duas linhas distintas").

É o terceiro caminho diferente de duplicata em duas semanas (16/09: a Polp
reemitiu a fatura com outro id). A causa é estrutural:

- **16 pontos** gravam em `transactions`. A única proteção comum é o índice
  `(external_id, account_id)`, que não vale para linha sem `external_id`
  (manual, perna manual, recorrência, arquivo sem FITID).
- **Cinco rotinas** casam lançamentos, cada uma com sua regra: parcelas
  previstas, perna prevista aberta, conciliação de previsões, detector de
  duplicata e o próprio índice.
- A decisão "esta linha conta no saldo?" é tomada **uma vez, quando a linha
  nasce**. Se a conta muda de natureza depois (manual → Open Finance), a
  decisão fica velha.

Quem paga é o usuário, que teria que achar e excluir a cópia.

## 2. A regra

> Numa conta Open Finance, só o extrato daquela conta move o saldo. Todo o
> resto que entra nela aguarda o extrato, e o extrato, quando chega, absorve.

Consequências:

- **Linha provisória nunca mexe no saldo.** Por isso absorvê-la
  automaticamente é seguro: um casamento errado troca uma etiqueta, nunca o
  saldo. É o oposto do caso de 21/09, em que casar errado escondia dinheiro
  de verdade — lá a aprovação continua.
- **O usuário não exclui duplicata.** Ou o motor absorve, ou pergunta na fila
  quando há ambiguidade real.
- **Um lugar só decide.** Caminho novo de entrada chama o motor; não traz
  regra de dedupe própria.

## 3. Mudanças

### 3.1 Origem explícita e marca `aguarda_extrato`

Hoje não há como saber, olhando a linha, de onde ela veio: FITID de arquivo e
id da Polp moram na mesma coluna, e `polp_type` nem sempre vem. O motor
precisa dessa resposta, e adivinhar pelo formato do id é o tipo de remendo
que esta spec existe para acabar.

Migration `00067_origem_e_aguarda_extrato.sql`:

```sql
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS origem text
    CHECK (origem IN ('extrato', 'manual', 'arquivo', 'perna',
                      'recorrencia', 'ajuste', 'investimento', 'parcela_prevista'));
-- backfill (abaixo), depois:
ALTER TABLE public.transactions ALTER COLUMN origem SET NOT NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS aguarda_extrato boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_aguarda_extrato
  ON public.transactions (account_id, date)
  WHERE aguarda_extrato AND matched_transaction_id IS NULL;
```

**`origem` é NOT NULL sem default, de propósito.** O tipo do drizzle passa a
exigir o campo em todo `insert(transactions)`: um caminho de entrada novo não
compila sem declarar de onde vem, e o motor nunca recebe linha sem origem.
Os 16 pontos de hoje passam a informá-la.

Backfill, uma vez, na própria migration, na ordem:

| Condição | origem |
|---|---|
| `external_id` termina em `:transfer-dest` ou `:transfer-par`, ou perna de transferência manual (`transfer_group_id` e sem `external_id`) | `perna` |
| `recurring_template_id` não nulo | `recorrencia` |
| `is_installment_forecast` | `parcela_prevista` |
| `affects_cash_flow = false` e descrição `Ajuste de saldo` | `ajuste` |
| conta de investimento sem `external_id` | `investimento` |
| `external_id` não nulo e conta com `openfinance_resources` | `extrato` se o id é UUIDv7, senão `arquivo` |
| `external_id` não nulo, conta sem recurso OF | `arquivo` |
| resto | `manual` |

O backfill usa o formato do id **só aqui, uma vez**, sobre dado já parado;
daqui em diante a origem é declarada por quem grava. O `--dry-run` do legado
(§3.6) imprime a contagem por origem para conferência antes de rodar.

Invariante: `aguarda_extrato = true` ⇒ `balance_applied = false`.

Recebe a marca, **somente em conta Open Finance viva** (`isOpenFinanceLinkedAccount`):

| Origem | Hoje | Passa a |
|---|---|---|
| Lançamento manual (`createTransaction`, perna manual de `updateTransaction`) | soma no saldo | `aguarda_extrato`, `balance_applied = false` |
| Perna de transferência para conta OF (`:transfer-par`) | previsão, vai para a fila | `aguarda_extrato`, absorvida sozinha (§3.3) |
| Linha de arquivo OFX/CSV importada em conta OF | soma no saldo | `aguarda_extrato` |

Não recebe: linha do extrato OF da própria conta, ajuste de saldo
(`adjustAccountBalance` — é correção explícita do usuário), previsão de
recorrência (já é previsão e segue a regra de 21/09), parcela prevista de
cartão (já tem casamento próprio em `ocuparPrevisao`).

Em conta manual nada muda.

**Selo na lista:** linha com `aguarda_extrato` e sem vínculo mostra
"aguardando o banco". Sem fila nova, sem item de menu.

### 3.2 Conta vira Open Finance: reclassificar o que já existe

Quando um recurso passa a `AVAILABLE` com `account_id` (vínculo novo ou
retomada de `TEMPORARILY_UNAVAILABLE`), antes do primeiro `persistPage`:

1. Linhas da conta com `date >= sync_from_date` e
   `origem IN ('manual', 'arquivo', 'perna')`:
   - estorna do `balance_cents` o que tinham aplicado;
   - grava `aguarda_extrato = true`, `balance_applied = false`.
2. Idempotente: roda de novo sem efeito (só pega linha com
   `aguarda_extrato = false`).

Antes de `sync_from_date` nada muda: o extrato não vai cobrir esse período,
então essas linhas continuam sendo a única representação do fato.

É isto que resolve o caso de 28/09.

### 3.3 O motor: `conciliarConta(db, orgId, accountId)`

Novo módulo `apps/web/lib/finance/conciliacao/`, com a regra pura em
`packages/core-finance/src/conciliacao/`. Roda ao fim de todo caminho que
grava em conta OF: sync do recurso, importação de arquivo, lançamento manual,
criação de perna de transferência. Substitui as chamadas soltas de
`criarPropostasDeConciliacao` e `criarPropostasDeDuplicata` no `sync.ts`.

Aplica, em ordem:

**R1 — Extrato × aguardando (automático).**
Candidato: linha `origem = 'extrato'` da conta (não ignorada, sem vínculo)
contra linha `aguarda_extrato` sem vínculo, com:

- mesmo `amount_cents` exato;
- datas a no máximo 3 dias;
- contraparte compatível (mesma regra de `contrapartesCompativeis`: só
  derruba se os dois lados declaram e discordam).

Se o par é **único dos dois lados** (o extrato tem um só aguardando
compatível e vice-versa), absorve:

- grava `matched_transaction_id` na provisória (o mesmo vínculo de hoje,
  desfeito pelo `desconciliar` que já existe);
- **perna de transferência:** o extrato vira a ponta da transferência — o
  mesmo efeito de `aprovarProposta` para `:transfer-par` (§3.3 da spec de
  24/09): `type = 'transfer'`, `category_id = NULL`,
  `review_state = 'confirmed'`, `transfer_account_id` = conta de origem,
  `transfer_group_id` da perna;
- **manual ou arquivo:** o extrato herda o que o usuário decidiu —
  `category_id` e `description` da provisória, `review_state = 'confirmed'`
  — só se o extrato ainda está pendente de classificação. Se já foi
  classificado, fica como está.

Mais de um candidato de qualquer lado: não escolhe. Grava proposta em
`forecast_match_proposals` e o usuário decide em "Confirmar previsões", como
hoje.

**R2 — Extrato × extrato (proposta).**
O detector de duplicata de hoje (`detectarDuplicatas`), sem mudança de
critério, mais uma correção: `emitidoEm` ignora o sufixo (`:transfer-dest`
etc.) antes de ler o UUIDv7, em vez de devolver `null` e calar.

**R3 — Previsão de recorrência × extrato (proposta).**
`matchForecast` como hoje, restrito a previsão de template. A perna
`:transfer-par` sai daqui: agora é R1.

R1 roda antes de R3 para que uma linha do extrato absorvida por uma perna
não seja proposta também contra uma recorrência.

**Concorrência:** o motor pega `pg_advisory_xact_lock` por conta, como
`completarParcelas`. Dois syncs simultâneos da mesma conta não absorvem a
mesma linha duas vezes; o vínculo usa UPDATE condicional
(`matched_transaction_id IS NULL`).

### 3.4 Provisória que o banco nunca confirma

Sem regra automática. Continua visível com o selo "aguardando o banco" e fora
do saldo; o usuário pode excluí-la ou ignorá-la como qualquer lançamento.
Uma regra de expiração seria adivinhação — lançamento manual com data futura
é legítimo.

### 3.5 Auditor diário

Cron `apps/web/app/api/cron/auditar-conciliacao/route.ts`, registrado em
`apps/web/vercel.json` (o da raiz é ignorado). Read-only. Procura:

1. **Par que move saldo:** em conta OF, duas linhas com
   `balance_applied = true`, mesmo valor, datas a até 3 dias, e ao menos uma
   com `origem <> 'extrato'` a partir de `sync_from_date`. Pela regra do §2
   isso não deveria existir.
2. **Divergência de saldo:** conta OF cujo `balance_cents` difere de
   `bank_balance_cents` em mais de R$ 1,00 com `bank_balance_at` de até 48h
   (reaproveita `compararComOBanco`).
3. **Invariante quebrado:** `aguarda_extrato = true` com
   `balance_applied = true`.

Envia ao Sentry um evento por tipo de achado, com contagens e ids de conta —
sem descrição de lançamento nem nome. Não corrige nada: achado é bug no
motor, e o conserto vai no motor.

### 3.6 Legado

Script único, `scripts/conciliacao-legado.mjs`, com modo `--dry-run`
(padrão) que imprime o que faria:

1. aplica §3.2 em toda conta OF viva;
2. roda `conciliarConta` em cada uma.

Converte as `:transfer-par` hoje pendentes em `forecast_match_proposals` para
R1: propostas pendentes de perna de transferência são apagadas e o motor
decide de novo (absorve ou recria a proposta se ambíguo).

Resultado esperado no caso de 28/09: as duas `:transfer-dest` do Nubank viram
aguardando, estornam R$ 323,00, e são absorvidas pelas linhas do extrato de
18/09 e 01/09.

## 4. O que não muda

- Índice `(external_id, account_id)` e `onConflictDoNothing` na ingestão.
- Conta manual: tudo como hoje, inclusive a perna `:transfer-dest` real.
- Previsão de recorrência: segue pedindo aprovação (21/09).
- Parcelas previstas do cartão: `ocuparPrevisao` e `completarParcelas`.
- Duplicata extrato × extrato: segue proposta.
- Filas e menu: nenhuma tela nova.

## 5. Testes

Regra pura (`core-finance`), sem banco:

- R1 absorve par único; não absorve com dois candidatos de qualquer lado;
  respeita valor exato, janela de 3 dias e contraparte discordante.
- R2: `emitidoEm` lê UUIDv7 com sufixo.
- Ordem R1 → R3.

Com banco real e rollback (os testes de unidade mockam o banco e não pegam
CHECK nem índice — ver memória do projeto):

- Reproduzir o caso de 28/09: conta manual com `:transfer-dest`, vínculo OF,
  sync com as linhas reais → um lançamento por fato, saldo igual ao do banco.
- Manual em conta OF: não mexe no saldo; extrato chega → uma linha, com a
  categoria do usuário.
- Dois syncs simultâneos: nenhuma absorção dupla.
- Legado em `--dry-run` contra a base: lista exatamente os dois pares do
  Nubank e nenhum outro inesperado (os demais achados são revisados à mão
  antes de rodar de verdade).

## 6. Arquivos

Novos:

- `supabase/migrations/00067_origem_e_aguarda_extrato.sql`
- `packages/core-finance/src/conciliacao/{regras.ts,index.ts}` + testes
- `apps/web/lib/finance/conciliacao/{conciliar-conta.ts,reclassificar-conta.ts}`
- `apps/web/app/api/cron/auditar-conciliacao/route.ts`
- `scripts/conciliacao-legado.mjs`

Alterados:

- `packages/db/src/schema/finance.ts` — colunas novas
- Os 16 pontos de `insert(transactions)` — passam a declarar `origem` (o
  compilador aponta os que faltarem)
- `apps/web/lib/openfinance/sync.ts` — `reclassificarConta` antes do
  primeiro `persistPage` de recurso recém-vinculado; `conciliarConta` no
  lugar das duas chamadas soltas
- `apps/web/lib/openfinance/transfer-leg.ts` — perna para OF nasce com
  `aguarda_extrato`
- `apps/web/lib/finance/transaction-create-actions.ts`,
  `transaction-actions.ts` — manual em conta OF nasce aguardando e chama o
  motor
- `apps/web/lib/finance/import-actions.ts`, `import-transfer.ts` — idem para
  arquivo (`import-actions.ts` está em 491 linhas: a chamada ao motor entra
  num módulo à parte para não passar de 500)
- `apps/web/lib/finance/forecast-match-db.ts` — `:transfer-par` sai do
  escopo de R3
- `packages/core-finance/src/openfinance/duplicata.ts` — `emitidoEm` com
  sufixo
- `apps/web/vercel.json` — cron do auditor
- Lista de lançamentos — selo "aguardando o banco"
