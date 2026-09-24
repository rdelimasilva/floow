# Investimentos via Open Finance (Polp) — design

Data: 2026-09-23
Estado: aguardando revisão

## Objetivo

Trazer a carteira de investimentos do usuário pelo Open Finance da Polp, com
posição, histórico de movimentações, proventos e rentabilidade — a mesma tela de
investimentos que hoje só aceita cadastro manual.

## Decisões tomadas

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | O que mostrar | Carteira completa: posição + movimentações + rentabilidade + proventos |
| D2 | Convivência com o cadastro manual | Conexão substitui o manual daquela instituição. Manual segue para o que não está conectado. Sem fusão automática |
| D3 | Lado do caixa | Movimentação de investimento **nunca** gera lançamento. Aplicação e resgate já chegam pelo extrato da conta (`APLICACAO_FINANCEIRA`, `RESGATE_APLIC_FINANCEIRA`) |
| D4 | Escopo de tipos | Os cinco: renda fixa bancária, renda fixa de crédito, fundos, Tesouro, renda variável |
| D5 | Modelo de dados | Híbrido: identidade em `assets`, posição do banco em tabela própria, movimentações em `portfolio_events` |

## O que a Polp oferece

Fonte: https://polp.com.br/docs/celcoin/ (seção Investimentos), lida em 2026-09-23.

| Tipo | Listagem por consentimento | Movimentações |
|---|---|---|
| Renda fixa bancária (CDB, RDB, LCI, LCA) | `GET /consents/{id}/bank-fixed-incomes` | `GET /bank-fixed-incomes/{id}/transactions` |
| Renda fixa de crédito (debênture, CRI, CRA) | `GET /consents/{id}/credit-fixed-incomes` | `GET /credit-fixed-incomes/{id}/transactions` |
| Fundos | `GET /consents/{id}/funds` | `GET /funds/{id}/transactions` |
| Tesouro | `GET /consents/{id}/treasure-titles` | `GET /treasure-titles/{id}/transactions` |
| Renda variável | `GET /consents/{id}/variable-incomes` | `GET /variable-incomes/{id}/transactions` |

- A posição vem no objeto `balance`, **embutido na listagem**. Não há rota de saldo.
- A rota de detalhe (`GET /<tipo>/{id}`) tem limite próprio de 30 req/min e a doc
  pede para não usá-la em polling. **O floow não a usa.**
- Listagem pagina de 15 em 15; movimentações, de 500 em 500. Cursor, como hoje.
- Valores monetários `{ amount, currency }` com `amount` string; quantidades e
  taxas também string.
- `balance` pode vir `null` enquanto a sincronização da Polp não terminou.
- Data de referência: `reference_date_time` (renda fixa bancária, crédito,
  Tesouro) ou `reference_date` (fundos, renda variável).
- Campos de `balance` diferem por tipo: fundos usam `quota_quantity`,
  `quota_gross_price_value`, `income_tax_provision`; renda variável não tem
  `net_amount` nem IR, tem `closing_price` e `price_factor`.
- Histórico de movimentações: pelo padrão do Open Finance, ~12 meses. Custo de
  ativo mais antigo não é reconstruível pelos eventos.

## 1. Consentimento

- O wizard (`connect-wizard.tsx`) ganha a opção **Investimentos**
  (`INVESTMENTS`), com hint explicando o que é compartilhado.
- Conexões existentes não pediram o produto. A tela da conexão ganha a ação
  **Incluir investimentos**: cria um consentimento novo com os produtos atuais +
  `INVESTMENTS`. Quando o novo chega a `AUTHORISED`, ele vira o consentimento da
  conexão e o antigo é revogado. Até lá, o antigo segue valendo.
- Conexões novas não dependem dessa ação.

## 2. Ingestão

Roda no cron diário existente (`/api/openfinance/import-transactions`) e no botão
Sincronizar. Webhook segue fora, pelo mesmo bloqueio de autenticação da fase
anterior.

Para cada conexão cujo consentimento inclui `INVESTMENTS`, para cada tipo:

