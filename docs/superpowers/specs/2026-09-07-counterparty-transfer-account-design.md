# Transferência com conta de destino — design

**Data:** 2026-09-07
**Estende:** `docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md`

---

## 1. O problema

A fila de contrapartes (spec de 04/09) deixa marcar um lançamento ou uma
contraparte inteira como `nature = 'transfer'`. O único efeito disso hoje —
em `confirmCounterparty` e, pra frente, em `resolveCounterparty` — é:

```
type = 'transfer', category_id = NULL
```

Nenhuma conta de destino é perguntada, nada é linkado. Isso diverge do resto
do app: `createTransaction` e `createRecurringTemplate` (`lib/finance/
actions.ts`) tratam transferência como operação de duas pernas — exigem
`destinationAccountId`, criam duas linhas com `transferGroupId` em comum,
amount invertido, saldo das duas contas atualizado. Uma "transferência" sem
conta de destino não transfere nada: só tira o lançamento das somas de
receita/despesa, sem dizer pra onde o dinheiro foi.

## 2. Princípio

> Só existe um tipo de transferência: entre contas do próprio usuário.
> Qualquer outro caso é receita ou despesa — não existe transferência pra
> terceiro.

Consequência direta: marcar `nature = transfer` sem dizer qual conta própria
recebeu o dinheiro deixa de ser uma opção válida. A conta é o que torna a
classificação uma transferência, não um detalhe opcional dela.

## 3. Dado novo

`counterparties` ganha `transfer_account_id uuid nullable, fk accounts`.

Validação (substitui a regra atual "`transfer` ⟺ `category_id` nulo"):

- `nature = 'transfer'` ⟹ `category_id IS NULL` **e** `transfer_account_id IS
  NOT NULL`.
- `nature ∈ {income, expense}` ⟹ `category_id IS NOT NULL` **e**
  `transfer_account_id IS NULL`.

Mesma regra vale pra exceção por lançamento (`counterparty-actions.ts`,
adicionado em 06/09): cada exceção com `nature = 'transfer'` carrega sua
própria `transferAccountId`, independente da conta do padrão do grupo — o
racional de exceção já é "isso aqui é diferente do resto", inclusive na
conta.

## 4. O que acontece ao confirmar, por tipo de conta de destino

A conta escolhida pode ou não estar ligada ao Open Finance
(`openfinance_resources.account_id = conta`). O comportamento diverge:

**Destino é conta manual (sem `openfinance_resources`):** cria a segunda
perna, mesmo shape que `createTransaction` já produz — `transferGroupId`
novo, uma linha na conta de destino com `amountCents` invertido, mesma data,
`type = 'transfer'`, `categoryId = null`, `reviewState = 'confirmed'`,
`balanceApplied` seguindo a mesma regra de data-passada que `sync.ts` usa
hoje. O saldo da conta de destino é atualizado.

**Destino é conta Open Finance:** só grava `transferAccountId` no
lançamento de origem. Não cria segunda linha. A outra ponta do Pix chega
sozinha pela sincronização daquela conta — com sua própria contraparte,
confirmada separadamente. As duas pontas **não são linkadas
automaticamente** (a spec de 04/09 já rejeitou heurística de casamento por
valor+data — mesmo princípio se aplica aqui). Isso é limitação conhecida,
registrada aqui, não bug: o usuário vê "transferência pra Nubank" dos dois
lados, mas o app não sabe que são o mesmo evento.

A UI não filtra a lista de contas por esse critério — mostra todas as
contas ativas da org, o fork acima é decidido no backend, invisível pro
usuário.

## 5. Retroativo e pra frente

Confirmação de contraparte já vale nos dois sentidos pra natureza/categoria
(spec de 04/09, §1): lançamentos pendentes hoje reclassificam na hora, e a
próxima sincronização aplica sozinha via `resolveCounterparty`. Transferência
com conta segue a mesma garantia — dois pontos de mudança:

**`confirmCounterparty`** (retroativo): o UPDATE em lote e o UPDATE por
exceção (feature de 06/09) passam a, quando a natureza final for `transfer`,
rodar a lógica do §4 pra cada lançamento afetado — o fork por lançamento
importa porque o lote pode conter o quê já tem `transferAccountId` só como
metadado e o quê precisa da segunda perna.

