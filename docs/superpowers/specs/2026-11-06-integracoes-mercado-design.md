# Integrações de dados de mercado

2026-11-06 · base para o agente de análise patrimonial (spec original: `spec-agente-analise-patrimonial.md`, de 05/11)

## Por que

O agente de investimentos precisa comparar a carteira com o mercado: retorno contra CDI, IPCA, Ibovespa e IFIX; taxa de administração do fundo contra a referência da categoria; liquidez real de cada fundo. Hoje o floow não tem nenhum dado de mercado. Preço só entra à mão (`asset_prices`, por org) ou como saldo da posição vindo do Open Finance.

Esta entrega é só a camada de dados. Regras, aba Diagnóstico e chat vêm depois e leem destas tabelas.

## Objetivos

- Baixar uma vez por dia, de fontes públicas e da brapi, os dados que as regras R01–R12 vão precisar.
- Guardar em tabelas globais (sem `org_id`), porque é dado público e igual para todo mundo.
- A análise nunca chama fonte externa em tempo real; lê só do banco.
- Começar a acumular histórico próprio de cotações já, porque o plano grátis da brapi só devolve 3 meses.

## Fora do escopo

- Regras, relatório, aba Diagnóstico, chat e base de conhecimento do agente.
- Avaliar ativos manuais com a cotação do dia (trocar o preço digitado pelo de mercado). Fica para depois. Esta entrega só deixa o dado disponível.
- Opções, futuros, debêntures, câmbio e cripto.
- Plano pago da brapi. Decisão adiada; o desenho tem que permitir trocar a fonte de fundos e Tesouro depois sem mexer em quem consome.

## Anti-objetivos

- Cron que falha em silêncio e deixa o dado velho sem ninguém saber.
- Baixar o mercado inteiro: só os fundos e tickers que alguma carteira tem, mais os índices.
- Chave da brapi no código, no frontend ou no repositório.

## Fontes

Todas verificadas em 06/11/2026.

| Fonte | URL | Tamanho | Atualiza | Dá |
| --- | --- | --- | --- | --- |
| BCB SGS | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa` | KB | diário | CDI diário (série 12, % ao dia), Selic diária (11), IPCA mensal (433) |
| CVM informe diário | `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_{AAAAMM}.zip` | ~12 MB zip no mês cheio | diário (madrugada) | cota (`VL_QUOTA`), PL, por `CNPJ_FUNDO_CLASSE` e `DT_COMPTC` |
| CVM extrato | `https://dados.cvm.gov.br/dados/FI/DOC/EXTRATO/DADOS/extrato_fi_{AAAA}.csv` | ~7 MB | algumas vezes por mês | `TAXA_ADM`, `TAXA_PERFM`, `QT_DIA_CONVERSAO_COTA`, `QT_DIA_PAGTO_RESGATE`, `CLASSE_ANBIMA`, `APLIC_MIN` |
| CVM cadastro | `https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv` | ~18 MB | diário | nome, classe, situação; reserva se o extrato não tiver o CNPJ |
| Tesouro Transparente | `https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv` | histórico completo | diário | taxa e PU de compra e venda por título e data |
| brapi (grátis) | `https://brapi.dev/api/v2/stocks/quote?symbols=X` e `/stocks/historical?symbols=X&range=3mo&interval=1d` | KB | 30 min | cotação de ação, FII, ETF, `^BVSP`, `IFIX` |

Limites do plano grátis da brapi, testados com tickers fora da amostra: 1 ticker por chamada, 1 chamada simultânea, histórico só até `3mo`, 15 mil chamadas em 30 dias corridos. `/fii/*`, `/funds/*`, `/treasury/*`, `/macro` e `/prime-rate` exigem plano pago. Atenção: PETR4, VALE3, MXRF11, JURO11 e alguns títulos do Tesouro são sandbox e respondem tudo; não servem para testar limite.

Separadores e encoding: os CSVs da CVM usam `;` e vêm em latin-1. O do Tesouro usa `;`, vírgula decimal e data `dd/MM/aaaa`. O SGS devolve valor como string com ponto decimal.

## Tabelas novas

Todas globais, sem `org_id`. RLS ligado, com policy de `SELECT` para `authenticated` (`using (true)`) e nenhuma de escrita. O dado é público, e depois do cutover do ADR 0001 o caminho do app passa a rodar como `authenticated`: sem a policy, a leitura voltaria vazia sem erro. Os jobs escrevem com `getServiceDb()`. Migration `00084_dados_de_mercado.sql` mais o schema Drizzle em `packages/db`.

