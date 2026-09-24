# Transferência sempre com par — design

**Data:** 2026-09-24
**Estende:** `2026-09-07-counterparty-transfer-account-design.md`

---

## 1. A regra

> Transferência só existe entre contas próprias, e sempre tem par. Sem conta
> própria identificável, o lançamento é receita ou despesa.

A spec de 07/09 já dizia a primeira metade. Esta fecha a segunda: hoje há
`transfer` sem par em três lugares, e nenhum deles concilia saldo.

| Caso | Hoje | Por quê é problema |
|---|---|---|
| Destino é conta Open Finance | Só grava `transfer_account_id` (§4 da spec de 07/09) | As duas pontas nunca se ligam; ninguém sabe se a outra chegou |
| Nível 1 automático (`APLICACAO_FINANCEIRA`, `RESGATE_APLIC_FINANCEIRA`, `TRANSFERENCIA_SALDO_RESERVADO`, cartão `PAGAMENTO_FATURA`) | Confirmado como `transfer` sem conta (`normalize.ts`) | Neutro no fluxo, mas não diz para onde foi |
| Transferências confirmadas antes de 07/09 | `transfer`, `transfer_account_id` nulo (§7 da spec de 07/09) | Idem |

## 2. Princípio de implementação

Nada novo: nenhuma tela, fila, tabela ou heurística. Tudo passa pelos dois
trilhos que já existem:

- **Classificar** (`/transactions/review`, `counterparty-actions.ts`) — onde se
  diz que é transferência e para qual conta.
- **Confirmar previsões** (`/transactions/matches`, `forecast-match-db.ts` +
  `forecast-match-actions.ts`) — onde se casa previsão com realizado.

## 3. Mudanças

### 3.1 Destino Open Finance: a perna vira previsão

`applyTransferSingle` (`counterparty-actions.ts`) e `persistPage` hoje fazem o
fork "destino manual cria perna / destino Open Finance não cria nada". Passa a:

- **Destino manual:** igual a hoje — perna real, saldo aplicado.
- **Destino Open Finance:** cria a perna com `buildTransferLegRow`, mesmo
  `transferGroupId`, **com `balanceApplied: false`** independentemente da
  origem. É uma previsão: não move saldo, porque o saldo da conta de destino
  vem do extrato real dela.

Logo após criar a perna prevista, roda `criarPropostasDeConciliacao` para a
conta de destino: se a ponta real já chegou, a proposta aparece na hora.

### 3.2 Conciliação passa a ver a perna prevista

`criarPropostasDeConciliacao` (`forecast-match-db.ts:136`):

- **Previsões:** hoje exige `recurring_template_id IS NOT NULL`. Passa a aceitar
  também `type = 'transfer' AND transfer_group_id IS NOT NULL` (perna prevista).
- **Realizados:** hoje exige `external_id IS NOT NULL`. A perna prevista também
  tem `external_id` (`<origem>:transfer-dest`, para dedupe), então ela precisa
  ser excluída explicitamente — senão uma perna prevista seria proposta como
  "realizado" de outra previsão. Filtro: `balance_applied = true` ou
  `external_id NOT LIKE '%:transfer-dest'`.

O casamento em si continua sendo `matchForecast`. Transferência tem valor
exato, então cai na faixa estreita sem depender de descrição.

### 3.3 Aprovar par de transferência confirma o realizado

`aprovarProposta` hoje só grava `matched_transaction_id` na previsão. Quando a
previsão é perna de transferência, também atualiza o realizado:

- `type = 'transfer'`, `category_id = NULL`, `review_state = 'confirmed'`,
  `transfer_account_id` = conta da origem.

Sem isso, o realizado continuaria como receita/despesa pendente em
Classificar, e o usuário poderia classificá-lo de novo como transferência —
criando uma segunda perna prevista na conta de origem, que casaria com a
linha real de origem. Pelo mesmo motivo, **Classificar não mostra realizado
que tem proposta pendente contra perna de transferência**: a decisão dele já
está em Confirmar previsões.

Recusar a proposta: igual a hoje. A perna prevista segue aberta.

### 3.4 Nível 1 deixa de pular Classificar

Os quatro casos do nível 1 continuam com a natureza decidida (`transfer`), mas
deixam de sair `confirmed`: entram pendentes em Classificar com natureza já
em Transferência, pedindo só a conta. É o `Select` de conta que já existe.

- **Aplicação/resgate:** a conta escolhida é uma conta `brokerage` (tipo já
  existente). Se for manual, perna real, como qualquer conta manual.
- **Pagamento de fatura:** a conta é a do cartão; do lado do cartão, a conta
  corrente. Os dois lados são Open Finance, então caem em §3.1–3.3.

A contraparte guarda a conta (`counterparties.transfer_account_id`), então a
decisão vale para os próximos da mesma contraparte — é o mesmo mecanismo de
hoje. Quem não tem contraparte identificável (sem `tax_id` nem descrição
estável) pergunta toda vez.

**Risco:** Classificar bloqueia o app (`app/(app)/layout.tsx`). Na primeira
sincronização depois da mudança, aplicações e faturas que antes passavam
direto vão aparecer lá. Depois de confirmada cada contraparte, some. Aceito.

### 3.5 Legado

Migração de dados: toda transação com `type = 'transfer'`,
`transfer_group_id IS NULL` e `external_id IS NOT NULL` (veio do banco) volta
a `review_state = 'pending'`, natureza mantida. Entra em Classificar como os
casos de §3.4 e segue o mesmo caminho. Lançamento manual não é tocado — o
fluxo manual sempre criou par.

### 3.6 OFX

`import-actions.ts` hoje cria perna real na conta de destino. Passa a usar a
mesma decisão de §3.1: destino Open Finance → perna prevista + propostas;
destino manual → perna real. Evita duplicar quando o destino também recebe
extrato.

## 4. O que não muda

- Exclusão: continua apagando as pernas pelo `transfer_group_id`. A perna
  prevista foi criada pelo app; a linha real do outro banco está ligada por
  `matched_transaction_id`, não pelo grupo, e fica intacta.
- Relatórios: transferência continua neutra. Previsão casada já sai do saldo
  projetado (`projected-balance.ts:76`, `balance-sql.ts:80`).
- Aviso de filas, rotas, menu: nada.

## 5. Testes

- `applyTransferSingle`/`persistPage`: destino Open Finance cria perna com
  `balanceApplied: false` e mesmo `transferGroupId`; destino manual igual a hoje.
- `criarPropostasDeConciliacao`: perna prevista entra como previsão; perna
  prevista nunca entra como realizado; real que chega depois gera proposta.
- `aprovarProposta` com perna de transferência: realizado vira `transfer`
  confirmado; com previsão recorrente, comportamento inalterado.
- Classificar não lista realizado com proposta pendente contra perna de transferência.
- `resolveCounterparty`: nível 1 `transfer` passa pela contraparte — sem
  conta confirmada fica pendente; com conta confirmada aplica §3.1.
- Migração: `transfer` sem grupo vindo do banco volta pendente; manual intocado.
- OFX: destino Open Finance cria perna prevista, não real.

## 6. Arquivos

`counterparty-actions.ts`, `persist-page.ts`, `transfer-leg.ts`,
`forecast-match-db.ts`, `forecast-match-actions.ts`, `counterparty-queries.ts`,
`resolve-counterparty.ts`, `import-actions.ts`, `normalize.ts`
(core-finance), uma migration de dados.
