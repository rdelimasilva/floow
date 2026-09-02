# Ingestão Open Finance via Polp (Celcoin v2)

**Data:** 2026-09-02
**Status:** proposto
**Subsistema:** 1 de 4 — ver `2026-09-02-budget-pacing-design.md`
**Fonte:** doc oficial lida em https://polp.com.br/docs/celcoin (2026-09-02)

## O problema central: a Polp não é multi-tenant

Esta é a decisão que governa todo o resto, e a razão de a spec começar por ela.

A API da Polp autentica com **um único par `x-api-client` / `x-api-secret` por conta**.
Não há header de tenant, não há escopo por cliente final, e o webhook não diz de quem é
o dado que chegou:

```json
{ "event": "accounts.transactions",
  "resource": "accounts",
  "resource_id": "550e8400-...",
  "query_parameters": "fromCreatedAt=...&toUpdatedAt=..." }
```

`resource_id` é o UUID de uma conta **na base da Polp**. Nada nesse payload diz a qual
`org_id` do floow ele pertence. O único campo de correlação existe na criação do
consentimento (`cliente_user_id`, string livre) e **não volta no webhook**.

Consequência: a segregação por tenant é inteiramente responsabilidade do floow, e o
ponto de falha é o handler de webhook. Se ele não souber resolver `resource_id → org_id`,
a alternativa nunca pode ser adivinhar — grava no tenant errado e vaza dado financeiro
entre clientes.

### D1 — Toda entidade da Polp é registrada localmente com `org_id` antes de qualquer dado entrar

Nenhum dado é gravado a partir de um identificador que o floow não conheça de antemão.
O fluxo é sempre: **primeiro registramos o vínculo, depois aceitamos o dado**.

- O consentimento nasce no floow (com `org_id`) e só então é criado na Polp.
- Ao ficar `AUTHORISED`, listamos `GET /consents/{id}/resources` e gravamos cada
  `resource_id` numa tabela local **já com o `org_id` do consentimento**.
- O webhook resolve `resource_id → org_id` por essa tabela. Sem correspondência,
  o evento é **rejeitado e registrado**, nunca processado.

### D2 — RLS não protege o caminho do webhook; a checagem é explícita

As políticas RLS do projeto usam `org_id IN (SELECT get_user_org_ids())`, que depende do
JWT do usuário. O webhook chega sem usuário: roda com service role, onde RLS não se
aplica. A proteção nesse caminho é o código, então ela precisa ser explícita, testada e
concentrada num único ponto — a função que resolve a org. Nenhum `insert` de transação
importada aceita `org_id` vindo de outro lugar.

### D3 — `cliente_user_id` recebe o `org_id`, como defesa em profundidade

Enviamos `cliente_user_id = <org_id>` na criação. Não é usado no caminho principal
(o webhook não o devolve), mas dá conferência independente ao consultar
`GET /consents/{id}` e ajuda a auditar um vínculo perdido.

## Schema (migration nova)

Três tabelas, todas com `org_id` e RLS no mesmo padrão do projeto.

```
openfinance_connections            -- um consentimento
  id                uuid pk
  org_id            uuid not null -> orgs(id) on delete cascade
  polp_consent_id   text not null            -- id do consentimento na Polp
  institution_id    text not null
  institution_name  text
  cpf_masked        text                     -- só os dígitos exibíveis; NUNCA o CPF inteiro
  status            text not null            -- ConsentStatus
  execution_status  text                     -- ConsentExecutionStatus
  flags             text[] not null default '{}'
  products          text[] not null default '{}'
  last_synced_at    timestamptz
  revoked_at        timestamptz
  created_at/updated_at
  unique (polp_consent_id)
  index (org_id, status)

openfinance_resources              -- conta ou cartão dentro de um consentimento
  id                 uuid pk
  org_id             uuid not null -> orgs(id) on delete cascade
  connection_id      uuid not null -> openfinance_connections(id) on delete cascade
  polp_resource_id   text not null            -- UUID local da Polp
  resource_type      text not null            -- ResourceType (ACCOUNT, CREDIT_CARD_ACCOUNT, ...)
  status             text not null            -- ResourceStatus
  account_id         uuid -> accounts(id) on delete set null   -- conta espelho no floow
  last_synced_at     timestamptz
  created_at/updated_at
  unique (polp_resource_id)          -- CHAVE do roteamento de webhook
  index (org_id, resource_type)

openfinance_webhook_events         -- trilha de auditoria e idempotência
  id             uuid pk
  org_id         uuid                          -- NULL quando não resolvido (evento órfão)
  event          text not null
  resource       text not null
  resource_id    text not null
  query_params   text
  status         text not null                 -- received | processed | rejected | failed
  reject_reason  text
  payload        jsonb not null
  processed_at   timestamptz
  created_at     timestamptz default now()
  index (resource_id), index (status, created_at)
```