**`indicadores_diarios`**: uma linha por série e data.

| Campo | Tipo | Nota |
| --- | --- | --- |
| `serie` | text | `cdi`, `selic`, `ipca` |
| `data` | date | para o IPCA, o primeiro dia do mês |
| `valor` | numeric(18,8) | como a fonte publica: CDI e Selic em % ao dia, IPCA em % ao mês |
| PK | (`serie`, `data`) | |

**`cotacoes_b3`**: fechamento diário por ticker.

| Campo | Tipo | Nota |
| --- | --- | --- |
| `ticker` | text | normalizado em maiúsculas, sem `.SA` (a brapi devolve `IFIX.SA`; gravamos `IFIX`) |
| `data` | date | |
| `fechamento` | numeric(18,6) | |
| PK | (`ticker`, `data`) | |

**`cotas_fundos`**: cota diária por CNPJ.

| Campo | Tipo | Nota |
| --- | --- | --- |
| `cnpj` | text | só dígitos, 14 caracteres |
| `data` | date | |
| `cota` | numeric(28,12) | |
| `patrimonio` | numeric(20,2) | |
| PK | (`cnpj`, `data`) | |

**`fundos_cvm`**: o último extrato conhecido por CNPJ.

| Campo | Tipo | Nota |
| --- | --- | --- |
| `cnpj` | text PK | só dígitos, como está em `assets` |
| `cnpj_classe` | text | o CNPJ usado no informe diário; igual a `cnpj` quando casa direto |
| `nome` | text | |
| `classe_anbima` | text | base da taxa de referência por categoria |
| `taxa_adm` | numeric(10,4) | % a.a., `null` se a fonte não informa |
| `taxa_performance` | numeric(10,4) | |
| `dias_conversao_resgate` | integer | `QT_DIA_CONVERSAO_COTA` |
| `dias_pagamento_resgate` | integer | `QT_DIA_PAGTO_RESGATE`; liquidez = conversão + pagamento |
| `data_referencia` | date | `DT_COMPTC` do extrato usado |
| `atualizado_em` | timestamptz | |

**`tesouro_precos`**: taxa e PU por título e data.

| Campo | Tipo | Nota |
| --- | --- | --- |
| `tipo` | text | como no CSV, por exemplo `Tesouro IPCA+` |
| `vencimento` | date | |
| `data` | date | |
| `taxa_compra`, `taxa_venda` | numeric(10,4) | % a.a. |
| `pu_compra`, `pu_venda` | numeric(18,6) | |
| PK | (`tipo`, `vencimento`, `data`) | |

**`execucoes_mercado`**: uma linha por execução de job, para saber se o dado está fresco.

| Campo | Tipo | Nota |
| --- | --- | --- |
| `job` | text | `bcb`, `cvm_cotas`, `cvm_extrato`, `tesouro`, `b3` |
| `inicio`, `fim` | timestamptz | |
| `ok` | boolean | |
| `linhas` | integer | gravadas |
| `erro` | text | mensagem curta, sem payload |

## O que baixar (universo)

- **Índices sempre**: CDI, Selic, IPCA; `^BVSP` e `IFIX`.
- **Fundos**: os `cnpj` distintos de `assets` (todas as orgs) com classe `fund`. Hoje só o Open Finance grava CNPJ (`cnpj_number` da Polp, em `normalize-investment.ts`); o cadastro manual não pede. Fundo sem CNPJ não entra e mais tarde vira o achado R12 "dado incompleto".
- **CNPJ do fundo × da classe.** Depois da CVM 175, o informe diário usa `CNPJ_FUNDO_CLASSE`. Não sabemos se a Polp manda o CNPJ do fundo ou o da classe. O job casa direto primeiro. O que não casar passa por um de-para fundo → classe tirado de `registro_fundo_classe.zip` (~7 MB, mesma pasta do cadastro), baixado junto com o extrato no job semanal e guardado como coluna `cnpj_classe` em `fundos_cvm`. Os CNPJs que nem assim casam são contados em `execucoes_mercado`.
- **Tickers B3**: os `ticker` distintos de `assets` com classe `br_equity`, `fii` ou `etf`.
- **Tesouro**: o CSV inteiro na primeira carga; depois só as datas novas. É pequeno o bastante e serve de benchmark para qualquer carteira.

