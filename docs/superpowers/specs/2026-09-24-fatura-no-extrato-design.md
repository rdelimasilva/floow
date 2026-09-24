# Total da fatura no extrato do cartão — design

Data: 2026-09-24 · Status: aprovado em conversa

## Objetivo

Com um cartão selecionado no filtro de Transações, ver uma linha com o total
da fatura na data de fechamento, sem impacto em saldo nem fluxo de caixa.

## Decisões

1. **Dia de fechamento e de vencimento na conta**: `accounts.closing_day` e
   `accounts.due_day` (`smallint null`, 1..31). Dia maior que o mês vira o
   último dia. Só aparecem no cadastro de cartão de crédito.
2. **Composição por ciclo de data**, com uma exceção:
   - lançamento comum → primeiro fechamento ≥ data;
   - parcela do Open Finance (`purchase_date` e `installment_total > 1`) →
     último fechamento < data, porque a data dela já é o vencimento da fatura
     (ver `2026-09-24-parcelas-do-cartao-design.md`).
3. **Soma**: despesas, estornos e previsões de parcela. Fora: transferência
   (o pagamento da fatura), ignorado e previsão já conciliada.
4. **Filtro não muda total**: busca, categoria, tipo e valor escolhem o que
   aparece; a fatura é sempre a do cartão inteiro.
5. **Linha virtual**: calculada na consulta, nunca gravada. Não entra em
   saldo, fluxo, meta, export nem paginação.

## Tela

- Uma linha por fechamento dentro do intervalo de datas da página (recortado
  pelo filtro de período), só na ordenação por data.
- Sem checkbox e sem ações; coluna Saldo vazia.
- Limite conhecido: fechamento que cai exatamente entre a última linha de uma
  página e a primeira da seguinte não aparece em nenhuma das duas.

## Código

- Regra pura: `packages/core-finance/src/fatura.ts`.
- Consulta: `apps/web/lib/finance/queries-fatura.ts`.
- Intercalação na lista: `apps/web/lib/finance/intercalar-faturas.ts`.
- Linha: `apps/web/components/finance/fatura-row.tsx`.
