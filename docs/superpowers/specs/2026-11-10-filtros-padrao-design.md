# Filtros padronizados e jornada entre telas

Data: 10/11/2026. Etapas B e C da revisão de filtros. A etapa A (links quebrados) saiu antes, no commit 41ce1a8 da branch `fix/filtros-links-quebrados`.

## Por que

Cada tela resolveu filtro do seu jeito. Hoje há três modelos de período, quatro lugares onde o filtro fica guardado (cookie, localStorage, só URL, nada), cinco seletores de conta e nenhuma tela compartilha recorte com outra. Quem escolhe "março, Itaú" em Transações e abre Análises volta para "últimos 12 meses, todas as contas". Quem vê um total de categoria em Análises, Cartões ou Gastos não consegue abrir os lançamentos daquele total: só dá para ir lançamento a lançamento.

## Decisão já tomada pelo Ricardo

**O recorte vai junto.** Período e contas são um contexto só, que vale em todas as telas de finanças. Escolher em uma tela muda nas outras.

## Objetivos

1. Um recorte compartilhado (período + contas) entre Transações, Conta, Análises (Fluxo de caixa e Cartões), Orçamentos (Gastos, Ritmo, Investir) e Dívidas.
2. Um conjunto único de controles de filtro, com o mesmo visual, rótulos e comportamento em todas as telas.
3. Do total ao lançamento em um clique: todo total de categoria/mês abre Transações já filtrada.
4. No celular, todos os filtros alcançáveis, inclusive categoria, tipo, valor e ordem.

## Fora do escopo

- Filtros novos em telas que hoje não têm (Recorrentes, Conciliar, Renda Passiva, Bens, Planejamento, CFO). Ficam para depois, se aparecer a necessidade.
- Investimentos entrar no recorte compartilhado. Lá as contas são outras (só as que guardam ativo). Investimentos ganha só a correção de não perder a conta escolhida (ver "Investimentos").
- Novos itens de menu. Nada vira item de sidebar.
- Tema escuro, redesenho visual das telas.

## Anti-objetivos (falha mesmo se funcionar)

- **Voltar o "Limpar tudo".** Ele foi tirado de propósito (`transaction-filters.tsx`, comentário acima de `TransactionFilters`): soltar o período levava a busca e a conta junto. Cada filtro continua se desligando onde foi ligado.
- **Filtro escondido.** Nenhum filtro pode estar ativo sem aparecer na tela, em qualquer largura.
- **Surpresa de contexto.** Se a tela abriu com um recorte que veio de outra, isso tem que estar visível nos próprios controles (o seletor mostra "Março 2026", a pílula de conta mostra "Itaú"). Nada de recorte aplicado sem rastro.
- **Histórico poluído.** Trocar filtro usa `router.replace`, não `push`. O botão Voltar do navegador sai da tela, não desfaz filtro por filtro. Hoje Orçamentos e Dívidas usam `push`; passam a `replace`.

## O recorte compartilhado

### O que entra

| Parte | Formato na URL | Observação |
|---|---|---|
| Período | `startDate`, `endDate` (`YYYY-MM-DD`) | Atalho relativo (ex.: "Últimos 3 meses") é guardado como atalho, para continuar relativo amanhã. Já é assim no cookie `tx-filters` (`filtros-lembrados.ts`). |
| Contas | `accountId` (csv de ids) | Vazio = todas. |

Busca, tipo, categoria, valor, finais de cartão, futuros e ordenação **não** entram no recorte compartilhado. São da tela.

### Onde fica guardado

- **A URL é a fonte da verdade** em toda tela. Link copiado reproduz a tela.
- **Um cookie só**, `recorte`, guarda o último período e contas escolhidos em qualquer tela. Substitui `tx-filters` (só a parte de período e contas) e `tx-accounts`, e o período/contas do localStorage `fluxo-de-caixa:preferencias`. Cookie e não localStorage porque o servidor precisa dele para redirecionar antes de renderizar, como Transações já faz.
- Chegar numa tela sem período/contas na URL redireciona para a URL com o recorte do cookie (mecanismo atual de `transactions/page.tsx`, generalizado).
- Preferências que não são recorte (tipo de gráfico, "mostrar valores", visão realizado/projetado, "ocultar transferências", tamanho da página) continuam onde estão hoje.
- Migração: quem já tem `tx-filters`/`tx-accounts` não perde o que escolheu. Na primeira leitura sem `recorte`, ler dos antigos.

### Como cada tela usa o recorte

