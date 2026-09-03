# Reclassificação de natureza das transações Open Finance — design

**Data:** 2026-09-03
**Estado anterior:** `docs/superpowers/plans/2026-09-03-openfinance-estado-e-proximos-passos.md`
**Spec da ingestão:** `docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md`

---

## 1. O problema

A ingestão funciona: 739 transações entraram, zero rejeitadas. Os cartões vieram
com dado limpo. A conta corrente não.

Cerca de R$ 635 mil entraram como despesa em 12 meses de conta corrente, e boa
parte não é gasto. Dois grupos respondem por R$ 231 mil disso:

| Grupo | Valor | O que a Polp manda | O que é |
|---|---|---|---|
| `Débito automático PERS BLACK …` (9x) | ~R$ 106 mil | `type: TARIFA_SERVICOS_AVULSOS`, `category_ref: BANK_FEES_OTHER_BANK_FEES` | pagamento da fatura de um cartão que já está conectado |
| `Aplicação CDB DI` (14x) | ~R$ 125 mil | `type: OUTROS`, `category_ref: OTHER` | aplicação em investimento |

O primeiro é dupla contagem pura: as compras do cartão entraram uma a uma **e** o
pagamento da fatura entrou como despesa. O `creditCardConnected` do normalizador
existe justamente para impedir isso, e funciona — só que ele reconhece pagamento
de fatura por `category_ref = LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`, e nestes nove a
Polp não usou esse rótulo.

O segundo é a Polp classificando a mesma operação de dois jeitos na mesma conta:
`Saída APLICACAO CDB DI` vem com `category_ref` de transferência e vira
transferência; `Aplicação CDB DI` vem com `OTHER` e vira despesa.

Nenhuma das três fontes disponíveis resolve sozinha. O `type` estruturado vem
`OUTROS` nos casos mais caros. O `category_ref` erra de formas contraditórias na
mesma conta. A descrição é a única que identifica o pagamento de fatura, e
depende de saber que aquele nome é o cartão *daquele* usuário — coisa que só o
usuário pode afirmar.

Enquanto isso não existe, o orçamento e o pacing sobre a conta corrente mentem.

---

## 2. Escopo

**Entra:**

1. Reclassificação determinística pelo `type` do BCB, no normalizador.
2. Tabela de regras de natureza, criadas pelo usuário, aplicadas na ingestão e
   retroativamente ao que já está gravado.
3. Detector de grupos suspeitos, que sugere e **nunca aplica sozinho**.
4. Banner e painel de revisão em `/transactions`, e reclassificação a partir da
   linha do extrato.

**Fica fora, de propósito:**

- **Pareamento das duas pernas com `transfer_group_id`** (decisão #2 do
  documento de estado). Transferência de perna única já mantém o saldo correto e
  sai da agregação de despesa, que é o que conserta o orçamento. Além disso
  `transfer_group_id` preenchido torna a linha não editável
  (`apps/web/lib/finance/actions.ts:727`) e faz apagar uma perna apagar a outra —
  consequência grande para um ganho que é só de apresentação.
- **Casamento por valor com a fatura do cartão.** Era o terceiro sinal da seção
  2.4 do documento de estado. É reforço de uma regra que já vai estar confirmada
  pelo usuário: não muda desfecho nenhum e custa consulta cruzada por transação.
- **Decisões #1, #3 e #4** do documento de estado (conta "Banco Itaú" duplicada,
  saldo inicial da conta corrente, contas de cartão órfãs). São limpeza de dados,
  não este subsistema.

---

## 3. Arquitetura: três camadas, em ordem de confiança

```
Polp
 │
 ├─ normalizeAccountTransaction / normalizeCardTransaction     [puro, core-finance]
 │    camada 1: type estruturado do BCB → natureza
 │
 ├─ normalizeBatch                                             [apps/web]
 │    item defeituoso não derruba o lote
 │
 ├─ applyNatureRules                                           [puro, apps/web]
 │    camada 2: regra confirmada pelo usuário → natureza
 │
 └─ persistPage
      grava; saldo se move por amount_cents, nunca por type
```

