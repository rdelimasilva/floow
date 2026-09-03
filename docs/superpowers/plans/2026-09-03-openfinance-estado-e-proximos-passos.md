# Open Finance via Polp — estado e próximos passos

**Data:** 2026-09-03
**Situação:** conexão real funcionando, dados importados, **classificação da conta corrente inutilizável**
**Spec:** `docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md`

Este documento existe para retomar sem redescobrir. O que está aqui foi apurado
contra a API e o banco de produção, não deduzido da documentação.

---

## 1. O que já funciona

O caminho inteiro está de pé e foi exercitado com uma conta real:

| Etapa | Estado |
|---|---|
| Wizard de conexão (banco, CPF, produtos) | funciona |
| Autorização no banco e retorno | funciona |
| Registro de recursos com `org_id` | funciona |
| Identificação de cada conta/cartão | funciona |
| Vínculo recurso ↔ conta do floow | funciona |
| Importação de transações | funciona |
| Categorização pela taxonomia da Polp | 738 de 739 |

**Migrations aplicadas:** 00027 a 00033.

**Resultado da primeira importação real:** 739 transações, zero rejeitadas pela
ingestão. Os dois cartões vieram com dado limpo e bem categorizado
(supermercado, restaurante, combustível, pedágio). A conta corrente veio com
12 meses de histórico.

---

## 2. O problema aberto: natureza da transação na conta corrente

**Os cartões estão bons. A conta corrente não.**

Cerca de R$ 635 mil entraram como "despesa" na conta corrente em 12 meses. Boa
parte não é gasto: são pagamentos de fatura (que já foram contados como compras
no cartão) e movimentação de investimento.

### 2.1 Pagamento de fatura que não se identifica como tal

Nove transações somando ~R$ 106 mil chegam assim:

```
type: TARIFA_SERVICOS_AVULSOS        <- "tarifa de serviços avulsos"
category_ref: BANK_FEES_OTHER_BANK_FEES
transaction_name: "Débito automático <nome do cartão> ..."
```

É o débito automático da fatura do cartão. **Nem o `type` estruturado nem o
`category_ref` dizem isso** — só a descrição. O tratamento atual
(`normalizeAccountTransaction`) só reconhece pagamento de fatura por
`category_ref = LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`, que pegou 9 outros
pagamentos, mas não estes.

Consequência: as compras do cartão entram como despesa **e** o pagamento da
fatura entra como despesa. É exatamente a dupla contagem que `creditCardConnected`
deveria impedir — ela funciona, mas só para os pagamentos que a Polp rotula
corretamente.

### 2.2 A Polp classifica a mesma operação de dois jeitos

| Descrição | `type` | `category_ref` | Vira |
|---|---|---|---|
| `Saída APLICACAO CDB DI` | OUTROS | `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS` | transferência ✓ |
| `Aplicação CDB DI` | OUTROS | `OTHER` | **despesa** ✗ |

A segunda, sozinha, jogou R$ 125 mil em "despesa". Aplicação e resgate de CDB
aparecem ora com `category_ref` de transferência, ora como `OTHER`, e o `type`
não desempata (vem `OUTROS` nos dois).

### 2.3 Por que isso não se resolve com mais um `if`

Três fontes existem e nenhuma é suficiente sozinha:

- **`type` (AccountTransactionType)** — resolve `APLICACAO_FINANCEIRA` e
  `RESGATE_APLIC_FINANCEIRA`, mas vem `OUTROS` nos casos mais caros.
- **`category_ref`** — resolve quando a Polp acerta, e ela erra de formas
  contraditórias na mesma conta.
- **descrição** — é a única que identifica o pagamento de fatura, e depende de
  saber que aquele nome é o cartão *daquele* usuário.

`category_rules`, que já existe no floow, **não serve**: ela atribui categoria e
não altera a natureza (`type`) da transação. Não há como uma regra transformar
despesa em transferência hoje.

### 2.4 Desenho proposto

Uma camada de reclassificação que decide **natureza**, aplicada depois do
normalizador e antes da gravação, com três fontes em ordem de confiança:

1. `type` estruturado: `APLICACAO_FINANCEIRA`, `RESGATE_APLIC_FINANCEIRA`,
   `TRANSFERENCIA_SALDO_RESERVADO` → transferência. Determinístico, sem palpite.
2. **Regra de descrição confirmada pelo usuário** — "Débito automático PERS
   BLACK é pagamento da fatura do meu cartão X". Só o usuário pode afirmar isso;
   inferir sozinho é o mesmo erro do D5 da spec (casar conta automaticamente).
3. Valor casado com a fatura do cartão conectado, como reforço da regra 2.

Isso exige estender `category_rules` (ou criar irmã) com uma ação de natureza,
e uma tela onde o usuário veja "estas 9 transações somam R$ 106 mil e estão
como despesa — são pagamento de fatura?".

**Nota de projeto:** o normalizador (`packages/core-finance/src/openfinance/normalize.ts`)
deve continuar puro e determinístico. A reclassificação por regra do usuário é
outra camada, em `apps/web/lib/openfinance/`.

---

## 3. Decisões pendentes

