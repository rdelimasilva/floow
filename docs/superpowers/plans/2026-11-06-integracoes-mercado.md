# Integrações de dados de mercado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cinco jobs diários gravam CDI/Selic/IPCA, cotas e taxas de fundos da CVM, preços do Tesouro e cotações B3 (brapi) em tabelas globais, com leitura pronta para as regras do agente.

**Architecture:** Parsers puros em `packages/core-finance/src/mercado/` (recebem texto ou linhas, devolvem registros validados). Download, descompactação, gravação e registro de execução em `apps/web/lib/mercado/`. Cada job é uma função `rodarX(deps)` testável com `fetch` e repositório falsos; a rota em `app/api/cron/mercado-*` só autentica e chama. Leitura para as regras em `apps/web/lib/mercado/leitura.ts`.

**Tech Stack:** TypeScript, Next.js App Router (Vercel Hobby), Drizzle + Supabase Postgres, Zod 3, papaparse (já em core-finance), fflate (novo, em apps/web), Vitest, Sentry.

**Spec:** `docs/superpowers/specs/2026-11-06-integracoes-mercado-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md do projeto).
- Tabelas globais, sem `org_id`; RLS ligado; policy só de `SELECT` para `authenticated` com `using (true)`; jobs escrevem com `getServiceDb()`.
- Nenhuma rota declara `maxDuration`. Todo job termina em até 60 s; `mercado-b3` corta em 50 s.
- Cada cron roda no máximo uma vez por dia (plano Hobby). Horários UTC: bcb `0 9 * * *`, cvm-cotas `30 9 * * *`, cvm-extrato `0 9 * * 1`, tesouro `0 10 * * *`, b3 `30 21 * * 1-5`.
- Crons vão em `apps/web/vercel.json` (o da raiz é ignorado).
- `BRAPI_TOKEN` só por `process.env`, enviado como `Authorization: Bearer <token>`. Nunca no código, no frontend ou no repo.
- brapi em série, nunca em paralelo. 401 para o job; 404/sem dado pula o ticker; 429 respeita `Retry-After` uma vez, no segundo 429 encerra e grava o que tiver.
- Dado ausente é `null`, nunca `0`.
- Todo job faz upsert pela PK; falha registra `ok = false` em `execucoes_mercado`, manda ao Sentry e não apaga nada.
- Mais de 5% de linhas inválidas num arquivo conta como falha do job.
- CNPJ guardado só com dígitos (14). Ticker em maiúsculas sem `.SA`.
- CSVs da CVM: `;`, latin-1, datas ISO, ponto decimal, CNPJ com pontuação. CSV do Tesouro: `;`, vírgula decimal, datas `dd/MM/aaaa`. SGS: `{"data":"dd/MM/aaaa","valor":"0.050788"}`.
- Séries SGS: `cdi` = 12, `selic` = 11, `ipca` = 433.
- Texto de comentário novo e mensagem de commit passam pelo estilo da skill `humanizer` (português do Brasil, direto).
- Commits: `git add` só dos arquivos da tarefa (há outras sessões no mesmo diretório; nunca `git add -A`). Conferir `git branch --show-current` antes.

## Review Focus

1. **Taxa de administração absurda no extrato da CVM** (ex.: `262600.000000`, 12 casos em 7.470 linhas de 2026): esperado gravar `null`, não a taxa. Teste na Task 4.
2. **Fundo com várias linhas no extrato** (um por `DT_COMPTC`): esperado ficar com a mais recente. Teste na Task 4.
3. **brapi devolve `IFIX.SA` quando pedimos `IFIX`** e `regularMarketPrice: null` em ticker sem pregão: esperado gravar `IFIX` e pular o `null`. Teste na Task 5.
4. **Virada de mês na CVM**: nos 5 primeiros dias do mês, o zip do mês corrente quase não tem dado; esperado baixar também o anterior. Teste na Task 7.
5. **Universo vazio** (nenhum fundo com CNPJ, nenhum ticker): esperado o job terminar `ok = true` com 0 linhas, sem chamar a fonte. Teste na Task 7.

---

## Estrutura de arquivos

```
packages/db/src/schema/mercado.ts                    tabelas (Task 1)
supabase/migrations/00084_dados_de_mercado.sql       DDL + RLS (Task 1)
packages/core-finance/src/mercado/
  acumulado.ts        fatores acumulados (Task 2)
  bcb.ts              parser SGS (Task 3)
  cvm.ts              parsers informe, extrato, cadastro (Task 4)
  tesouro.ts          parser Tesouro (Task 6)
  util.ts             soDigitos, dataBr, numeroBr (Task 3)
  index.ts            barrel, exportado em src/index.ts