O normalizador **continua puro e determinístico**. Ele não sabe que regras de
usuário existem. A reclassificação por regra é outra camada, em
`apps/web/lib/openfinance/`, e a fronteira entre as duas é o que mantém o
normalizador testável sem banco.

### Camada 1 — determinística, em `normalize.ts`

`normalizeAccountTransaction` passa a olhar `tx.type`:

| `PolpAccountTransactionType` | Natureza | Por quê |
|---|---|---|
| `APLICACAO_FINANCEIRA` | `transfer` | dinheiro saiu da conta e entrou em investimento; não é gasto |
| `RESGATE_APLIC_FINANCEIRA` | `transfer` | volta do investimento; não é receita nova |
| `TRANSFERENCIA_SALDO_RESERVADO` | `transfer` | movimentação interna da própria conta |
| `RENDIMENTO_APLIC_FINANCEIRA` | `income` | rendimento é receita de verdade, e continua sendo |

Não é palpite: é o enum do Banco Central. Precedência sobre o `category_ref`,
porque quando os dois discordam é o `category_ref` que está errado — foi
exatamente o que aconteceu no caso `Aplicação CDB DI`.

Isso resolve parte do problema sem perguntar nada ao usuário. Não resolve os
casos que vêm `OUTROS`, que são os mais caros — daí a camada 2.

### Camada 2 — regra confirmada pelo usuário

Nova tabela, aplicada por uma função pura entre `normalizeBatch` e `persistPage`.
Detalhada na seção 4.

---

## 4. Modelo de dados

### 4.1 `transaction_nature_rules`

```sql
CREATE TABLE transaction_nature_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- NULL = vale para a org inteira. Preenchido = so naquela conta.
  account_id  uuid REFERENCES accounts(id) ON DELETE CASCADE,
  match_type  text NOT NULL CHECK (match_type IN ('contains', 'exact')),
  match_value text NOT NULL,
  nature      transaction_type NOT NULL,
  priority    integer NOT NULL DEFAULT 0,
  is_enabled  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transaction_nature_rules_org ON transaction_nature_rules(org_id);
```

Reusa o enum `transaction_type` que já existe — não há razão para um segundo
vocabulário de natureza no banco.

**Por que tabela nova e não extensão de `category_rules`.** Em
`category_rules`, `category_id` é `NOT NULL` e `matchCategory()` devolve uma
categoria. Acomodar natureza ali exigiria tornar aquela coluna nula e pôr um
branch em cada consumidor, inclusive nos que nada têm a ver com natureza. E são
conceitos distintos: categoria diz *em que* o dinheiro foi, natureza diz *se* foi
dinheiro saindo. Uma regra de categoria nunca deveria poder mudar saldo de
orçamento por acidente.

**Precedência.** Primeira regra que casa vence, na ordem:
`account_id IS NOT NULL` primeiro (regra de conta específica ganha da regra da
org), depois `priority DESC`, depois `created_at DESC`. Quem carrega as regras
filtra `is_enabled = true` antes — mesma armadilha de `matchCategory`, que não
olha o campo.

**O casamento é só pela descrição.** Considerei casar também por
`category_ref + polp_type`, para a regra sobreviver ao enrichment que troca a
descrição depois. Rejeitado: `TARIFA_SERVICOS_AVULSOS + BANK_FEES_OTHER_BANK_FEES`
também é a assinatura de tarifa bancária legítima, e uma regra assim
transformaria tarifa de verdade em transferência em silêncio. Reclassificar
errado é pior que deixar de reclassificar — e o segundo caso se conserta sozinho:
o detector da seção 5 roda a cada sincronização, o grupo volta a aparecer no
banner com a descrição nova, e o usuário confirma de novo.

### 4.2 `transactions.polp_type`