| # | Decisão | Contexto |
|---|---|---|
| 1 | Conta "Banco Itaú" (122 transações de OFX, jan-fev/2026, sem vínculo) | Parece a mesma conta bancária cadastrada duas vezes; o período agora existe também na conta vinculada. Apagar a conta, apagar só as transações, ou deixar. |
| 2 | Parear as duas pernas do pagamento de fatura com `transfer_group_id` | Hoje cada perna existe no seu extrato, ambas como `transfer`, sem ligação. Saldo fica certo; a interface não sabe que são a mesma coisa, e editar uma sem a outra desequilibra. |
| 3 | Ajuste de saldo inicial da conta corrente | Saldo no floow ~R$ 3.677; o Itaú informa ~R$ 271 disponível. A diferença é o saldo inicial, nunca ajustado para o começo do histórico importado. |
| 4 | Contas de cartão órfãs ("Cartão PDA", "Cartão Master Black", "teste") | Zero transações. Provavelmente criadas antes do vínculo, que acabou em contas novas. |

---

## 4. Armadilhas da API da Polp já pagas

Cada uma destas custou um erro em produção. Não redescubra:

**Recurso único vem envelopado.** `GET /consents/{id}`, `POST /consents` e
`recreate` respondem `{ "data": { … } }`, não o objeto na raiz. Ler a raiz
devolve objeto sem `id`, e o `undefined` só estoura camadas adiante — apareceu
como `UNDEFINED_VALUE` do driver do Postgres. `unwrap()` no cliente trata.

**`url_to_authenticate` não é um link que se guarda.** Dentro dela vai um
`request_uri` de Pushed Authorization Request: uso único, dezenas de segundos. A
Polp anuncia validade de uma hora para a URL, e o banco recusa muito antes com
`invalid_request_uri`. Criar consentimento e redirecionar na hora; para tentar
de novo, `POST /consents/{id}/recreate` (não queima teto regulatório).

**401 nem sempre é credencial.** `GET /consents/{id}/resources` responde 401
enquanto o consentimento não está autorizado. É 401 de estado.

**O final do cartão está dentro de um array.** Não na raiz nem em
`identification` direto: em `payment_methods[0].identification_number`. O nome
comercial vem em `name` ("PERSONNALITE MC BLACK").

**`GET /consents/{id}/resources` não identifica nada.** Só `type`, `status` e
`resource_id`. Quem tem dois cartões no mesmo banco veria duas linhas iguais —
daí a cadeia em `resource-label.ts`.

**Rate limit é global.** 30 req/min nos endpoints de detalhe, por credencial, e
a credencial é uma para o floow inteiro. Nada de consultar detalhe em
renderização.

---

## 5. Como conferir o estado

Consultas úteis, para rodar no SQL Editor:

```sql
-- Panorama por conta: o que veio da Polp e o que é de outra origem
SELECT a.name, a.type, (a.balance_cents/100.0) AS saldo,
       count(t.id) AS transacoes,
       count(t.id) FILTER (WHERE t.external_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}') AS da_polp
FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
GROUP BY a.id ORDER BY transacoes DESC;

-- Natureza do que foi importado (é aqui que o problema aparece)
SELECT a.name, t.type, count(*), (sum(t.amount_cents)/100.0) AS soma
FROM transactions t JOIN accounts a ON a.id = t.account_id
WHERE t.external_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}'
GROUP BY a.name, t.type ORDER BY a.name;

-- Maiores "despesas": onde os falsos positivos aparecem
SELECT t.date, (t.amount_cents/100.0) AS valor, t.description, t.category_ref
FROM transactions t JOIN accounts a ON a.id = t.account_id
WHERE a.type = 'checking' AND t.type = 'expense'
ORDER BY t.amount_cents ASC LIMIT 20;

-- O que a ingestão não conseguiu ler (com o payload cru)
SELECT reason, count(*) FROM openfinance_ingestion_issues
WHERE resolved_at IS NULL GROUP BY reason;

-- Qualidade da identificação dos recursos
SELECT display_label, identification_source, resource_type
FROM openfinance_resources;
```

**Backup da limpeza de OFX:** tabela `public.backup_ofx_removidas` (53 linhas).
Manter até conferir o resultado; o caminho de volta está no rodapé de
`supabase/limpeza-ofx-duplicado.sql`.

---

## 6. O que ainda não existe

- **Webhook** (`/api/webhooks/polp`) — bloqueado: a doc não diz como validar a
  origem, e expor a rota sem isso aceita transação forjada. Quando destravar,
  ele chama `syncConnectionTransactions`, o mesmo código do botão.
- **Sincronização automática** — hoje é só o botão Sincronizar. O cron diário do
  projeto (`cfo-daily`) seria o lugar natural para a rede de segurança.
- **Produtos além de conta e cartão** — crédito, investimentos e câmbio não são
  pedidos no consentimento, e a ingestão não sabe lê-los.
- **Variáveis em produção** — `POLP_API_CLIENT`, `POLP_API_SECRET` e
  `POLP_CPF_SALT` só existem no ambiente local. Sem elas, a tela em produção diz
  que a integração não está configurada.

---

## 7. Por onde recomeçar

A camada de reclassificação (seção 2) é o que separa "os dados entraram" de "os
dados servem". Enquanto ela não existir, o orçamento e o pacing sobre a conta
corrente vão mentir — os cartões, esses já podem ser usados.

O primeiro passo é uma decisão de produto, não de código: **como o usuário
confirma que "Débito automático PERS BLACK" é pagamento da fatura dele.** Uma
tela que mostra os agrupamentos suspeitos por descrição, com o total em reais ao
lado, e pergunta. O resto decorre disso.