**`resolveCounterparty` + `sync.ts`** (pra frente): quando uma contraparte
confirmada com `nature = transfer` resolve um lançamento novo durante a
sincronização, `persistPage` precisa, além de inserir a linha de origem
(como já faz), decidir o fork do §4 pra ela. A segunda perna sintética, se
houver, precisa de dedupe idempotente — sync roda de novo em retry e não
pode duplicar. Solução: `external_id` derivado deterministicamente do
original (`${externalId}:transfer-dest`), reaproveitando o índice único
`(external_id, account_id)` que já protege o resto da ingestão — mesma
garantia, sem mecanismo novo. O saldo da conta de destino precisa do mesmo
tratamento de `realDelta` que `persistPage` já faz pra conta de origem, mas
por conta — se uma página tiver pernas de destino em contas diferentes,
agrupa por `accountId` antes de somar.

## 6. UI

Grupo e exceção por lançamento (`counterparty-queue-client.tsx` +
`counterparty-item-row.tsx`): quando a natureza escolhida é `Transferência`,
o `Select` de categoria (hoje escondido nesse caso) vira um `Select` de
conta de destino — mesma posição, mesmo padrão visual, lista vinda de
`getAccounts`, todas as contas ativas da org.

Sem filtro na lista: uma contraparte por `tax_id` (accountId nulo na chave,
§4 da spec de 04/09) pode agrupar lançamentos de contas de origem
diferentes — não existe "a conta do grupo" pra excluir do Select. A
transferência-pra-si-mesma (`transferAccountId` igual ao `accountId` do
próprio lançamento) é bloqueada na validação de `confirmCounterparty`, por
lançamento, não filtrando a lista.

Contraparte já confirmada como transferência: a seção "Já confirmadas" (só
leitura hoje) ganha o nome da conta de destino ao lado da natureza, pro
usuário conferir sem abrir o banco.

## 7. O que isso não faz

- Não linka automaticamente as duas pontas quando ambas as contas são Open
  Finance — cada lado se confirma independente.
- Não permite transferência pra conta de outra org/terceiro — `assertAccountOwnership`
  já bloqueia isso no fluxo manual, mesma cerca aqui.
- Não migra transferências já confirmadas sem conta antes desta mudança —
  ficam como estão (`transferAccountId = null`), sem segunda perna
  retroativa. Não há como saber qual conta foi sem perguntar de novo.

## 8. Testes

- Validação: `transfer` sem `transferAccountId` rejeita; `income`/`expense`
  com `transferAccountId` preenchido rejeita; `transferAccountId` igual ao
  `accountId` do próprio lançamento rejeita (transferência pra si mesma).
- `confirmCounterparty` — destino manual cria segunda linha com
  `transferGroupId` e atualiza saldo da conta de destino; destino Open
  Finance só grava `transferAccountId`, sem segunda linha; exceção com conta
  própria diferente da do grupo.
- `resolveCounterparty`/`sync.ts` — contraparte confirmada como transfer
  aplica o fork do §4 em lançamento novo; retry do mesmo sync não duplica a
  perna de destino (dedupe por `external_id` derivado); saldo da conta de
  destino soma certo quando a página tem pernas de destino em mais de uma
  conta.
- Migração de schema: coluna nova, índice se necessário, sem quebrar linhas
  existentes (`transfer_account_id` nasce nulo).

## 9. Migração

1. `supabase/migrations` — `transfer_account_id` em `counterparties`.
2. `counterparty-actions.ts` — schema (`transferAccountId` obrigatório
   quando `nature = transfer`, exceção incluída) + lógica do fork do §4.
3. `resolve-counterparty.ts` — `CounterpartyRecord`/`ResolvedTransaction`
   carregam `transferAccountId`.
4. `sync.ts` (`persistPage`) — segunda perna idempotente + saldo por conta
   de destino.
5. `counterparty-queue-client.tsx` + `counterparty-item-row.tsx` — Select de
   conta no lugar do Select de categoria quando a natureza é transferência.
6. Testes de cada passo acima.