Coluna nova, `text NULL`. O detector precisa do `type` da Polp como sinal
estrutural, e ele hoje se perde depois da normalização.
`NormalizedPolpTransaction` ganha o campo `polpType`, e `persistPage` o grava
nos **dois** ramos: no `INSERT` da transação nova e no `UPDATE` de
enriquecimento da que já existe. Vale também como trilha de diagnóstico, do
mesmo jeito que `category_ref` cru já é guardado.

**A coluna guarda só o `AccountTransactionType`.** Transação de cartão deixa
`polpType` nulo. O `transaction_type` do cartão é outro enum
(`PAGAMENTO_FATURA`, `ESTORNO`, `CASHBACK`…), já é consumido inteiro por
`cardType()`, e enfiar os dois no mesmo campo criaria exatamente a confusão que o
cabeçalho de `polp-types.ts` avisa: dois enums distintos em campos de nome
parecido. O detector só olha contas `checking`/`savings`, então nada se perde.

Nas linhas já importadas a coluna fica `NULL`. Não há backfill na migração: o
`sync` seguinte reencontra as transações pela janela de `fromUpdatedAt` e
preenche o campo no `UPDATE` de enriquecimento. Até lá o detector opera sem o
sinal (d), que nunca é decisivo sozinho.

---

## 5. Detecção — `apps/web/lib/openfinance/nature-suspects.ts`

Função pura. Recebe as transações candidatas e os cartões conectados, devolve
grupos ordenados por valor com o motivo de cada suspeita. **Não escreve nada.**

**Candidatas:** transações de contas `checking` ou `savings`, com `external_id`
não nulo (origem Open Finance), `type = 'expense'`, `transfer_group_id IS NULL`,
e que nenhuma regra de natureza já cubra.

**Agrupamento** pela descrição normalizada: maiúsculas, sem acento, sequências
numéricas e de data removidas, espaços colapsados. A descrição crua é preservada
ao lado, porque os quatro dígitos finais do cartão são sinal e a normalização os
apagaria.

### Os quatro sinais

**(a) Casa com um cartão conectado.** Tokeniza o nome do recurso
`CREDIT_CARD_ACCOUNT` (`"PERSONNALITE MC BLACK"`), descarta tokens genéricos
(`CARTAO`, `CARD`, `MC`, `VISA`, `MASTER`, `ELO`, `CREDITO`), e casa o restante
por prefixo de no mínimo 4 caracteres — é assim que `PERS BLACK` casa com
`PERSONNALITE` e com `BLACK`. Também casa o `identification_number` (últimos 4
dígitos) quando ele aparece na descrição crua.

Exige **dois** tokens distintivos casando, **ou** um token mais uma das
expressões `debito automatico`, `pagamento`, `fatura` na descrição. Um token só
faria `BLACK FRIDAY` virar suspeita de fatura.

**(b) Vocabulário de investimento.** Lista curada: `APLICACAO`, `RESGATE`, `CDB`,
`RDB`, `LCI`, `LCA`, `TESOURO`, `FUNDO`, `POUPANCA`, `PREVIDENCIA`. `DI` conta
apenas como token isolado, nunca como substring.

**(c) A Polp se contradiz na própria conta.** Para cada grupo suspeito, procura
na mesma conta um grupo já classificado como `transfer` cujos tokens distintivos
se sobreponham. É exatamente o par `Saída APLICACAO CDB DI` (transferência) e
`Aplicação CDB DI` (despesa). É o sinal mais forte do caso 2.2 do documento de
estado, e o único que não depende de vocabulário nenhum: é evidência do próprio
dado do usuário.

**(d) Reforço estrutural — nunca sozinho.** `category_ref` igual a `OTHER` ou da
família `BANK_FEES_*`, ou `polp_type` em `OUTROS` / `TARIFA_SERVICOS_AVULSOS`.
Eleva a confiança de (a), (b) ou (c). Isolado geraria lixo: metade da conta
corrente cai nesses rótulos.

