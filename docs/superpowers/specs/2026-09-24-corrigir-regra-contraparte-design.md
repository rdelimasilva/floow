# Corrigir regra de contraparte — design

**Data:** 2026-09-24
**Estende:** `2026-09-04-openfinance-counterparty-review-design.md`,
`2026-09-07-counterparty-transfer-account-design.md`,
`2026-09-24-transferencia-sempre-com-par-design.md`

---

## 1. O problema

Confirmar uma contraparte em Classificar grava uma regra permanente em
`counterparties` (natureza, categoria, conta da transferência). O sync aplica
essa regra a todo lançamento novo com a mesma chave, sem perguntar
(`resolve-counterparty.ts`). Não existe caminho de volta:

- "Já confirmadas" em Classificar é só leitura (`counterparty-queue-client.tsx:331`).
- Transferência não é editável no extrato (`transaction-display-row.tsx:236`,
  `transaction-actions.ts:152`).
- Excluir apaga o grupo inteiro, e o próximo sync repete o erro.

Caso real (org com dados, 08/09): a contraparte-descrição `RESGATE CDB DI`
(entrada, Itaú) e a contraparte `tax_id` do CPF do próprio usuário foram
confirmadas como transferência vinda da XP Corretora, conta manual criada um
minuto antes. Resultado: 13 pernas `:transfer-dest` na XP, saldo
−R$ 72.531,36, e cada novo resgate do CDB do Itaú manda mais uma.

## 2. A regra

> Toda regra confirmada pode ser corrigida. A correção vale daqui pra frente
> e, se o usuário escolher, também para o histórico que a regra classificou.

E, para o CPF do próprio titular:

> Transferência para o próprio CPF nunca vira regra de conta fixa. A conta é
> decidida lançamento a lançamento, com sugestão pelo par.

## 3. Onde

Nenhuma tela, fila ou item de menu novo (mesmo princípio da spec
`transferencia-sempre-com-par` §2).

- **Classificar → "Já confirmadas"**: cada regra ganha "Corrigir", que abre o
  mesmo editor dos grupos pendentes (natureza, categoria, conta).
- **Extrato**: lançamento com `counterparty_id` ganha a ação "Corrigir regra",
  que leva a `/transactions/review?regra=<counterpartyId>` com a regra aberta.
  Exige incluir `counterpartyId` em `TransactionRowData` e no select de
  `getTransactionsWithCount`.

## 4. Corrigir

Action nova `corrigirRegra` em `lib/openfinance/corrigir-regra-actions.ts`:

```ts
corrigirRegra(input: {
  counterpartyId: string
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  transferAccountId: string | null
  aplicarAoHistorico: boolean
}): Promise<{ reprocessados: number; ignorados: number }>
```

E uma query de prévia, `previaCorrecaoDeRegra(counterpartyId, decisão)`, que
devolve o que a action faria: quantos lançamentos mudam, quantos ficam de fora
(com o motivo) e o delta de saldo por conta. A prévia e a action usam a mesma
função de seleção, então os números batem.

### 4.1 Só daqui pra frente (`aplicarAoHistorico = false`)

Atualiza só a linha de `counterparties`. O sync já lê a regra nova e nunca
reaplica regra a lançamento existente (`persist-page.ts:114`), então nenhum
lançamento muda. É o padrão da caixa no editor.

### 4.2 Com histórico

Numa única transação de banco:

1. **Seleciona** os lançamentos da regra que estão diferentes da decisão
   nova: `counterparty_id = X`, `review_state = 'confirmed'` e
   - decisão nova transferência para a conta A: não é `transfer` para A;
   - decisão nova receita/despesa na categoria C: não é esse `type` com C.

   *Revisado em 24/09, depois do uso real:* a versão anterior selecionava
   pelo que a regra dizia no momento. Se ela tinha sido salva antes sem o
   histórico, já apontava para a conta nova, e os lançamentos antigos, que
   ficaram na conta velha, não eram achados. O custo da regra nova: uma
   exceção decidida à mão também entra, e aparece na contagem da prévia.

   Exceção: CPF próprio (transferência sem conta). "Diferente da decisão"
   seria tudo, inclusive o que foi decidido lançamento a lançamento; ali
   continua valendo o que segue a regra atual.
2. **Desfaz** cada selecionado com `desfazerParDaRegra` (§5).
3. **Atualiza** a contraparte com a decisão nova.
4. **Reaplica** com o núcleo do `confirmCounterparty` atual, extraído para
   uma função que recebe `tx` (hoje ele abre a própria transação). Os
   lançamentos desfeitos estão `pending` e entram no lote normal.
5. Depois do commit, `criarPropostasDeConciliacao` para as contas tocadas e
   revalidação, como o `confirmCounterparty` já faz.

Validações iguais às de `confirmCounterparty`: `assertAccountOwnership` na
conta nova, conta nova ≠ conta do lançamento, natureza coerente com
categoria/conta.

## 5. Desfazer

