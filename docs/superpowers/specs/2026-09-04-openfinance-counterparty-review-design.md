# Fila de revisão por contraparte — design

**Data:** 2026-09-04
**Substitui:** `docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md`
**Spec da ingestão:** `docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md`

---

## 1. Por que o design anterior não se sustenta

A spec de 2026-09-03 tentava consertar a natureza errada detectando *depois* da
ingestão, por padrão de texto. Rodado contra o extrato real da produção, o
detector chegou a marcar **30 grupos, R$ 537.157,54 — 81% de toda despesa da
conta** como possível não-gasto, e ao mesmo tempo o `category_ref` da Polp
deixava **R$ 1.175.814,15 de entradas (86% do que entrou em 13 meses)**
classificadas como transferência, incluindo a folha de pagamento mensal do
usuário (`ENTRADA SOMA COOPERATIVA…`, R$ 387.841,00 em 20 lançamentos).

Três correções sucessivas no detector (continência em vez de tokens em comum;
direção do dinheiro; nenhuma terceira tentativa chegou a threshold funcional)
reduziram para 9 grupos, R$ 306.153,43 — e mesmo assim o problema de fundo
continuava: **nenhum campo que a Polp manda determina a natureza de uma
transação com confiança**. `category_ref` é a própria Polp adivinhando (`PIX`
cai em `INCOME_CONTRACTOR` 38 vezes e em `TRANSFER_IN_OTHER_TRANSFER_IN` 49
vezes, no mesmo extrato). O `type` estruturado do Banco Central (99,6% dos
lançamentos já gravados o têm `null`, mas confirmado presente em 629/629 ao
rebuscar a API diretamente) descreve o **canal** — PIX, TED, débito automático
— não a natureza.

Continuar ajustando limiares de detecção de texto é dar murro em ponta de
faca: qualquer heurística sobre descrição vai errar em algum extrato de algum
banco. O que a Polp manda que **é** confiável é `partie_cnpj_cpf` /
`counterparty.tax_id` — identidade jurídica da contraparte, presente em 84%
dos lançamentos de conta e 53% dos de cartão. Este design substitui detecção
por identidade: a primeira vez que uma contraparte aparece, o usuário decide;
dali em diante, o floow lembra.

---

## 2. Princípio

> Automação de conciliação pode existir, mas todo lançamento passa por revisão
> manual na primeira vez em que a contraparte aparece. Da segunda vez em
> diante, concilia por semelhança e aprovação histórica.

Nenhuma automação infere natureza a partir de vocabulário, categoria ou
formato de texto. As únicas duas fontes de verdade são:

1. **Sinal estrutural do Banco Central** — quando o próprio regulador já
   classifica a operação (aplicação, resgate, estorno, cashback), sem
   depender de quem é a contraparte.
2. **Decisão do usuário, por contraparte**, gravada uma vez e reaplicada.

---

## 3. Arquitetura: dois níveis, em ordem de certeza

### Nível 1 — sinal estrutural do Banco Central (confirmado, sem fila)

Continuam decidindo sozinhos porque descrevem a natureza da própria operação,
não quem é a contraparte:

| Fonte | Valor | Natureza |
|---|---|---|
| `AccountTransactionType` | `APLICACAO_FINANCEIRA`, `RESGATE_APLIC_FINANCEIRA`, `TRANSFERENCIA_SALDO_RESERVADO` | `transfer` |
| `AccountTransactionType` | `RENDIMENTO_APLIC_FINANCEIRA` | `income` |
| `CreditCardTransactionType` | `PAGAMENTO_FATURA` | `transfer` |
| `CreditCardTransactionType` | `ESTORNO` | `expense` (negativo, abate a categoria) |
| `CreditCardTransactionType` | `CASHBACK` | `income` |
| Estrutural (novo) | débito de cartão, direção `DEBITO`, fora dos três casos acima | `expense` |

A última linha é nova neste design: um cartão de crédito não recebe salário
nem Pix — um débito que não é fatura paga, estorno nem cashback só pode ser
compra. Isso não é inferência sobre o comerciante, é o que a conta *é*.
Medido: 108 das 112 transações de cartão da produção resolvem aqui, sem fila.

Categoria continua vindo de `category_ref`/MCC como hoje — nunca foi a parte
disputada (94% de cobertura, 62 de 1045 lançamentos sem categoria). Nature de
`transfer` não carrega categoria (dinheiro só mudou de lugar).

### Nível 2 — identidade da contraparte (a fila)

Tudo que não resolve no Nível 1. A chave de identidade:

- **`tax_id`** — de `partie_cnpj_cpf` (conta) ou `counterparty.tax_id`
  (cartão). Mesmo espaço de valores nos dois; a Polp manda CNPJ/CPF puro nos
  dois casos.
- **`description`** — `foldForRuleMatch(transaction_name)` (a mesma
  normalização que `nature-rules.ts` já usa para regra `contains`), escopada
  à conta, só quando não há `tax_id`. É como pagamento de fatura e resgate
  batido pela boca do próprio banco se identificam.

Em ambos os casos, a chave inclui **direção** (`credit_debit_type`). A Unimed
cobrando a mensalidade e a Unimed devolvendo um reembolso são a mesma pessoa
jurídica e naturezas opostas — foi o falso positivo mais caro do detector
antigo (R$ 35.818,91 de mensalidade legítima marcada por 8 reembolsos de R$
243 a R$ 690).

Contraparte desconhecida → nasce **pendente**: `nature = null`, `category_id =
null`, o lançamento entra com um `type` placeholder (`credit_debit_type ==
CREDITO ? income : expense` — nunca `transfer`, direção sozinha não sugere
isso) usado só para o ícone de seta, nunca somado em lugar nenhum. Contraparte
já confirmada → aplica a decisão gravada.

---

## 4. Modelo de dados

### Tabela nova `counterparties`

| coluna | tipo | |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid, fk `orgs` | |
| `key_type` | enum `tax_id` \| `description` | |
| `key_value` | text | CNPJ/CPF só dígitos, ou descrição normalizada |
| `direction` | enum `in` \| `out` | |
| `account_id` | uuid nullable, fk `accounts` | nulo para `tax_id` (mesma entidade em qualquer conta); obrigatório para `description` (vocabulário daquele banco) |
| `nature` | enum `income`\|`expense`\|`transfer`, nullable | nulo enquanto pendente |
| `category_id` | uuid nullable, fk `categories` | |
| `display_name` | text | nome que a Polp mandou, para a fila mostrar |
| `confirmed_at` | timestamptz nullable | |
| `confirmed_by` | uuid nullable, fk `profiles` | |
| `created_at`, `updated_at` | timestamptz | |

Único em `(org_id, key_type, key_value, direction, account_id)` — mas `NULL <>
NULL` num índice único deixaria duas contrapartes `tax_id` idênticas
(`account_id` nulo nas duas) coexistirem sem colidir, o mesmo escape que a
migration 00034 já documentou para `transaction_nature_rules`. Precisa de dois
índices únicos parciais: um para `account_id IS NULL` (escopo `tax_id`), outro
para `account_id IS NOT NULL` (escopo `description`).

Índice em `(org_id, review_state)` — usado pela contagem do portão (§7) e por
todo agregador que filtra `review_state = 'confirmed'` (§10).

### `transactions` ganha 4 colunas

- `counterparty_id` — fk nullable.
- `counterparty_tax_id`, `counterparty_name` — snapshot do momento da
  ingestão. Necessário porque o re-sync sobrescreve `description`; sem o
  snapshot, a trilha de por que um lançamento foi classificado assim se apaga
  sozinha na sincronização seguinte.
- `review_state` — enum `confirmed` \| `pending`. **Gravado, não derivado** de
  `counterparties.confirmed_at is null`: derivar custaria um join em cada
  agregador; gravado, o filtro é uma coluna, e o único lugar que pode
  divergir é a própria ação de confirmar (atualização atômica, ver §6).
  Lançamento manual, OFX e CSV nascem `confirmed` — nunca passam pela fila.

### O que sai

- `transaction_nature_rules` — as 3 linhas de produção migram para
  `counterparties` como `key_type = 'description'` já confirmadas (categoria
  por `category_ref` best-effort); a tabela é derrubada.
- `category_rules` **permanece intacta** — serve lançamento manual, OFX e CSV,
  nunca foi a parte quebrada.

---

## 5. Fluxo de ingestão

Por página de transações vinda da Polp:

1. Normaliza (valor, data, descrição) sem decidir natureza — `normalize.ts`
   deixa de chamar `kindForRef` como fallback e de receber
   `creditCardConnected`.
2. Nível 1: os 6 casos da tabela acima resolvem e saem do fluxo,
   `review_state = confirmed`, sem contraparte.
3. Nível 2: extrai a chave (tax_id+direção, ou descrição+direção+conta),
   busca em lote em `counterparties` (uma consulta por página, não uma por
   lançamento). Achou confirmada → aplica natureza e categoria. Não achou →
   cria a contraparte pendente (`onConflictDoNothing`, protege contra duas
   páginas com a mesma contraparte nova) e o lançamento nasce pendente.
4. Persiste por `external_id` como hoje.