### Corte e ordenação

O grupo aparece se tem **3 ou mais lançamentos** ou soma **R$ 1.000 ou mais** em
valor absoluto. Sem piso, o painel listaria quarenta grupos de R$ 30 e ninguém
abriria o segundo. Ordenação por soma absoluta decrescente: o dinheiro grande
primeiro.

O piso é constante nomeada no módulo, não número solto no meio da condição.

---

## 6. Interface

Nenhuma rota nova.

**1. Banner em `/transactions`.** Quando há grupos suspeitos:

```
2 grupos - R$ 231.640 em despesa que pode nao ser gasto - revisar
```

Componente próprio e pequeno, para não engordar `transaction-list.tsx` (354
linhas hoje).

**2. Painel de revisão** — `apps/web/components/openfinance/nature-review-panel.tsx`,
sheet disparado pelo banner. Por grupo: descrição, contagem, soma, o motivo em
português claro, e dois botões.

```
+-- R$ 106.240 - 9 lancamentos ---------------------+
| "Debito automatico PERS BLACK..."                 |
| -> casa com seu cartao PERSONNALITE MC BLACK,     |
|    que esta conectado ao floow                    |
|              [E despesa mesmo]  [E transferencia] |
+---------------------------------------------------+
```

**Os dois botões criam regra.** `É despesa mesmo` grava `nature = 'expense'`,
não conserta nada e **silencia o grupo para sempre**. Sem esse caminho o alerta
reaparece a cada sincronização, e um alerta que não se resolve é um alerta que se
aprende a ignorar.

**3. Na linha do extrato.** `transaction-display-row.tsx` já tem `onCreateRule`
(ícone Zap) para criar regra de categoria a partir de uma linha. Entra o irmão
para natureza: muda a natureza daquela linha e pergunta "aplicar às outras N com
esta descrição?". É o padrão que o usuário já conhece no app, não uma invenção.

Nenhum arquivo passa de 500 linhas: o painel e o banner são arquivos novos.

---

## 7. Backfill e integridade

`createNatureRule` — server action em `apps/web/lib/openfinance/nature-actions.ts`:

1. `getOrgId()`, valida a entrada com Zod.
2. Insere em `transaction_nature_rules`.
3. `UPDATE transactions SET type = <nature>, updated_at = now()` filtrando por
   `org_id`, o casamento da regra, o `account_id` da regra quando houver,
   `external_id IS NOT NULL` e `transfer_group_id IS NULL`.
4. Devolve a contagem de linhas alteradas, para o toast dizer "9 lançamentos
   reclassificados".
5. `revalidateTransactionData`, `revalidateAccountData`, `revalidateSnapshotData`.

**As duas cercas do passo 3 são o coração da segurança.**
`external_id IS NOT NULL` garante que só dado vindo do Open Finance é tocado —
lançamento manual do usuário nunca. `transfer_group_id IS NULL` garante que perna
de transferência pareada fica intacta, porque mexer numa perna sem a outra
desequilibra o par.

**O saldo não entra nesta consulta em momento nenhum.** Mudar natureza não toca
`amount_cents` nem `balance_cents`: o sinal já está correto desde a ingestão
(débito é negativo) e a agregação de despesa filtra por `type`. É isso que torna
seguro reescrever doze meses de histórico.

**`updateTransaction` não pode ser reusada para isso.** Ela recalcula
`newSignedAmount = type === 'income' ? +v : -v`
(`apps/web/lib/finance/actions.ts:729`). Um resgate de CDB é transferência de
valor **positivo**; passar por ali o tornaria negativo e o saldo quebraria em
silêncio, que é o pior desfecho possível num app de finanças. A ação de natureza
altera `type` e nada mais.

---

## 8. Testes

TDD, puros primeiro.