apps/web/lib/mercado/
  brapi.ts            cliente HTTP (Task 5)
  repo.ts             interface RepoMercado + implementação Drizzle (Task 7)
  execucao.ts         registrarExecucao, universoDeMercado (Task 7)
  jobs/bcb.ts, jobs/cvm-cotas.ts, jobs/cvm-extrato.ts, jobs/tesouro.ts, jobs/b3.ts  (Tasks 7–9)
  unzip.ts            linhas de um zip em fluxo (Task 8)
  leitura.ts          consultas para as regras (Task 10)
  frescor.ts          checagem de jobs parados (Task 11)
apps/web/app/api/cron/mercado-{bcb,cvm-cotas,cvm-extrato,tesouro,b3}/route.ts
scripts/mercado-carga-inicial.mts                    (Task 12)
```

---

### Task 1: Tabelas de mercado

**Files:**
- Create: `packages/db/src/schema/mercado.ts`
- Modify: `packages/db/src/index.ts` (acrescentar `export * from './schema/mercado'`)
- Create: `supabase/migrations/00084_dados_de_mercado.sql`
- Test: `packages/db/src/__tests__/mercado-schema.test.ts`

**Interfaces:**
- Produces: tabelas Drizzle `indicadoresDiarios`, `cotacoesB3`, `cotasFundos`, `fundosCvm`, `tesouroPrecos`, `execucoesMercado`, com os campos e PKs do spec (seção "Tabelas novas"), mais `fundosCvm.cnpjClasse`. Numéricos que não são dinheiro usam `numeric` lido como `number` (seguir `numericNumber` de `schema/numeric-number.ts`, criando variantes com a precisão do spec se preciso).

- [ ] **Step 1: Teste** — `mercado-schema.test.ts` segue o padrão de `investments-schema.test.ts`: para cada tabela, `getTableConfig(t).name` é o nome SQL do spec e as colunas da PK são as do spec; `fundosCvm` tem `cnpj_classe`, `taxa_adm`, `dias_conversao_resgate`, `dias_pagamento_resgate`.
- [ ] **Step 2:** `pnpm --filter @floow/db test mercado-schema` → FAIL (módulo não existe).
- [ ] **Step 3:** Escrever `schema/mercado.ts` e o export no barrel.
- [ ] **Step 4:** Escrever a migration: `CREATE TABLE` das 6 tabelas, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, uma policy `"<tabela>: leitura pública" FOR SELECT TO authenticated USING (true)` por tabela, índice `(job, inicio desc)` em `execucoes_mercado`.
- [ ] **Step 5:** `pnpm --filter @floow/db test` → PASS; `node scripts/rls-coverage.mjs` não acusa as tabelas novas.
- [ ] **Step 6:** Commit `feat(mercado): tabelas de dados de mercado`.

A migration não é aplicada aqui. Ela vai para produção na Task 13, colada pelo Ricardo no SQL Editor a partir do arquivo.

---

### Task 2: Acumulado de CDI e IPCA

**Files:**
- Create: `packages/core-finance/src/mercado/acumulado.ts`, `packages/core-finance/src/mercado/index.ts`
- Modify: `packages/core-finance/src/index.ts` (`export * from './mercado'`)
- Test: `packages/core-finance/src/__tests__/mercado-acumulado.test.ts`

**Interfaces:**
- Produces: `acumular(taxasPct: number[]): number` — retorno composto em fração (`[1, 1]` → `0.0201`). Serve para CDI diário (% a.d.) e IPCA mensal (% a.m.). Lista vazia → `0`.

- [ ] **Step 1: Teste** — `acumular([1, 1])` ≈ `0.0201`; `acumular([])` = `0`; 252 dias de `0.050788` → `toBeCloseTo(0.1365, 4)` (≈ 13,65% a.a., o CDI de 05/11/2026); IPCA `[0.5, -0.2, 0.3]` → `toBeCloseTo(0.005999, 6)`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar (produto de `1 + t/100`, menos 1).
- [ ] **Step 4:** `pnpm --filter @floow/core-finance test mercado-acumulado` → PASS.
- [ ] **Step 5:** Commit `feat(mercado): retorno acumulado de taxas`.

---

### Task 3: Parser do BCB SGS e utilitários

**Files:**
- Create: `packages/core-finance/src/mercado/util.ts`, `packages/core-finance/src/mercado/bcb.ts`
- Test: `packages/core-finance/src/__tests__/mercado-bcb.test.ts`

**Interfaces:**
- Produces:
  - `soDigitos(s: string): string`
  - `dataBr(s: string): string | null` — `dd/MM/aaaa` → `aaaa-MM-dd`; inválida → `null`
  - `numeroBr(s: string): number | null` — `"20216,19"` → `20216.19`; `""` → `null`
  - `type Serie = 'cdi' | 'selic' | 'ipca'`; `const CODIGOS_SGS: Record<Serie, number> = { cdi: 12, selic: 11, ipca: 433 }`
  - `type Indicador = { serie: Serie; data: string; valor: number }`
  - `parseSgs(serie: Serie, json: unknown): { linhas: Indicador[]; invalidas: number }` — IPCA vem com `data` = `01/MM/aaaa`, grava como está.

- [ ] **Step 1: Teste** — com `[{"data":"04/11/2026","valor":"0.050788"},{"data":"05/11/2026","valor":"0.050788"}]` devolve 2 linhas `{serie:'cdi', data:'2026-11-04', valor:0.050788}`; item `{"data":"xx","valor":"1"}` conta em `invalidas`; `json` que não é array lança `Error` com "SGS". Mais testes de `dataBr('31/02/2026')` → `null` e `numeroBr('')` → `null`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar com Zod (`z.array(z.object({ data: z.string(), valor: z.string() }))`).
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(mercado): parser do SGS do Banco Central`.