1. **Listar** `GET /consents/{id}/<tipo>` (todas as páginas).
   Para cada investimento:
   - resolve o recurso em `openfinance_resources` (cria se novo) e o ativo
     vinculado via `asset_id`;
   - faz upsert de `assets` com identidade e metadados;
   - se `balance` não for nulo, grava a posição em `asset_bank_positions`
     (idempotente por `asset_id` + `reference_date`).
2. **Movimentações** `GET /<tipo>/{id}/transactions` com `fromDate` = última data
   importada daquele ativo menos uma margem de 7 dias (a primeira vez, sem filtro).
   Upsert em `portfolio_events` por `polp_transaction_id`.
3. Recalcula `asset_position_snapshots` dos ativos tocados.

Regras:

- **Normalização** em `packages/core-finance/src/openfinance/investments/`, uma
  função pura por tipo: payload cru → `{ asset, position | null, events[] }`.
  Nenhuma chamada de rede nem banco lá dentro.
- **Tipos de payload** em arquivo próprio (`polp-investment-types.ts`), para não
  estourar o limite de 500 linhas de `polp-types.ts`.
- **Cliente**: `PolpClient` ganha `streamInvestments(consentId, tipo)` e
  `streamInvestmentTransactions(tipo, id, query)`, reaproveitando `paginate`.
  O mapa `tipo → slug de rota` é fechado; tipo desconhecido é erro.
- **Conta de investimentos**: `portfolio_events.account_id` é obrigatório. Cada
  conexão ganha uma conta do tipo investimento ("Investimentos · <Instituição>"),
  criada na primeira ingestão, fora do fluxo de caixa.
- **Isolamento de falhas**: erro num tipo registra issue e segue para o próximo;
  erro num ativo não derruba os outros do mesmo tipo.
- **Enum desconhecido** (`transaction_type`, `investment_type`, `indexer`) vira
  `other` e registra em `openfinance_ingestion_issues`, nunca quebra.
- **Orçamento de rate limit**: por conexão, 5 listagens (+ páginas) e 1 chamada
  de movimentações por ativo. Global de 240 req/min; o retry em 429 do cliente já
  cobre o excesso.

## 3. Modelo de dados

Migração nova (número livre no momento da implementação; hoje a última é 00052).

### `assets` (alterada)

| Coluna | Tipo | Observação |
|---|---|---|
| `source` | enum `asset_source` (`manual`, `openfinance`) | default `manual` |
| `asset_subtype` | text null | CDB, LCI, DEBENTURES, CRI… o `investment_type` da Polp |
| `isin` | text null | |
| `cnpj` | text null | CNPJ do fundo ou do emissor |
| `issuer_name` | text null | devedor (crédito) ou emissor |
| `indexer` | text null | CDI, IPCA, SELIC, PRE_FIXADO, OUTROS |
| `pre_fixed_rate` | numeric null | fração: 0.15 = 15% |
| `indexer_percentage` | numeric null | fração: 1.0 = 100% do indexador |
| `due_date` | date null | |

- `ticker` passa a aceitar nulo; a UI exibe `ticker ?? name`.
- `asset_class` ganha `fund`, `treasury`, `credit_fixed_income`.
- **Escala do percentual**: a doc mostra "1.000000" na renda fixa bancária e "100"
  na de crédito. O normalizador converte para fração: valor > 10 é tratado como
  percentual e dividido por 100. Validar com dado real (pendência P2).

### `asset_bank_positions` (nova)

`id`, `org_id`, `asset_id`, `reference_date` (date), `quantity`, `unit_price`,
`gross_amount`, `net_amount`, `income_tax`, `iof`, `blocked_amount`,
`purchase_unit_price` — todos `numeric`, nulos onde o tipo não informa —
`created_at`. Único em (`asset_id`, `reference_date`). RLS no padrão do projeto.

Guarda uma linha por dia de referência: é a série histórica que desenha a
evolução do ativo.

### `portfolio_events` (alterada)

- `quantity` → `numeric`; novo `unit_price` `numeric` substitui `price_cents`
  (migração copia `price_cents / 100`). `total_cents` segue em centavos.