`packages/core-finance/src/__tests__/openfinance/normalize.test.ts`
- `APLICACAO_FINANCEIRA`, `RESGATE_APLIC_FINANCEIRA` e
  `TRANSFERENCIA_SALDO_RESERVADO` → `transfer`, inclusive quando o
  `category_ref` diz outra coisa.
- `RENDIMENTO_APLIC_FINANCEIRA` → `income`.
- `polpType` chega no resultado da transação de conta, e vem `null` na de cartão.
- Regressão do que já passa, em especial o caminho `creditCardConnected`.

`apps/web/__tests__/openfinance/nature-rules.test.ts`
- Regra de conta específica ganha da regra da org.
- Empate resolvido por `priority`, depois por `created_at`.
- `is_enabled = false` é ignorada.
- `contains` e `exact` com acento e caixa diferentes.
- Nenhuma regra casando devolve a natureza que veio da camada 1, intacta.

`apps/web/__tests__/openfinance/nature-suspects.test.ts`
- Os dois casos reais do documento de estado como fixture: os 9 de
  `Débito automático PERS BLACK` (sinal a) e os 14 de `Aplicação CDB DI`
  (sinais b e c).
- **Caso negativo obrigatório:** `Aluguel` 12× R$ 4.000 e `Mensalidade escola`
  12× R$ 2.600 **não** podem ser sugeridos. Sem este teste a detecção vira
  gerador de falso positivo e o usuário deixa de confiar no banner.
- `BLACK FRIDAY` não casa com o cartão `PERSONNALITE MC BLACK` (um token só).
- Grupo de 2 lançamentos somando R$ 40 fica abaixo do corte.
- Sinal (d) sozinho não produz sugestão.

Integração
- `createNatureRule` não altera `balance_cents` de conta nenhuma — asserção
  explícita, comparando antes e depois.
- `createNatureRule` não toca linha com `external_id IS NULL`.
- `createNatureRule` não toca linha com `transfer_group_id` preenchido.

---

## 9. Alternativas rejeitadas

**Mais um `if` no normalizador.** Foi o que trouxe o problema até aqui: o
reconhecimento de pagamento de fatura por um único `category_ref`. As três fontes
de informação da Polp se contradizem, e nenhum `if` resolve contradição — só
escolhe qual erro cometer.

**Inferir sozinho pela descrição e aplicar.** Repetiria o erro que a decisão D5
da spec de ingestão evitou (casar conta bancária automaticamente). Só o usuário
sabe que `PERS BLACK` é o cartão dele; o app pode suspeitar, nunca afirmar. A
diferença entre sugerir e aplicar é a diferença entre uma ferramenta e um
gerador de dado errado.

**Tela dedicada de revisão de importação.** Era a proposta da seção 7 do
documento de estado. Rejeitada por duas razões: é superfície nova para manter, e
morre depois do mutirão inicial — não serve o dia a dia. O banner mais o painel
mais a linha do extrato cobrem o mutirão *e* o que a Polp errar no mês que vem.

**Sugerir só o que se prova por valor casado com a fatura.** Precisão alta,
cobertura baixa: não pegaria investimento nenhum, que é o maior número dos dois,
nem fatura de cartão que não está conectado.

---

## 10. Migração

`supabase/migrations/00034_transaction_nature_rules.sql`:

- `CREATE TABLE transaction_nature_rules` com o índice por `org_id`.
- `ALTER TABLE transactions ADD COLUMN polp_type text`.
- RLS na tabela nova no padrão que a 00026 consolidou:
  `org_id IN (SELECT public.get_user_org_ids())` nas quatro políticas, e
  `WITH CHECK` também no `UPDATE`, para o usuário não mover a linha de uma org
  dele para outra no meio da atualização. **Não** usar
  `app_metadata ->> 'org_id'`: essa chave não existe no token, a política avalia
  `NULL`, e o RLS trata `NULL` como falso.

Nenhum `UPDATE` de dado na migração. A reclassificação dos doze meses já
importados acontece quando o usuário confirma cada grupo, e é ele quem decide
quais.