---

### Task 4: Parsers da CVM

**Files:**
- Create: `packages/core-finance/src/mercado/cvm.ts`
- Test: `packages/core-finance/src/__tests__/mercado-cvm.test.ts`, fixtures inline (cabeçalhos reais abaixo)

Cabeçalhos reais (06/11/2026):
- Informe: `TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST`
- Extrato: 70+ colunas; usar `CNPJ_FUNDO_CLASSE`, `DENOM_SOCIAL`, `DT_COMPTC`, `CLASSE_ANBIMA`, `TAXA_ADM`, `TAXA_PERFM`, `QT_DIA_CONVERSAO_COTA`, `QT_DIA_PAGTO_RESGATE`
- Cadastro legado (`cad_fi.csv`): usar `CNPJ_FUNDO`, `DENOM_SOCIAL`, `SIT`, `CLASSE_ANBIMA`, `TAXA_ADM`, `TAXA_PERFM`

**Interfaces:**
- Produces:
  - `type CotaFundo = { cnpj: string; data: string; cota: number; patrimonio: number | null }`
  - `linhaDoInforme(cabecalho: string[], linha: string, cnpjs: Set<string>): CotaFundo | 'fora' | 'invalida'` — split por `;`; devolve `'fora'` sem validar quando o CNPJ (só dígitos) não está no conjunto. É chamado linha a linha pelo job.
  - `type FundoCvm = { cnpj: string; nome: string; classeAnbima: string | null; taxaAdm: number | null; taxaPerformance: number | null; diasConversaoResgate: number | null; diasPagamentoResgate: number | null; dataReferencia: string }`
  - `parseExtrato(csv: string, cnpjs: Set<string>): { fundos: FundoCvm[]; invalidas: number }` — papaparse com `delimiter: ';'`, `header: true`; fica com a linha de `DT_COMPTC` mais recente por CNPJ.
  - `parseCadastro(csv: string, cnpjs: Set<string>): { fundos: FundoCvm[]; invalidas: number }` — mesmo formato de saída, com `dataReferencia` = `DT_INI_SIT` e os campos de dias `null` (o cadastro não traz); ignora linhas com `SIT = 'CANCELADA'`.
  - `taxaPlausivel(v: number | null): number | null` — fora de `[0, 10]` vira `null`.