| Tela | Período | Contas |
|---|---|---|
| Transações | intervalo, como hoje | sim |
| Conta (`/accounts/[id]`) | intervalo | não (a conta é a da rota); não grava contas no recorte |
| Análises · Fluxo de caixa | intervalo | sim |
| Análises · Cartões | intervalo (hoje é fixo em 12 meses) | só cartões; contas do recorte que não são cartão são ignoradas nesta tela, sem apagar do recorte |
| Gastos, Ritmo, Investir, Dívidas (parcelados) | **mês**: o mês do `endDate` do recorte | não filtram por conta hoje e continuam sem filtrar |

Telas de mês (Orçamentos, Dívidas): as setas de mês gravam no recorte o mês inteiro (1º ao último dia). Assim ir de Gastos (outubro) para Transações abre outubro.

Quando o recorte não tem fim ("Todo o período", ou só início), as telas de mês usam o mês atual em São Paulo.

As telas de mês **mantêm `?month=YYYY-MM-01` na URL** (os links internos, como Gastos → Ritmo e o simulador, seguem valendo). *Decisão de quem escreveu, não do Ricardo.*

**Toda chegada com recorte explícito na URL grava o recorte**, em qualquer tela: `startDate`/`endDate`/`accountId` nas telas de intervalo, `month` nas de mês (vira o mês inteiro). É a regra que Transações já segue ("quem chega por link com filtro também conta como último uso"). Sem isso, abrir Gastos em outubro por um link e depois ir a Transações mostraria o recorte antigo. *Decisão de quem escreveu.*

### Visão Realizado/Projetado em Análises

A visão não entra no recorte. Hoje Análises troca o período quando a visão muda e vice-versa (`cash-flow-client.tsx`, `escolherPeriodo`/`trocarVisao`). Fica assim:

- Clicar em uma visão que esvazia o período (ex.: Projetado com período só no passado) estica o período, como hoje, e **grava** no recorte. É um clique do usuário, e o novo período aparece no seletor.
- Ao abrir Análises, a visão vem da preferência salva da tela, exceto quando o período do recorte está todo no futuro (abre em Projetado) ou todo no passado com a preferência em Projetado (abre em Realizado). Assim a tela nunca abre vazia por causa de um recorte escolhido em outra tela.

*Decisão de quem escreveu.*

### Universos de conta diferentes

Transações hoje esconde contas de investimento; Análises mostra todas. O recorte guarda ids. Cada tela mostra no seletor só as contas que fazem sentido para ela e aplica só as que reconhece. Se o recorte tem contas e nenhuma vale na tela, a tela abre em "Todas as contas" e o seletor diz isso. O recorte não é alterado por essa tela até o usuário mexer no seletor dela.

### Defaults sem recorte guardado

Primeira visita, ou cookie vazio: **Este mês** em todas as telas (minha escolha; hoje Transações abre em "Todo o período" e Análises em "Últimos 12 meses"). Motivo: é o recorte que funciona igual em todas, inclusive nas de mês, e a pergunta mais comum é "como está este mês".

### Análises com período longo

Hoje Análises carrega só 24 meses (`getRecentTransactions(orgId, 24)`) e corta "Todo o período" sem aviso. Com o recorte compartilhado isso vira bug visível. A consulta passa a respeitar o período escolhido. O export (`/api/cash-flow/export`) passa a respeitar o recorte da tela.

## Controles padronizados

Um conjunto só de componentes em `components/finance/filtros/`, usados por todas as telas acima. Substituem as versões duplicadas de hoje.

1. **Seletor de período.** Um componente com: botão de atalhos (os grupos de `PERIOD_GROUPS`), setas de mês ao lado, e datas inicial/final com × em cada uma. Junta `PeriodFilter`, `MonthNavigator`, `CashFlowPeriodFilter` e o trecho inline de `TransactionFilters`. Telas de mês usam o mesmo componente em modo "mês" (só setas e rótulo do mês). O `shiftMonth` duplicado em quatro arquivos vira uma função só.
2. **Lista com caixas.** Um popover genérico com item "Todos/Todas…", lista de caixas, fecha com clique fora **e com Esc**, foco volta ao botão. `AccountFilter` (com atalho por titular), `CardDigitsFilter` e `CategoryFilter`/`TypeFilter` passam a usar a mesma base. Cartões troca os `Select` de escolha única por ele (cartão e categoria, categoria por id e não por nome).
3. **Pílula liga/desliga.** Uma classe só para pílula ativa e inativa (hoje `PILL_BASE/PILL_OFF` copiados em dois arquivos, `MostrarEncerrados` com outra altura, futuros em âmbar). Ativa = fundo escuro, como hoje. Exceção mantida: "Lançamentos futuros" segue âmbar, porque sinaliza dado que ainda não aconteceu.
4. **Leitura e escrita da URL.** Um hook só para "trocar estes parâmetros, manter os outros, tirar `page`, `replace` sem scroll, gravar o recorte". Hoje isso está copiado em `TransactionFilters`, `TransactionListWrapper`, `FiltroDeContaDaCarteira`, `MostrarEncerrados` e nas telas de mês.