Ler o universo cruzando orgs só pode acontecer no servidor, com Drizzle, nunca por RLS de usuário. A consulta devolve só identificadores públicos (CNPJ, ticker), nada que ligue a uma org.

## Jobs

Uma rota por fonte em `apps/web/app/api/cron/mercado-{fonte}/route.ts`, no mesmo padrão de `auditar-conciliacao`: `POST`/`GET`, `isAuthorizedService` com `CRON_SECRET`, Sentry no erro. Agendamento em `apps/web/vercel.json` (é o que a Vercel lê; o da raiz é ignorado). Horários em UTC, depois da publicação das fontes:

| Rota | Horário (UTC) | Faz |
| --- | --- | --- |
| `mercado-bcb` | `0 9 * * *` | busca os últimos 10 dias das 3 séries e faz upsert (cobre feriado e atraso de publicação) |
| `mercado-cvm-cotas` | `30 9 * * *` | baixa o zip do mês corrente; nos 5 primeiros dias do mês também o do mês anterior; filtra pelos CNPJs do universo e faz upsert |
| `mercado-cvm-extrato` | `0 9 * * 1` (semanal) | baixa o CSV do ano, fica com o registro mais recente por CNPJ do universo e faz upsert em `fundos_cvm` |
| `mercado-tesouro` | `0 10 * * *` | baixa o CSV e faz upsert só das datas posteriores à última gravada |
| `mercado-b3` | `30 21 * * 1-5` | depois do fechamento: uma chamada `quote` por ticker do universo; grava o fechamento do dia |

Carga inicial: um script em `scripts/` (o mesmo código dos jobs, chamado com outro intervalo de datas) puxa 12 meses de BCB, CVM e Tesouro e os 3 meses de histórico que a brapi permite para cada ticker. Os 9 meses que faltam para o retorno de 12 meses das ações acumulam sozinhos com o tempo; antes disso, a regra R02 trata ação como sem dado suficiente.

### Detalhes que importam

- **Parse em fluxo.** O zip da CVM é descompactado em pedaços (`fflate`, a única dependência nova) e cada linha é filtrada pelo CNPJ antes de virar objeto. Nada carrega o arquivo inteiro na memória.
- **Idempotente.** Todo job faz upsert pela PK. Rodar duas vezes no mesmo dia não duplica nem estraga nada.
- **Falha não apaga.** Se a fonte cair ou mudar de formato, o job registra `ok = false` em `execucoes_mercado`, manda ao Sentry e não toca no que já está gravado.
- **Validação na fronteira.** Cada resposta e cada linha de CSV passa por Zod. Linha inválida é contada e ignorada; mais de 5% de linhas inválidas num arquivo conta como falha do job (sinal de que o formato mudou).
- **brapi.** Token em `BRAPI_TOKEN` (já no `.env.local`; falta na Vercel), enviado como `Authorization: Bearer`. Chamadas em série, nunca em paralelo, porque o plano grátis aceita uma por vez. 401 vira erro de configuração e para o job. 404 ou ticker sem dado só pula o ticker e conta. 429 respeita `Retry-After` uma vez e, se repetir, encerra o job e grava o que já tiver. Campos `null` são aceitos e não viram zero.
- **Cota da brapi.** Uma chamada por ticker por dia útil: com 22 dias úteis, cabem uns 600 tickers distintos nas 15 mil chamadas. O job registra quantas chamadas fez; passando de 80% da cota, avisa no Sentry.
- **Prazo e plano da Vercel.** O projeto está no plano Hobby: `maxDuration = 300` e cron com mais de um horário por dia já derrubaram o deploy (ver o comentário em `api/openfinance/import-transactions/route.ts`). Por isso nenhuma rota declara `maxDuration`, e cada cron roda no máximo uma vez por dia. Os horários da tabela acima respeitam isso. Todo job tem que caber em 60 s, o pior caso sem fluid compute. O zip da CVM (~12 MB) e o CSV do Tesouro cabem com folga. `mercado-b3` corta em 50 s: processa primeiro os tickers com fechamento mais antigo, para no tempo e deixa o resto para o dia seguinte. Timeout no meio não perde nada, porque tudo é upsert.
- **Cron que não roda.** `execucoes_mercado` só registra o que executou. Para pegar cron desligado ou rota fora do `vercel.json`, o `auditar-conciliacao`, que já roda todo dia e já fala com o Sentry, ganha uma checagem de frescor: se o último `ok = true` de um job tiver mais de 3 dias úteis (8 dias no `cvm_extrato`), manda um aviso. Se todos os crons pararem, essa checagem para junto; para esse caso, o painel de crons da Vercel continua sendo a fonte.