- [ ] **Step 1: Testes**
  - informe: linha `CLASSES - FIF;00.017.024/0001-53;;2026-11-03;1131424.27;45.360755300000;1228659.83;0.00;0.00;1` com o conjunto `{'00017024000153'}` → `{cnpj:'00017024000153', data:'2026-11-03', cota:45.3607553, patrimonio:1228659.83}`; mesmo CNPJ fora do conjunto → `'fora'`; `VL_QUOTA` vazio → `'invalida'`.
  - extrato: duas linhas do mesmo CNPJ com `DT_COMPTC` `2026-02-26` (TAXA_ADM `262600.000000`) e `2026-07-07` (TAXA_ADM `2.000000`) → um fundo, `dataReferencia:'2026-07-07'`, `taxaAdm:2`, `diasConversaoResgate:0`, `diasPagamentoResgate:2`.
  - extrato: linha única com `TAXA_ADM` `262600.000000` → `taxaAdm:null`.
  - cadastro: linha com `SIT=CANCELADA` não entra.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar. Decodificar latin-1 é responsabilidade de quem baixa (Task 8); aqui chega `string`.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(mercado): parsers dos arquivos da CVM`.

---

### Task 5: Cliente da brapi

**Files:**
- Create: `apps/web/lib/mercado/brapi.ts`
- Test: `apps/web/__tests__/mercado/brapi.test.ts`

**Interfaces:**
- Produces:
  - `type Fechamento = { ticker: string; data: string; fechamento: number }`
  - `class BrapiNaoAutorizada extends Error`
  - `type ResultadoBrapi = { tipo: 'ok'; linhas: Fechamento[] } | { tipo: 'sem_dado' } | { tipo: 'limite' }`
  - `buscarCotacao(ticker: string, deps: { fetch: typeof fetch; token: string; esperar?: (ms: number) => Promise<void> }): Promise<ResultadoBrapi>` — `GET https://brapi.dev/api/v2/stocks/quote?symbols=<ticker>`; resposta em `results[0].data.regularMarketPrice` e `regularMarketTime` (ISO → data em America/Sao_Paulo).
  - `buscarHistorico(ticker, deps): Promise<ResultadoBrapi>` — `/api/v2/stocks/historical?symbols=<ticker>&range=3mo&interval=1d`; `historicalDataPrice[].date` em segundos Unix, `close`.
  - `normalizarTicker(s: string): string` — maiúsculas, sem `.SA`.

- [ ] **Step 1: Testes** (fetch falso)
  - PETR4 com o corpo real de 06/11 (`regularMarketPrice: 45.56`, `regularMarketTime: "2026-11-06T17:04:30.000Z"`) → `ok`, `[{ticker:'PETR4', data:'2026-11-06', fechamento:45.56}]`; header enviado `Authorization: Bearer t`.
  - `IFIX` com `symbol: "IFIX.SA"` → linha com `ticker:'IFIX'`.
  - `regularMarketPrice: null` → `sem_dado`.
  - 404 → `sem_dado`.
  - 401 → lança `BrapiNaoAutorizada`.
  - 429 com `Retry-After: 2` e depois 200 → chamou `esperar(2000)` uma vez e devolve `ok`.
  - 429 duas vezes → `limite`.
  - histórico com 2 pontos → 2 linhas, datas convertidas.
- [ ] **Step 2:** `pnpm --filter @floow/web test brapi` → FAIL.
- [ ] **Step 3:** Implementar com Zod (campos `nullable()`).
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Verificação manual: `node --env-file=apps/web/.env.local --experimental-strip-types -e` chamando `buscarCotacao('PETR4')` e `('VALE3')` com o `fetch` real; mostrar a resposta ao Ricardo.
- [ ] **Step 6:** Commit `feat(mercado): cliente da brapi`.

---

### Task 6: Parser do Tesouro

**Files:**
- Create: `packages/core-finance/src/mercado/tesouro.ts`
- Test: `packages/core-finance/src/__tests__/mercado-tesouro.test.ts`

Cabeçalho real: `Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha`

**Interfaces:**
- Produces:
  - `type PrecoTesouro = { tipo: string; vencimento: string; data: string; taxaCompra: number | null; taxaVenda: number | null; puCompra: number | null; puVenda: number | null }`
  - `parseTesouro(csv: string, aPartirDe: string | null): { linhas: PrecoTesouro[]; invalidas: number }` — só linhas com `data > aPartirDe` (todas se `null`).