`unique (polp_resource_id)` é o que torna o roteamento determinístico: um `resource_id`
pertence a exatamente uma org, ou a nenhuma.

**Não guardamos CPF completo.** Ele é necessário no `POST /consents` e é descartado
depois; a coluna guarda apenas forma mascarada para exibição.

## Fluxo de conexão

```
1. GET /institutions                        -> usuário escolhe o banco
2. POST /consents { institution_id, cpf,
                    cliente_user_id: org_id,
                    products, avoidDuplicates: true }
3. grava openfinance_connections (org_id, polp_consent_id, status)
4. redireciona para url_to_authenticate      (expira: url_to_authenticate_expires_at)
5. webhook `consents` -> GET /consents/{id}  -> status AUTHORISED
6. GET /consents/{id}/resources              -> grava openfinance_resources COM org_id
7. cria/vincula accounts locais              -> account_id em cada resource
8. a partir daqui, webhooks de dados são roteáveis
```

`avoidDuplicates: true` é obrigatório: os **limites operacionais do Open Finance são
regulatórios por CPF/CNPJ**, e reconectar a mesma conta consome teto mensal. Reconexão
usa `POST /consents/{id}/recreate`, que renova a autorização sem criar outro registro.

## Fluxo de webhook

```
POST /api/webhooks/polp
  1. autentica a origem                     (ver "Autenticação do webhook")
  2. grava openfinance_webhook_events (status=received)
  3. resolve org:
       event=consents            -> por polp_consent_id  em openfinance_connections
       event=*.transactions      -> por polp_resource_id em openfinance_resources
       event=bills               -> por polp_resource_id (é o UUID do cartão)
       event=accounts|credit_cards -> por polp_consent_id (resource=consents)
     não encontrou -> status=rejected, reject_reason, HTTP 200, FIM
  4. busca os dados na janela: GET <listagem>?{query_parameters}
  5. importa com o org_id resolvido, paginando por next_cursor
  6. status=processed
```

Responder **200 mesmo ao rejeitar** evita retentativa infinita de um evento órfão. O
registro em `openfinance_webhook_events` com `org_id` nulo é o alarme para investigar.

O evento `consents` **não traz `query_parameters`** — nele consulta-se
`GET /consents/{id}` direto.

## Mapeamento para o modelo do floow

### Conta (`accounts`)

| Polp | floow |
|---|---|
| `ResourceType.ACCOUNT` | `accounts.type` = `checking` / `savings` conforme subtipo |
| `ResourceType.CREDIT_CARD_ACCOUNT` | `accounts.type` = `credit_card` |
| `polp_resource_id` | `openfinance_resources.polp_resource_id` (não em `accounts`) |

### Transação (`transactions`)

| Polp (conta) | Polp (cartão) | floow |
|---|---|---|
| `transaction_date_time` | `transaction_date_time` | `date` — regime de **competência**, que é o que o pacing usa |
| — | `bill_post_date` | coluna nova `bill_post_date` — destrava a visão de caixa depois |
| — | `bill_forecast_date` | coluna nova `bill_forecast_month` — ver "Parcelas futuras" |
| `transaction_amount.amount` | `brazilian_amount.amount` | `amount_cents` — ver "Valores" |
| `credit_debit_type` | `credit_debit_type` | sinal e `type` |
| `transaction_name` | `transaction_name` | `description` (enriquecida por `counterparty`) |
| `category_ref` | `category_ref` | categoria — ver "Categorização" |
| — | `payee_mcc` | coluna nova `payee_mcc`, para regra do usuário |
| — | `charge_identificator` / `charge_number` | parcela atual / total |
| `id` | `id` | `external_id` — dedupe pelo índice único já existente |

O índice `uq_transactions_external_account (external_id, account_id)` já existe e serve
de dedupe sem código novo.

### Valores — armadilha

`amount` chega como **string decimal** (`"1500.00"`), não em centavos. A conversão é
`Math.round(parseFloat(x) * 100)`, e `parseFloat` sozinho introduz erro de ponto
flutuante em valores grandes. Para cartão usar `brazilian_amount` (já convertido),
guardando `amount` original apenas quando as moedas diferirem.

O sinal vem de `credit_debit_type` (`CREDITO` / `DEBITO`), **não** do sinal do número.
A convenção do floow é despesa negativa (`actions.ts:301`).

### Filtro de tipo — o que NÃO é despesa

| `transaction_type` | Tratamento |
|---|---|
| `PAGAMENTO_FATURA` | **Ignorar como despesa.** Já contabilizada na compra; contá-la duplica. Vira `transfer` ou `is_ignored`. |
| `ESTORNO` | Entra com sinal invertido, abatendo. É o caso que motivou trocar `ABS` por `-amount` nas agregações. |
| `CASHBACK` | Crédito, não despesa negativa. |
| `TARIFA` | Despesa legítima (categoria de tarifas bancárias). |
| `null` | Ocorre quando o BCB não envia o campo — tratar como `OUTROS`, nunca quebrar. |