## Como o resto do app vai consumir

Um módulo `apps/web/lib/mercado/` com leitura simples, sem cálculo de regra:

- `cdiAcumulado(de, ate)`, `ipcaAcumulado(de, ate)`
- `cotaDoFundo(cnpj, data)`, `retornoDoFundo(cnpj, de, ate)`
- `fechamento(ticker, data)`, `retornoDoTicker(ticker, de, ate)`
- `dadosDoFundo(cnpj)` (taxa, liquidez, classe)
- `frescor()`: a data do último dado bom de cada fonte, para a análise mostrar "dados de mercado até dd/mm"

Quando faltar o dado, a função devolve `null`, nunca zero.

O cálculo acumulado (CDI de 12 meses a partir das taxas diárias) fica em `packages/core-finance`, função pura, com teste.

Trocar uma fonte depois (por exemplo, fundos pela brapi Pro) muda só o job; as tabelas e o módulo de leitura continuam iguais.

## Testes

- Cada parser (SGS, CSV da CVM, extrato, Tesouro, brapi) com fixture pequena tirada do arquivo real: linha boa, linha com campo vazio e linha quebrada.
- O cálculo de CDI e IPCA acumulados contra um valor conferido à mão na calculadora do BCB.
- Cada job com o `fetch` trocado por fixture: grava o esperado; rodando duas vezes, não duplica; com a fonte falhando, registra `ok = false` e não apaga nada.
- brapi: 401, 404, 429 com `Retry-After` e campo `null`.
- Um teste manual com o token real: PETR4 e VALE3, com a resposta mostrada.

## Pronto quando

- Os cinco jobs rodam em produção por 3 dias seguidos com `ok = true`.
- `cdiAcumulado` dos últimos 12 meses bate com a calculadora do BCB.
- Para cada fundo com CNPJ na base, existe cota de no máximo 3 dias úteis atrás (a CVM publica com atraso de 1 a 2 dias) e uma linha em `fundos_cvm`, ou o motivo de não ter (CNPJ não encontrado na CVM) aparece contado na execução.
- Todo ticker B3 da base tem fechamento do último dia útil.
- A checagem de frescor no `auditar-conciliacao` dispara quando um job fica parado (teste com `execucoes_mercado` antiga).

## Decisões tomadas nesta conversa

- O agente de investimentos vai morar numa aba dentro de Investimentos, sem item novo no menu lateral (Ricardo).
- O chat de investimentos é um agente novo, separado do consultor geral (Ricardo).
- O conhecimento do agente vem de uma base escrita que eu rascunho a partir de fontes públicas e Ricardo revisa (Ricardo).
- Começar pelas integrações (Ricardo).
- brapi no plano grátis por enquanto; o Pro fica para depois (Ricardo).
- Stack: TypeScript dentro de `apps/web`, Vercel Cron, Supabase, Zod, `papaparse`, `fflate` (minha escolha).
- BCB, CVM e Tesouro direto nas fontes oficiais, mesmo se o Pro vier (minha escolha: são grátis e oficiais).
- Taxa de administração do extrato da CVM, não da brapi, porque nela o campo `fees` veio `null` até no fundo de exemplo (minha escolha).
- Policy de `SELECT` para `authenticated` nas tabelas de mercado, por causa do ADR 0001 (minha escolha).
- Jobs dimensionados para 60 s e um disparo por dia, por causa do plano Hobby da Vercel (minha escolha).
- De-para fundo → classe pela CVM, para o caso de a Polp mandar o CNPJ do fundo (minha escolha; não consegui conferir no banco de produção qual dos dois vem).
- Frescor monitorado de dentro do `auditar-conciliacao` (minha escolha).

## Deixado para quem implementar

- Nomes finais de funções e arquivos dentro de `lib/mercado/` e dos jobs.
- Como mapear o `tipo` do CSV do Tesouro para os ativos `treasury` da base (o casamento com a posição é das regras, não desta entrega).
- Se `cotas_fundos` precisar de índice extra além da PK.