- [ ] **Step 1: Testes** — `Tesouro Selic;01/03/2029;05/11/2026;0,06;0,07;20216,19;20201,19;20201,19` → `{tipo:'Tesouro Selic', vencimento:'2029-03-01', data:'2026-11-05', taxaCompra:0.06, taxaVenda:0.07, puCompra:20216.19, puVenda:20201.19}`; com `aPartirDe:'2026-11-05'` → nenhuma linha; taxa vazia → `null`; data inválida conta em `invalidas`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar com papaparse e os utilitários da Task 3.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(mercado): parser de preços do Tesouro`.

---

### Task 7: Execução, repositório, universo e job do BCB

**Files:**
- Create: `apps/web/lib/mercado/repo.ts`, `apps/web/lib/mercado/execucao.ts`, `apps/web/lib/mercado/jobs/bcb.ts`
- Create: `apps/web/app/api/cron/mercado-bcb/route.ts`
- Modify: `apps/web/middleware.ts` (acrescentar `'/api/cron/mercado-', // Crons de dados de mercado — usam CRON_SECRET / SERVICE_ROLE_KEY` em `PUBLIC_ROUTE_PREFIXES`)
- Modify: `apps/web/vercel.json` (cron `mercado-bcb`)
- Test: `apps/web/__tests__/mercado/repo-memoria.ts` (repo falso), `apps/web/__tests__/mercado/execucao.test.ts`, `apps/web/__tests__/mercado/job-bcb.test.ts`, `apps/web/__tests__/mercado/rota-mercado.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 1; `parseSgs`, `CODIGOS_SGS` da Task 3.
- Produces:
  - `type Job = 'bcb' | 'cvm_cotas' | 'cvm_extrato' | 'tesouro' | 'b3'`
  - `interface RepoMercado { gravarIndicadores(l: Indicador[]): Promise<number>; gravarCotas(l: CotaFundo[]): Promise<number>; gravarFundos(l: FundoCvm[]): Promise<number>; gravarTesouro(l: PrecoTesouro[]): Promise<number>; gravarFechamentos(l: Fechamento[]): Promise<number>; ultimaDataTesouro(): Promise<string | null>; tickersPorFechamentoMaisAntigo(tickers: string[]): Promise<string[]>; registrarExecucao(e: { job: Job; inicio: Date; fim: Date; ok: boolean; linhas: number; erro: string | null }): Promise<void>; ultimoOkPorJob(): Promise<Partial<Record<Job, Date>>> }`
  - `repoDrizzle(db = getServiceDb()): RepoMercado` — upsert com `onConflictDoUpdate` pela PK, em lotes de 1.000.
  - `universoDeMercado(db): Promise<{ cnpjs: Set<string>; tickers: string[] }>` — `cnpj` distintos de `assets` com `asset_class = 'fund'` (só dígitos, 14 caracteres); `ticker` distintos com classe `br_equity`, `fii`, `etf`, normalizados; sempre acrescenta `^BVSP` e `IFIX` aos tickers.
  - `executarJob(job: Job, repo: RepoMercado, corpo: () => Promise<{ linhas: number; invalidas: number; total: number }>): Promise<{ ok: boolean; linhas: number }>` — registra a execução; falha quando `corpo` lança ou quando `total > 0` e `invalidas / total > 0.05`; na falha chama `Sentry.captureMessage('mercado: job <job> falhou', { level: 'warning', tags: { mercado: job } })` com o erro curto e nunca lança.
  - `rodarBcb(deps: { fetch: typeof fetch; repo: RepoMercado; hoje: Date }): Promise<{ linhas: number; invalidas: number; total: number }>` — para cada série, `GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.<codigo>/dados?formato=json&dataInicial=<hoje-10d dd/MM/aaaa>&dataFinal=<hoje dd/MM/aaaa>`; IPCA com janela de 70 dias.
  - Rota: `POST` com `isAuthorizedService(..., [SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET])`, 401 sem segredo, chama `executarJob('bcb', repoDrizzle(), () => rodarBcb({fetch, repo, hoje: new Date()}))` e responde `{ ok, linhas }`; `export { POST as GET }`. Mesmo formato de `api/cron/auditar-conciliacao/route.ts`.

- [ ] **Step 1: Testes**
  - `execucao.test.ts`: corpo ok → `registrarExecucao` com `ok:true`; corpo lança → `ok:false`, `erro` preenchido, Sentry chamado, função não lança; `invalidas:6, total:100` → `ok:false`; universo vazio no job (corpo devolve `{0,0,0}`) → `ok:true`.
  - `job-bcb.test.ts`: fetch falso devolve o JSON da Task 3 para as três séries → `repo.gravarIndicadores` recebe 6 linhas; URLs chamadas contêm `bcdata.sgs.12`, `bcdata.sgs.11`, `bcdata.sgs.433` e `dataFinal=06/11/2026` para `hoje = 2026-11-06`; rodar duas vezes no repo em memória deixa 6 linhas (upsert por `(serie, data)`).
  - `rota-mercado.test.ts`: sem token → 401; com `CRON_SECRET` → 200 e `executarJob` chamado com `'bcb'` (mock de `@/lib/mercado/execucao` e de `@floow/db`, como em `auditar-conciliacao.test.ts`).
- [ ] **Step 2:** `pnpm --filter @floow/web test mercado` → FAIL.
- [ ] **Step 3:** Implementar `repo.ts`, `execucao.ts`, `jobs/bcb.ts`, a rota, o prefixo no middleware e o cron `{ "path": "/api/cron/mercado-bcb", "schedule": "0 9 * * *" }`.
- [ ] **Step 4:** rodar → PASS; `pnpm --filter @floow/web typecheck` limpo.
- [ ] **Step 5:** Commit `feat(mercado): job diário do Banco Central`.

---

### Task 8: Jobs da CVM

**Files:**
- Modify: `apps/web/package.json` (`pnpm --filter @floow/web add fflate`)
- Create: `apps/web/lib/mercado/unzip.ts`, `apps/web/lib/mercado/jobs/cvm-cotas.ts`, `apps/web/lib/mercado/jobs/cvm-extrato.ts`
- Create: `apps/web/app/api/cron/mercado-cvm-cotas/route.ts`, `apps/web/app/api/cron/mercado-cvm-extrato/route.ts`
- Modify: `apps/web/vercel.json`
- Test: `apps/web/__tests__/mercado/unzip.test.ts`, `apps/web/__tests__/mercado/job-cvm.test.ts`

**Interfaces:**
- Consumes: `linhaDoInforme`, `parseExtrato`, `parseCadastro` (Task 4); `RepoMercado`, `executarJob`, `universoDeMercado` (Task 7).
- Produces:
  - `linhasDoZip(corpo: ReadableStream<Uint8Array>, aoLer: (linha: string) => void): Promise<void>` — `fflate.Unzip` com `UnzipInflate`, decodifica latin-1 (`new TextDecoder('latin1')`), entrega linha a linha sem juntar o arquivo.
  - `rodarCvmCotas(deps: { fetch; repo; hoje: Date; cnpjs: Set<string> }): Promise<{ linhas; invalidas; total }>` — URL `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_<AAAAMM>.zip`; mês corrente e, se `hoje.getUTCDate() <= 5`, também o anterior; `cnpjs` vazio → não baixa nada. Também aceita o CNPJ de classe: o conjunto passado é a união de `cnpjs` com os `cnpj_classe` já em `fundos_cvm`, e a cota é gravada sob o `cnpj` de `assets` (mapa classe → cnpj vindo do repo).
  - `rodarCvmExtrato(deps: { fetch; repo; hoje: Date; cnpjs: Set<string> })` — baixa `extrato_fi_<AAAA>.csv` (latin-1), `parseExtrato`; para os CNPJs que não vieram, baixa `cad_fi.csv` e usa `parseCadastro`; os que ainda faltarem são contados em `invalidas` (não falham o job: não entram no `total`).
- Acrescentar ao `RepoMercado`: `mapaClasseParaCnpj(): Promise<Map<string, string>>`.

O de-para fundo → classe por `registro_fundo_classe.zip` fica fora desta tarefa. Ele só entra se, depois da primeira execução em produção, a contagem de CNPJs não encontrados for maior que zero (ver Task 13).

- [ ] **Step 1: Testes**
  - `unzip.test.ts`: zip montado no teste com `fflate.zipSync` contendo um CSV latin-1 com `AÇÕES` em 3 linhas → `aoLer` recebe 3 linhas, `AÇÕES` intacto.
  - `job-cvm.test.ts`: com `hoje = 2026-11-03`, baixa `202611` e `202610`; com `hoje = 2026-11-20`, só `202611`; `cnpjs` vazio → `fetch` não é chamado e devolve `{0,0,0}`; zip com uma linha do CNPJ do conjunto e uma de outro → 1 cota gravada; extrato sem um CNPJ e `cad_fi` com ele → 2 fundos gravados.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar; rotas iguais à da Task 7, com `universoDeMercado` antes do job; crons `30 9 * * *` (cotas) e `0 9 * * 1` (extrato).
- [ ] **Step 4:** rodar → PASS; typecheck limpo.
- [ ] **Step 5:** Medir com os arquivos reais (script de uma vez, fora do repo): tempo e pico de memória de `rodarCvmCotas` sobre `inf_diario_fi_202610.zip` (~12 MB) com 50 CNPJs. Esperado < 30 s. Se passar, reportar antes de seguir.
- [ ] **Step 6:** Commit `feat(mercado): jobs de cotas e taxas de fundos da CVM`.

---

### Task 9: Jobs do Tesouro e da B3

**Files:**
- Create: `apps/web/lib/mercado/jobs/tesouro.ts`, `apps/web/lib/mercado/jobs/b3.ts`
- Create: `apps/web/app/api/cron/mercado-tesouro/route.ts`, `apps/web/app/api/cron/mercado-b3/route.ts`
- Modify: `apps/web/vercel.json`
- Test: `apps/web/__tests__/mercado/job-tesouro.test.ts`, `apps/web/__tests__/mercado/job-b3.test.ts`

**Interfaces:**
- Consumes: `parseTesouro` (Task 6), `buscarCotacao` (Task 5), repo e execução (Task 7).
- Produces:
  - `rodarTesouro(deps: { fetch; repo })` — URL do CSV do spec; `aPartirDe = await repo.ultimaDataTesouro()`.
  - `rodarB3(deps: { fetch; repo; token: string; tickers: string[]; agora: () => number; prazoMs?: number })` — `prazoMs` padrão `50_000`; ordem de `repo.tickersPorFechamentoMaisAntigo(tickers)`; para antes de cada chamada se `agora() - inicio >= prazoMs`; `limite` encerra o laço; `sem_dado` conta em `invalidas` mas não no `total` (ticker sem pregão não é formato quebrado); `BrapiNaoAutorizada` propaga (o job falha). Rota lê `process.env.BRAPI_TOKEN`; ausente → job falha com erro "BRAPI_TOKEN ausente", sem chamar a brapi.

- [ ] **Step 1: Testes**
  - tesouro: repo com última data `2026-11-04` e CSV com linhas de `04/11` e `05/11` → grava só as de `05/11`.
  - b3: 3 tickers, `agora` avançando 30 s por chamada, `prazoMs` 50 s → 2 chamadas; resposta `limite` no primeiro → 1 chamada e grava 0; 401 → `executarJob` registra `ok:false`; o ticker com fechamento mais antigo é chamado primeiro.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar; crons `0 10 * * *` e `30 21 * * 1-5`.
- [ ] **Step 4:** rodar → PASS; typecheck limpo.
- [ ] **Step 5:** Commit `feat(mercado): jobs do Tesouro e das cotações da B3`.

---

### Task 10: Leitura para as regras

**Files:**
- Create: `apps/web/lib/mercado/leitura.ts`
- Test: `apps/web/__tests__/mercado/leitura.test.ts`

**Interfaces:**
- Consumes: `acumular` (Task 2), tabelas (Task 1).
- Produces (todas recebem `db` como primeiro argumento, para servir ao `withRls` ou ao service db; datas `aaaa-MM-dd`):
  - `cdiAcumulado(db, de, ate): Promise<number | null>` e `ipcaAcumulado(db, de, ate): Promise<number | null>` — `null` se a série não cobre o período inteiro (primeira data gravada > `de` ou última < `ate` menos 5 dias)
  - `retornoDoFundo(db, cnpj, de, ate): Promise<number | null>` — cota da última data ≤ `ate` ÷ cota da última data ≤ `de`, menos 1
  - `retornoDoTicker(db, ticker, de, ate): Promise<number | null>` — mesma regra com `fechamento`
  - `dadosDoFundo(db, cnpj): Promise<FundoCvm | null>`
  - `frescor(db): Promise<Partial<Record<Job, string>>>` — data do último `ok = true` por job

- [ ] **Step 1: Testes** — com um repo/db de teste populado (seguir o padrão de mock de banco do repo; ver `project_testes_mockam_banco`): CDI com 3 dias de `0.05` cobrindo o período → `acumular([0.05,0.05,0.05])`; período antes do primeiro dado → `null`; fundo com cota 100 em `de` e 110 em `ate` → `0.1`; fundo sem cota em `de` → `null`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(mercado): leitura dos dados de mercado`.