Rótulos neutros padronizados: "Todo o período", "Todas as contas", "Todos os cartões", "Todas as categorias", "Todos os tipos". "Todos os finais" passa a "Todos os finais do cartão".

### Celular

Toda tela com mais de dois filtros usa o padrão que Transações já tem: período e setas sempre visíveis, o resto atrás de um botão **Filtros** com contador. O botão abre uma gaveta de baixo (sheet) em vez de expandir a linha. A gaveta inclui categoria, tipo, valor e ordenação, que hoje só existem no cabeçalho da tabela do desktop. O contador conta tudo que a gaveta contém.

## Do total ao lançamento (etapa C)

Todo número que é soma de lançamentos por categoria e/ou mês vira link para Transações com `startDate`/`endDate` do mês (ou do período da tela), `categoryIds` e as contas da tela. Lugares:

- Análises · Fluxo de caixa: células do detalhamento por categoria × mês.
- Análises · Cartões: barra do mês e linha de categoria (com a conta do cartão).
- Gastos e Ritmo: linha de cada categoria (mês da tela). No Ritmo, o dialog da categoria ganha "ver todos no mês".
- Dashboard: receitas e despesas do mês nos cards de resumo.

Categoria com subcategorias leva os ids da pai e das filhas.

**A lista tem que somar exatamente o total clicado** (decisão do Ricardo). Cada link leva os mesmos critérios que produziram o número, e não só período e categoria:

- Gastos e Ritmo somam só `type=expense`, `reviewState=confirmed`, `isIgnored=false`, realizado (`somenteRealizado`) e que afeta o caixa (`effectiveAffectsCashFlow`), conforme `getSpendingByCategory`.
- Fluxo de caixa depende de "ocultar transferências" e da visão (Projetado precisa de `future=1`).
- Os cards do Dashboard têm a regra deles.

Transações ganha os filtros que faltam para reproduzir esses critérios, **visíveis na barra de filtros**, desligáveis um a um como os outros (ex.: "Só despesas", "Só confirmadas", "Só realizadas", "Sem transferências"). Nada de critério aplicado em silêncio. Para garantir que bate, cada link tem um teste que compara a soma da consulta da tela de origem com a soma da consulta de Transações para os mesmos parâmetros.

### Cartões abre a fatura

Em Cartões cada barra é uma fatura, não um mês do calendário (`getGastosDosCartoes` agrupa por fechamento). Decisão do Ricardo: clicar abre **os lançamentos daquela fatura** na conta do cartão, com o período do ciclo (abertura até fechamento). O seletor de período de Cartões passa a significar "faturas que fecham no período". Se o critério de ciclo não reproduzir o total (parcela de compra antiga, lançamento com `bill_id` fora do intervalo), Transações ganha um filtro visível por fatura em vez de intervalo de datas. Quem constrói decide qual dos dois, pelo teste de soma acima.

Abrir Transações por um desses links **grava** o recorte (período e contas), porque é o usuário escolhendo um recorte. Categoria não entra no recorte.

## Investimentos

Fora do recorte compartilhado, mas a conta escolhida em Posições para de se perder: as abas de Investimentos, o "Voltar" do ativo e o fim dos formulários levam o `accountId` atual. Sem cookie: ao sair de Investimentos pela sidebar, volta a "Todas as contas". Investimentos usa os mesmos controles padronizados (lista com caixas, pílula), e o filtro de conta passa a mostrar o atalho por titular.

## O que fica com quem constrói

- Nomes de arquivos e componentes dentro de `components/finance/filtros/`.
- Ordem de migração das telas, desde que cada passo deixe o app funcionando e vá para produção sozinho.
- O componente de gaveta no celular (há `components/ui`; se não houver sheet, usar o Dialog do Radix já instalado, sem dependência nova).
- Como representar o atalho relativo no cookie `recorte` (o formato de `tx-filters` serve).

## Restrições

- Arquivos com no máximo 500 linhas (`CLAUDE.md`).
- Datas no calendário de São Paulo (`hojeEmSaoPaulo`, `saoPauloToday`), nunca `new Date()` do servidor para decidir mês.
- Acesso a banco por `withUserDb` (teste `rls-ledger`).
- Testes mockam o banco: consultas novas de Análises com período longo precisam ser conferidas no banco real com rollback antes de ir para produção.
- Textos visíveis passam pela skill `humanizer`.
