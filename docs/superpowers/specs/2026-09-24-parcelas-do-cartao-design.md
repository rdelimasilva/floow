# Parcelas do cartão como eventos futuros — design

Data: 2026-09-24 · Status: aprovado em conversa, aguardando revisão da spec

## Problema

A Polp manda cada parcela de compra parcelada como uma transação separada, com
`bill_post_date` da fatura em que ela cai (ITAUSHOP 10x chegou com as 10,
de 16/10/2026 a 16/07/2027). A importação grava em todas a data da compra
(`transaction_date_time`) e `balance_applied = true`. Resultado: as 10
parcelas contam como gasto de setembro e já estão no saldo do cartão.

Compras mais antigas (Airbnb 6x, Diroma 5x) chegaram só com as parcelas 1 e 2;
as futuras não vieram.

Hoje: 20 parcelas importadas do cartão. As 593 "Alimentação (n/61)" são
manuais e ficam fora.

## Objetivo para o usuário

Abrir um mês futuro e ver quanto já está comprometido com parcelas, sem
aprovar nada, e saber quanto ainda pode gastar em cada categoria.

## Decisões

1. **Data da parcela = vencimento da fatura** (`bill_post_date`).
2. **Parcelas que a Polp não mandou viram previsão**, substituída
   automaticamente pela real quando chega. Não vira recorrente: parcela de
   cartão é certa, tem fim e não se cancela pelo app; recorrente traria fila
   de conciliação e poluiria a tela de recorrentes.
3. **Na meta de gastos, parcela a vencer aparece como "comprometido"**, não
   sobe a meta e não conta como gasto antes de vencer.

## Design

### 1. Data da parcela na importação

- `normalizeCardTransaction` passa a devolver `date` = `billPostDate` quando a
  transação é parcela (`installmentTotal > 1`) e `purchaseDate` = data da
  compra (competência atual).
- Sem `bill_post_date` (fatura ainda não fechada): `bill_forecast_month` + dia
  de vencimento das outras parcelas já gravadas no mesmo cartão; sem
  referência, dia 1 do mês previsto. Esse fallback é resolvido no sync, que
  tem acesso ao banco.
- Compra à vista não muda.
- Coluna nova `transactions.purchase_date date null`.
- Parcela de data futura entra com `balance_applied = false`; o
  `applyDueBankTransactions` (`apps/web/lib/finance/apply-due.ts`) já a aplica
  quando o dia chega. Nenhum código novo para isso.
- Caminho de update do sync: pode corrigir `date` **apenas** se a linha ainda
  tem `balance_applied = false` (não afeta saldo). Valor segue imutável.

### 2. Previsão das parcelas faltantes

Módulo novo `completar-parcelas` (regra pura em `packages/core-finance`,
acesso ao banco em `apps/web/lib/openfinance`).

- Roda no sync, depois de importar cada cartão.
- **Grupo de parcelamento** = mesma conta + `purchase_date` +
  `installment_total` + valor dentro de 1% (a parcela 1 costuma diferir em
  centavos).
- Se o maior `installment_number` presente no grupo é menor que o total, cria
  as faltantes: valor e categoria da última parcela conhecida, descrição sem o
  sufixo "NN/NN", data = data da última parcela + k meses (mesmo dia).
- Marcação: coluna nova `transactions.is_installment_forecast boolean not null
  default false`. Sem `external_id` e sem `recurring_template_id`, então
  `applyDueBankTransactions` nunca a aplica e ela nunca entra no saldo nem no
  gasto realizado.
- **Substituição:** ao inserir parcela real, o sync procura previsão com mesma
  conta + `purchase_date` + `installment_total` + `installment_number`. Se
  achar, faz update da linha da previsão (external_id, valor, descrição, data,
  `is_installment_forecast = false`, `balance_applied` pela data) em vez de
  inserir. Casamento exato, sem fila.
- Idempotente: só cria número que não existe no grupo, nem real nem previsto.
- Previsão cuja data passou e a real não veio fica como previsão (não soma),
  igual à previsão de template.

### 3. Correção dos dados existentes (migração `00054`)

- Para as parcelas de cartão com `external_id`: `purchase_date = date`,
  `date = bill_post_date`.
- As que ficaram com data futura e `balance_applied = true`: estorna o valor
  no `accounts.balance_cents` e marca `balance_applied = false`, na mesma
  transação.
- As previsões das faltantes (Airbnb, Diroma) são geradas pelo próximo sync,
  não pela migração.

### 4. Comprometido na meta de gastos

- Consulta nova: soma, por categoria e mês, das parcelas de cartão não
  realizadas (`installment_total > 1`, `balance_applied = false`,
  `is_ignored = false`, reais futuras + previsões).
- Linha da meta ganha `parcelasAVencerCents` e as parcelas que o compõem
  (para listar na linha, como `recorrentes-na-linha.tsx` faz).
- Livre = meta − gasto realizado − parcelas a vencer.
- Aviso quando as parcelas a vencer passam da meta do mês, no mesmo formato do
  `abaixoDoPiso`.
- Aplicar nas quatro consultas que somam gasto contra meta, que precisam
  concordar entre si: `budget-queries.ts`, `budget-daily-queries.ts`,
  `budget-pacing-actions.ts`, `lib/cfo/budget-pacing-input.ts`.
- Nunca conta duas vezes: a parcela sai de "a vencer" e entra em "gasto" no
  mesmo update (`balance_applied` vira true).

### Tela

- Lista de transações mostra parcela como "Airbnb · 3/6 · compra em 27/07";
  previsão com o mesmo selo visual de previsão já usado.

## Restrições

- `apps/web/lib/openfinance/sync.ts` tem 495 linhas: a lógica nova sai em
  módulo próprio, e a parte de persistência de cartão é extraída antes de
  crescer (limite de 500 linhas do CLAUDE.md).
- `duplicata.ts` já trata parcelas distintas como não-duplicata; previsão não
  tem `external_id` e não entra na dedupe.

## Testes (TDD)

- normalize: parcela usa `bill_post_date`; à vista mantém data da compra;
  `purchaseDate` preenchido.
- sync: parcela futura entra com `balance_applied = false`; fallback de data
  sem `bill_post_date`; update corrige data só se não aplicada.
- completar-parcelas: cria só os números faltantes; agrupa por valor ±1%;
  rodar duas vezes não cria nada; parcela real ocupa a previsão sem duplicar.
- meta: parcela a vencer aparece em comprometido e não em gasto; ao vencer,
  migra sem contar duas vezes; as quatro consultas concordam.
- migração: estorno de saldo só nas linhas futuras que estavam aplicadas.

## Fora do escopo

- Parcelas manuais e recorrentes existentes.
- Importação por OFX.
- Fatura como entidade (fechamento/pagamento).