`desfazerParDaRegra(tx, orgId, lancamentoId)` em
`lib/openfinance/desfazer-par.ts`. Devolve o lançamento original a
`review_state = 'pending'`, sem `transfer_group_id` e sem
`transfer_account_id`. O saldo do próprio lançamento não muda: é dinheiro
real do banco, e o valor com sinal é o mesmo em qualquer natureza.

| Forma | Como reconhecer | O que faz |
|---|---|---|
| 1. Perna real (destino manual) | outra linha do grupo com `external_id` terminando em `:transfer-dest` | se `balance_applied && !is_ignored`, estorna `-amount_cents` da outra conta; apaga a perna |
| 2. Perna prevista (destino Open Finance) | outra linha do grupo terminando em `:transfer-par` | se `matched_transaction_id` preenchido, o realizado do outro banco volta a `pending` (`transfer`, sem conta) — o par dele foi consequência desta regra; apaga a perna (as propostas caem por CASCADE, 00047) |
| 3. Ponta esperada de par do outro lado | sem grupo; uma perna prevista de outra conta tem `matched_transaction_id` = este lançamento, ou proposta pendente contra ele | **não reprocessa.** O par foi decidido pela regra da outra conta. A prévia lista como "segue o par da conta X; corrija por lá" |

Regra antiga receita/despesa: nada a desfazer além de voltar a `pending`.

O `external_id` derivado (`:transfer-dest`/`:transfer-par`) só é recriado
depois que a perna antiga foi apagada, na mesma transação. Assim o índice
único `(external_id, account_id)` não colide.

## 6. CPF próprio

### 6.1 Detecção

`lib/openfinance/cpf-proprio.ts`: `carregarHashesDoTitular(db, orgId)` lê os
`openfinance_connections.cpf_hash` da org, e
`ehCpfProprio(taxId, hashes)` compara com `hashCpf(taxId, getCpfSalt())`.
O sync não precisa deles: como a regra do titular nunca grava conta, o
`resolveCounterparty` atual já a deixa pendente. Os hashes são lidos só ao
confirmar/corrigir uma regra e ao montar a fila de Classificar.

### 6.2 Comportamento

- `confirmCounterparty`/`corrigirRegra` numa contraparte de CPF próprio aplicam
  a decisão aos lançamentos escolhidos, mas gravam na contraparte
  `nature = 'transfer'` com `transfer_account_id = null`.
- `resolveCounterparty` já devolve `pending` para transferência confirmada sem
  conta (`resolve-counterparty.ts:193`). Cada novo Pix/TED para o próprio CPF
  cai em Classificar como Transferência, sem mudança no sync.
- Em Classificar, o grupo do CPF próprio não tem conta de grupo: a conta é
  escolhida por lançamento (os `itemOverrides` que já existem).
- **Sugestão:** para cada lançamento pendente do CPF próprio,
  `getPendingCounterpartyGroups` procura em outra conta da org um lançamento
  de sinal oposto, mesmo `amount_cents` em módulo, data a até 3 dias, ainda
  sem par. Se achar exatamente um, a conta vem pré-selecionada.

### 6.3 Migração

Migration que zera `transfer_account_id` das contrapartes `tax_id` de CPF
próprio. Como o hash depende do salt da aplicação, a migração é um script
(`scripts/`), não SQL puro: lê as contrapartes `tax_id` com
`nature = 'transfer'`, calcula o hash e atualiza as que batem. Lançamentos
existentes não são tocados; o histórico se corrige pela §4.2.

### 6.4 Custo aceito

Pix para o próprio CPF passa a entrar em Classificar, cuja fila bloqueia o
app. É o mesmo risco aceito na spec `transferencia-sempre-com-par`. A sugestão
pelo par reduz a decisão a um clique.

## 7. Aviso de descrição genérica

No editor de Classificar, ao escolher Transferência numa contraparte com
`key_type = 'description'`: *"Vale para todo lançamento com o texto
'RESGATE CDB DI' nesta conta."* É só informativo e não bloqueia.

## 8. Fora do escopo

- Coluna de override manual em `transactions` (a divergência da regra basta).
- Reprocessar a forma 3 automaticamente.
- Casamento automático de Pix entre contas próprias sem confirmação.
- Corrigir a XP por SQL: com esta feature, a correção é feita pela tela.

## 9. Testes

Vitest, no padrão de `apps/web/__tests__/openfinance/`.

- `desfazerParDaRegra`:
  - forma 1: estorna só se `balance_applied && !is_ignored` e apaga a perna;
  - forma 2: apaga a perna, a proposta cai e o realizado conciliado volta a
    `pending`;
  - forma 3: intocado.
- `corrigirRegra`:
  - só futuro: nenhum lançamento muda;
  - com histórico: desfaz e reaplica; a exceção (divergente) é preservada;
  - prévia e action dão os mesmos números;
  - conta de outra org é recusada.
- CPF próprio:
  - detecta pelo hash;
  - a contraparte nunca grava conta;
  - a sugestão acha o par em ±3 dias e não sugere quando há dois candidatos.
- Caso real: 13 lançamentos na XP (9 pela descrição, 4 pelo CPF) → corrigir
  com histórico → saldo da XP em 0.