### Categorização — a Polp já resolve

A doc expõe `category_ref` com a **Polp Taxonomy**: cerca de 150 categorias hierárquicas
(`FOOD_AND_DRINK_GROCERIES`, `TRANSPORTATION_TAXIS_AND_RIDE_SHARES`, …) já atribuídas.
Isso é melhor do que o plano anterior de derivar categoria do MCC cru.

Ordem de precedência proposta:
1. `category_rules` do usuário (override manual, já existe)
2. mapa `category_ref` → categoria do floow
3. `payee_mcc` como desempate
4. `OTHER_OTHER` → sem categoria (cai em "não orçado" no pacing)

O mapa taxonomia→categoria é a peça de mais trabalho manual desta fase e merece tabela
própria, editável, em vez de constante no código.

### `counterparty` melhora a descrição

`{ name, alias, tax_id, website_url, logo_url }`, preenchido **assincronamente** — vem
`null` na primeira consulta. A descrição deve usar `counterparty.alias` quando existir e
cair para `transaction_name`. Como chega depois, o import precisa ser idempotente e
capaz de **atualizar** uma transação já gravada (o webhook reenvia com `fromUpdatedAt`).

### Parcelas futuras — conexão direta com o bug que já corrigimos

`bill_forecast_date` (AAAA-MM) vem **sempre preenchido**, inclusive para parcelas
futuras ainda não lançadas em fatura. E `bill_post_date` usa a data-sentinela
**`"0001-01-01"`** nesse caso — repassada crua, sem virar `null`.

Duas obrigações:
1. Tratar `"0001-01-01"` como "sem fatura ainda". Gravá-la como data real põe a
   transação no ano 1.
2. Parcelas futuras entram com `date` no futuro. O motor de pacing **já lida com isso**:
   `computeBudgetPacing` conta gasto apenas até `daysElapsed`. Foi exatamente o bug
   Critical corrigido em `f7df074`, e ele existia por causa deste cenário.

## Sincronização

Webhooks são o gatilho principal — **não é pull agendado**, ao contrário do que a spec
do pacing supôs antes de a doc estar acessível. O cron diário permanece como rede de
segurança para consentimentos sem evento recente.

A frequência de sync por recurso **depende do plano contratado** (ver "Frequência de
Atualização" na doc). Isso limita quão fresco o dado pode ser e precisa ser confirmado
contra o plano assinado antes de prometer "tempo real" na interface.

## Correções a specs anteriores

Registros feitos quando a doc estava inacessível e que a leitura desmentiu:

| Registrado antes | Realidade |
|---|---|
| "Consentimento expira em no máximo 12 meses e não renova sozinho" | **Não expira**: vale por período indeterminado até revogação. Ainda existe status `EXPIRED` e `POST /recreate`. |
| "Não há webhook; o sync é pull agendado" | **Há webhooks** para consentimento, recursos, transações e faturas. |
| "OAuth 2.0 + mTLS / certificados ICP" | **API keys** em header. |
| "`payeeMCC` como categorizador primário" | A Polp já entrega `category_ref` categorizado; MCC vira desempate. |

## Riscos

| Risco | Mitigação |
|---|---|
| **Vazamento entre tenants** por evento não roteável | `unique (polp_resource_id)`, resolução obrigatória antes de qualquer insert, rejeição registrada. É o risco mais grave desta fase. |
| Webhook forjado | Autenticação da origem — verificar no dashboard da Polp qual mecanismo existe (assinatura, IP, segredo em header). **A doc lida não especifica; confirmar antes de expor a rota.** |
| Dupla contagem de fatura | Filtro de `PAGAMENTO_FATURA` coberto por teste |
| Valores com erro de arredondamento | Conversão centralizada e testada, nunca `parseFloat` espalhado |
| Reconexão consome teto regulatório | `avoidDuplicates: true` e `recreate` em vez de novo consentimento |
| `counterparty`/`category_ref` chegam depois | Import idempotente que atualiza, não só insere |

## Fora de escopo

Investimentos, empréstimos, financiamentos e câmbio. O consentimento pode pedir os
produtos, mas esta fase importa apenas `ACCOUNT` e `CREDIT_CARD_ACCOUNT` — que é o que
o pacing consome.

## Pendências antes de implementar

1. **Autenticação do webhook** — a doc lida não descreve como validar a origem.
   Confirmar no dashboard ou com o suporte da Polp. Expor a rota sem isso permitiria
   injeção de transações forjadas.
2. **Plano contratado** — define a frequência de sync e os rate limits aplicáveis.
3. **Credenciais** — `POLP_API_CLIENT` e `POLP_API_SECRET` em variável de ambiente.
