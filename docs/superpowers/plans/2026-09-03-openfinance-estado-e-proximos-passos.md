# Open Finance via Polp — estado e próximos passos

**Data:** 2026-09-03
**Situação:** conexão real funcionando, dados importados, camada de reclassificação de natureza implementada e **nunca executada contra banco real**
**Spec:** `docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md` (ingestão) e
`docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md` (natureza)

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

## 2. A camada de reclassificação de natureza — implementada, não verificada

O problema descrito nesta seção até 2026-09-03 (pagamento de fatura e aplicação
CDB entrando como "despesa" na conta corrente) tem agora uma solução
implementada, seguindo a spec
`docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md`.
O que existe:

- **`packages/core-finance/src/openfinance/normalize.ts`** — o `type` bruto da
  Polp (`APLICACAO_FINANCEIRA`, `RESGATE_APLIC_FINANCEIRA`,
  `TRANSFERENCIA_SALDO_RESERVADO`) decide a natureza como transferência antes
  de olhar `category_ref`. É a parte determinística, sem palpite.
- **`apps/web/lib/openfinance/nature-rules.ts`** — regras de descrição
  confirmadas pelo usuário (ex.: "Débito automático PERS BLACK é a fatura do
  cartão X"), aplicadas na ingestão para reclassificar a natureza.
- **`apps/web/lib/openfinance/nature-suspects.ts`** — detector puro que agrupa
  transações suspeitas por descrição e sugere candidatas a regra; **nunca
  aplica nada sozinho**, só sugere.
- **`apps/web/lib/openfinance/nature-queries.ts`** e
  **`apps/web/lib/openfinance/nature-actions.ts`** — leitura dos agrupamentos
  suspeitos e as `'use server'` actions que criam regra e disparam o backfill
  do histórico já importado.
- **`apps/web/components/openfinance/`** (`nature-suspects-banner.tsx`,
  `nature-review-panel.tsx`, `nature-shortcut-dialog.tsx`) — a interface onde o
  usuário vê o agrupamento suspeito, o total em reais, e confirma ou não a
  regra.
- Tabela nova de regras e coluna `polp_type` em `transactions`, na migration
  `00034_transaction_nature_rules.sql`.

**O que não foi verificado — registrar com todas as letras:**

- A migration `00034` foi **escrita e nunca aplicada a banco nenhum**. Não há
  banco local neste ambiente; `DATABASE_URL` aponta para o Supabase de
  produção, e aplicar migration ali não é uma decisão para tomar sozinho.
- Nenhum passo deste plano — regra criada, backfill rodado, suspeitos
  detectados sobre dado real — **rodou contra os dados de produção** (as 739
  transações da seção 1). Tudo o que existe tem cobertura de teste unitário
  (funções puras, mocks), não execução real.
- Portanto: os números da versão anterior desta seção (R$ 635 mil em
  "despesa", os R$ 106 mil de fatura, os R$ 125 mil de CDB) **não foram
  reconferidos** depois da implementação. Não há confirmação de que a
  reclassificação, aplicada de fato, resolve esses casos específicos — só de
  que a lógica está implementada e testada isoladamente.

Quem retomar por aqui precisa aplicar a migration num ambiente seguro, rodar o
fluxo contra os dados reais e só então considerar a linha "Categorização" da
tabela da seção 1 verdadeiramente resolvida para a conta corrente.

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

A camada de reclassificação de natureza (seção 2) está implementada, mas o
primeiro passo de qualquer retomada é aplicar a migration `00034` num ambiente
seguro e rodar o fluxo contra dado real — sem isso, nada do que segue pode
assumir que o problema da conta corrente está de fato resolvido.

Feito isso, o que continua aberto é a lista de decisões pendentes da seção 3,
nenhuma delas tocada por este plano:

- **#2 — parear as duas pernas do pagamento de fatura com `transfer_group_id`.**
  A reclassificação de natureza foi desenhada para resolver a *conta
  corrente* (o débito automático viraria transferência, não despesa), mas
  isso ainda depende de ser exercitado contra os dados reais (seção 2). Mesmo
  quando confirmado, o pareamento não liga essa perna à compra correspondente
  no extrato do cartão — as duas continuam existindo soltas, cada uma no seu
  extrato.
- **#1 — conta "Banco Itaú" duplicada**, com 122 transações de OFX sem vínculo
  num período que já existe na conta conectada via Open Finance.
- **#3 — saldo inicial da conta corrente** nunca ajustado para o começo do
  histórico importado (~R$ 3.677 no floow contra ~R$ 271 informado pelo Itaú).
- **#4 — contas de cartão órfãs** ("Cartão PDA", "Cartão Master Black",
  "teste"), zero transações, provavelmente anteriores ao vínculo atual.

E os itens da seção 6, que seguem inexistentes: webhook (`/api/webhooks/polp`),
sincronização automática pelo cron diário, produtos além de conta e cartão
(crédito, investimentos, câmbio), e as variáveis `POLP_API_CLIENT`,
`POLP_API_SECRET` e `POLP_CPF_SALT` em produção.