- `event_type` ganha `come_cotas`, `jcp`, `maturity`, `tax`, `other`.
- Novas colunas nulas: `polp_transaction_id` (único), `gross_cents`,
  `net_cents`, `income_tax_cents`.

### `openfinance_resources` (alterada)

- Ganha `asset_id` (FK para `assets`, `on delete set null`), paralelo a
  `account_id`.

### Mapeamento de movimentações

| Polp | `event_type` |
|---|---|
| APLICACAO, COMPRA | `buy` |
| RESGATE, VENDA, CANCELAMENTO | `sell` |
| VENCIMENTO | `maturity` |
| PAGAMENTO_JUROS, PREMIO | `interest` |
| AMORTIZACAO | `amortization` |
| DIVIDENDOS, ALUGUEIS | `dividend` |
| JCP | `jcp` |
| COME_COTAS | `come_cotas` |
| MULTA, MORA | `other` |
| TRANSFERENCIA_TITULARIDADE, TRANSFERENCIA_CUSTODIA, TRANSFERENCIA_COTAS, OUTROS | `other` |

`other` entra no histórico mas não afeta custo nem proventos.

## 4. Posição e rentabilidade

- **Ativo manual**: nada muda — posição calculada pelos eventos.
- **Ativo Open Finance**:
  - valor atual = última `asset_bank_positions` (`net_amount` quando existir,
    senão `gross_amount`);
  - custo = `purchase_unit_price × quantity` quando o banco informa; senão soma
    das compras menos vendas conhecidas, marcado como **custo parcial**;
  - proventos = soma de `dividend`, `jcp`, `interest` dos eventos.
- `asset_position_snapshots` é preenchido para as duas origens; tela e patrimônio
  continuam lendo de um lugar só.
- `quantity_held` e colunas de preço em `asset_position_snapshots` passam a
  `numeric` pela mesma razão de `portfolio_events`.

## 5. Tela

Dentro da tela de investimentos existente — **sem item de menu novo**.

- Selo "via Open Finance" e nome da instituição no ativo.
- Ativo do banco é somente leitura: sem editar nem excluir eventos.
- Mostra bruto, líquido, IR/IOF e data de referência da posição.
- Selo "custo parcial — histórico limitado a 12 meses" quando aplicável.
- Wizard e tela da conexão: opção Investimentos e ação Incluir investimentos.

## 6. Erros e testes

- Normalizadores (core-finance, puros): um teste por tipo com payload da doc,
  cobrindo `balance` nulo, enum desconhecido, escala do percentual e os dois
  nomes de data de referência.
- Cliente: rotas e paginação das novas funções, com `fetchImpl` falso.
- Ingestão (apps/web): idempotência — rodar duas vezes não duplica posição nem
  evento; falha num tipo não impede os demais; issue registrada em enum
  desconhecido.
- Carteira: `portfolio.ts` com quantidade fracionária; custo por
  `purchase_unit_price` e custo parcial.
- RLS de `asset_bank_positions` no padrão dos testes existentes.

## Pendências

| # | Pendência | Bloqueia |
|---|-----------|----------|
| P1 | Com `avoidDuplicates: true`, a Polp aceita um novo consentimento para o mesmo CPF + instituição com mais produtos? Existe forma de ampliar sem criar outro? | Só a ação Incluir investimentos |
| P2 | Escala real de `post_fixed_indexer_percentage` por tipo | Nada — normalizador tolera as duas; confirmar com dado real |
| P3 | Literal do produto no consentimento (`INVESTMENTS`) e valores de `type` em `/resources` para investimentos | Nada — já constam em `polp-types.ts`; confirmar no primeiro consentimento real |
| P4 | Defasagem da posição (D-1?) e frequência de sync do plano | Nada — só o texto que a UI promete sobre atualidade |

## Fora de escopo

- Webhook de investimentos (mesmo bloqueio da fase de transações).
- Vínculo entre evento da carteira e lançamento do extrato (`transaction_id`).
- Fusão de ativo manual com ativo do banco.
- Operações de crédito e câmbio.