---

### Task 11: Aviso de job parado

**Files:**
- Create: `apps/web/lib/mercado/frescor.ts`
- Modify: `apps/web/app/api/cron/auditar-conciliacao/route.ts` (chamar `jobsParados` e mandar um evento Sentry por job parado)
- Test: `apps/web/__tests__/mercado/frescor.test.ts`; acrescentar um caso em `apps/web/__tests__/finance/auditar-conciliacao.test.ts`

**Interfaces:**
- Consumes: `RepoMercado.ultimoOkPorJob` (Task 7).
- Produces: `jobsParados(ultimoOk: Partial<Record<Job, Date>>, agora: Date): Job[]` — limite de 3 dias úteis (seg–sex, sem feriados) para todos, 8 dias corridos para `cvm_extrato`; job sem nenhum `ok` conta como parado.

- [ ] **Step 1: Testes** — `agora` = sexta 2026-11-06: `bcb` com último ok na segunda 2026-11-02 → parado (4 dias úteis); na terça 2026-11-03 → não parado; `cvm_extrato` em 2026-10-30 → não parado, em 2026-10-28 → parado; objeto vazio → os 5 jobs. Na rota: com `bcb` parado, `captureMessage('mercado: job bcb parado', ...)` é chamado.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar. Erro ao ler o frescor não pode derrubar a auditoria de conciliação: `try/catch` só em volta dessa parte.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(mercado): aviso quando um job de mercado para`.

---

### Task 12: Carga inicial

**Files:**
- Create: `scripts/mercado-carga-inicial.mts`

**Interfaces:**
- Consumes: `rodarBcb`, `rodarCvmCotas`, `rodarCvmExtrato`, `rodarTesouro`, `buscarHistorico`, `repoDrizzle`, `universoDeMercado`.
- Produces: script que, com `DATABASE_URL` e `BRAPI_TOKEN`, carrega 12 meses de BCB (janela única de 12 meses por série), os 12 zips mensais da CVM (um `rodarCvmCotas` por mês), o extrato, o CSV inteiro do Tesouro e `buscarHistorico` (3 meses) de cada ticker, em série. Imprime linhas gravadas por fonte. Aceita `--so=<job>` para rodar uma fonte só.

Para isso, `rodarBcb` e `rodarCvmCotas` ganham o parâmetro opcional `janelaDias?: number` / `meses?: string[]`, com teste de uma linha cada nos testes existentes.

- [ ] **Step 1:** Acrescentar os parâmetros opcionais e os testes; rodar → PASS.
- [ ] **Step 2:** Escrever o script, seguindo o formato de `scripts/conciliacao-comum.mts`.
- [ ] **Step 3:** `pnpm tsx scripts/mercado-carga-inicial.mts --help` (ou o equivalente usado pelos outros `.mts`) roda sem erro de tipo. **Não rodar contra o banco**: `.env.local` aponta para produção, e a carga real é a Task 13.
- [ ] **Step 4:** Commit `feat(mercado): script de carga inicial`.

---

### Task 13: Produção

Feita com o Ricardo, em ordem:

- [ ] **Step 1:** `pnpm --filter @floow/web build` limpo e `pnpm test` verde no monorepo.
- [ ] **Step 2:** Ricardo abre `supabase/migrations/00084_dados_de_mercado.sql` no editor e cola no SQL Editor do projeto `vntvwvhpquyayuiypacf` (conferir o projeto selecionado).
- [ ] **Step 3:** `BRAPI_TOKEN` cadastrado na Vercel (Production), pelo painel no Chrome.
- [ ] **Step 4:** Rodar a carga inicial com autorização explícita do Ricardo (grava no banco de produção).
- [ ] **Step 5:** Merge em `master` e push (fluxo direto, sem PR). Conferir o deploy: crons listados no painel da Vercel.
- [ ] **Step 6:** Disparar cada rota uma vez com `CRON_SECRET` e conferir `execucoes_mercado` com `ok = true`.
- [ ] **Step 7:** Depois de 3 dias: critérios de "Pronto quando" do spec. Se `cvm_cotas` contar CNPJs não encontrados, abrir a tarefa do de-para por `registro_fundo_classe.zip`.
- [ ] **Step 8:** Salvar memória do projeto: tabelas de mercado, jobs, limites da brapi grátis, rollback (as rotas novas podem ser removidas sem afetar o resto; as tabelas não têm FK com nada).