**Re-sync não reabre isto.** O caminho de `UPDATE` por `external_id`
já existente só toca campo de enriquecimento (descrição, categoria da Polp,
MCC, datas de fatura) e nunca `type`/valor/data/`review_state`/contraparte —
mesma garantia que já protege o saldo. Natureza e categoria de contraparte só
mudam pela ação de confirmar, explícita e retroativa.

### O que é retirado

`kindForRef(category_ref)` como fallback de natureza; `isCardBillPayment &&
creditCardConnected`; `hasLinkedCreditCard`; o parâmetro `creditCardConnected`
do normalizador; `applyNatureRules`; a tabela `transaction_nature_rules`; e o
subsistema de detecção inteiro — `nature-suspects.ts`, `nature-queries.ts`,
`nature-review-panel.tsx`, `nature-suspects-banner.tsx`,
`nature-suspects-boundary.tsx`, `nature-suspects-section.tsx`,
`nature-shortcut-dialog.tsx`, e os testes correspondentes. O pagamento de
fatura sem `category_ref` de fatura (o caso que motivou a spec anterior) passa
a ser perguntado uma vez, como qualquer outra contraparte — não precisa mais
de tratamento especial.

---

## 6. A fila — interface e ação de confirmar

Página própria (não modal — é um backlog durável, não algo recalculado a cada
carregamento), ordenada por soma em módulo, maior primeiro. Cada linha: nome
que a Polp mandou, CNPJ ou "lançamento do próprio banco", seta de direção,
contagem, soma, expandir para ver os lançamentos individuais.

Validação na entrada: `category_id` obrigatório quando `nature` é `income` ou
`expense`; deve vir nulo quando `nature` é `transfer` — dinheiro que só mudou
de lugar não tem categoria de gasto, e permitir os dois juntos deixaria uma
transferência categorizada por acidente de UI, invisível até alguém notar o
orçamento errado.

**Confirmar** (`confirmCounterparty`, substitui `createNatureRule`):

```
UPDATE counterparties SET nature=?, category_id=?, confirmed_at=now(), confirmed_by=?
  WHERE id = ? AND org_id = ?
UPDATE transactions SET type=?, category_id=?, review_state='confirmed'
  WHERE counterparty_id = ? AND org_id = ? AND review_state='pending'
```

As duas dentro de uma `db.transaction`, mesmo motivo do `createNatureRule`
atual: falha parcial deixaria a contraparte confirmada e as transações
pendentes silenciosamente, o pior desfecho. O segundo `UPDATE` usa
`counterparty_id` — chave estrangeira, não texto — o que elimina de raiz a
classe de bug que a v1 do backfill de natureza teve (LIKE reescrevendo um
número diferente do que a tela prometia).

**Sem decisão linha a linha.** Uma contraparte confirmada é uma regra; o caso
que motivaria fatiar (Unimed cobrando vs. devolvendo) já está resolvido pela
chave incluir direção. Um CNPJ genuinamente misto na mesma direção se corrige
reabrindo a contraparte depois — a página lista as confirmadas, editável, e a
edição reaplica retroativamente.

---

## 7. O portão (gate) e o bootstrap

**Regime permanente:** contraparte nova → pendente, visível na lista de
transações (grayed, como `balanceApplied=false` já faz hoje), **fora das
somas de orçamento/pacing/dívida, sem travar nada**. Não é preciso zerar a
fila para usar o app no dia a dia.

**Primeira sincronização grande é diferente, e é sempre assim** — não é um
artefato desta migração, é a forma natural de qualquer conta que conecta o
Open Finance pela primeira vez e traz seis, doze meses de histórico: uma
enxurrada de contrapartes desconhecidas de uma vez. Enquanto a org nunca tiver
zerado a fila pela primeira vez, o app mostra a fila **no lugar do
dashboard**, não ao lado dele.

- `orgs` ganha `review_gate_cleared_at timestamptz nullable`.
- Gate ligado à **org**, não à conexão: a primeira vez que a fila zera, fica
  destravado para sempre. Conectar um segundo banco depois empilha na fila
  não-bloqueante do regime permanente, não reabre o portão.
- Verificação: contagem de `review_state='pending'` da org, checada no layout
  do app. `review_gate_cleared_at is null AND count > 0` → renderiza a fila
  em tela cheia. `count` chega a 0 → grava o timestamp e segue, sem clique de
  "concluir" à parte.

**Para os dados já em produção**, "primeira sincronização" já aconteceu sob as
regras antigas — `polp_type` está `null` em 805 de 808 linhas porque a coluna
nasceu depois da ingestão que gravou a maioria delas. Reconstituir exige
rebuscar a Polp, não o banco:

1. Migração de schema (tabela nova, colunas novas, migra e derruba
   `transaction_nature_rules`).
2. Script de backfill, rodado uma vez: para cada recurso já conectado,
   sincronização completa (sem `fromUpdatedAt`) — confirmado que a API aceita
   e devolve os 13 meses inteiros sem paginação quebrada. Cada transação
   nova ou existente passa pelos Níveis 1/2; existentes são atualizadas por
   `external_id` (nunca reinseridas — o índice único já impede duplicata).

Medido contra a produção: **~186 decisões** no bootstrap (150 CNPJ + 34
descrição na conta corrente, 2 no resíduo de cartão), bem abaixo do que
qualquer heurística de texto jamais conseguiria justificar sem revisão.

---

## 8. Testes

- `identityKey()` — tax_id presente usa tax_id; ausente cai para descrição
  normalizada escopada à conta; direção sempre entra na chave.
- Nível 1 — cada um dos 6 casos resolve sem contraparte e sem fila; o default
  de cartão (`OUTROS`/`TARIFA` em débito) vira despesa confirmada.
- Ingestão — contraparte nova cria pendente uma vez só mesmo com duas páginas
  no mesmo sync (`onConflictDoNothing`); contraparte confirmada aplica
  natureza+categoria a um lançamento novo sem passar pela fila.
- Re-sync — enriquecimento não muda `review_state`, `type` nem
  `counterparty_id` de uma linha já existente.
- `confirmCounterparty` — atualiza a contraparte e só as transações pendentes
  daquela contraparte; org errada, `counterparty_id` de outra org, e zero
  linhas afetadas continuam cobertos como cercas explícitas.
- Gate — conta com pendência e `review_gate_cleared_at` nulo bloqueia; mesma
  conta após confirmar tudo destrava e grava o timestamp; segunda conexão
  com pendência não rebloqueia uma org já destravada.
- Casos reais medidos nesta investigação como fixtures: Unimed
  cobrança/reembolso, fatura Personnalité sem `category_ref` de fatura, SOMA
  COOPERATIVA como receita.

---

## 9. Alternativas rejeitadas

**Manter as duas tabelas de regra, só trocar a chave para CNPJ.** Menor
mudança de schema, mas a fila não tem onde morar — precisaria ser derivada
agrupando transações pendentes a cada carregamento — e cada decisão grava em
duas tabelas que podem divergir. Os dois sistemas paralelos que hoje deixam
natureza e categoria decidirem coisas diferentes sobre o mesmo lançamento
continuariam existindo.

**Sem tabela de decisão; a primeira transação confirmada é a regra
implícita.** Revogar uma decisão vira caçar qual transação virou precedente;
auditar por que um lançamento foi classificado assim exige refazer a busca.
A aprovação histórica deixa de ser um fato gravado.

**Continuar ajustando o detector por texto.** Testado até a exaustão nesta
mesma investigação: contagem de tokens em comum, proporção de tokens,
stoplist de palavras burocráticas — cada um resolvia o caso medido e abria um
novo (o envelope do banco, "SAO PAULO", a direção do dinheiro). Não há
heurística de texto que termine.

**Chutar natureza pelo crédito/débito enquanto não confirma, contando nas
somas.** Rejeitado explicitamente pelo usuário: é a mesma classe de invenção
que causou o problema, só que na direção oposta — resolve as somas ficarem
provisoriamente certas, mas quando erra, erra em silêncio.

---

## 10. Migração

1. `supabase/migrations` — `counterparties`, colunas em `transactions`, coluna
   em `orgs`, migra e derruba `transaction_nature_rules`.
2. `normalize.ts` — remove `kindForRef` fallback e `creditCardConnected`;
   adiciona a quarta regra do Nível 1 (débito de cartão fora dos três casos
   explícitos).
3. Nova função pura de resolução de contraparte + testes (Passo 8).
4. `sync.ts` — troca `applyNatureRules` pela resolução de contraparte em lote.
5. `confirmCounterparty` (server action) — substitui `createNatureRule`.
6. Página da fila + o portão no layout do app.
7. Script de backfill (rodado manualmente uma vez contra a produção atual).
8. Remove o subsistema de detecção (§5) só depois do backfill confirmado —
   evita uma janela sem nenhuma das duas coisas funcionando.
9. Adiciona `review_state = 'confirmed'` aos 4 agregadores: `budget-pacing-
   input.ts`, `budget-daily-queries.ts`, `budget-queries.ts`,
   `debt-queries.ts`. **Não toca** `finance/queries.ts` — o saldo acumulado é
   sobre dinheiro ter entrado ou saído de verdade, eixo independente de
   `review_state`.
