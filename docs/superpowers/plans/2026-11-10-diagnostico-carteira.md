# Diagnóstico da carteira: plano de implementação

> **Para quem executa:** use a skill superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans para executar o plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhar o andamento.

**Objetivo:** calcular as regras R02 a R07, R11 e R12 sobre a carteira e mostrar os achados numa aba nova, Diagnóstico, em Investimentos.

**Arquitetura:**
- Regras como funções puras em `packages/core-finance/src/diagnostico/`. Recebem um `ContextoDiagnostico` e devolvem `Achado[]`.
- Um carregador em `apps/web/lib/investments/diagnostico/` monta o contexto a partir do banco.
- A página `/investments/diagnostico` calcula tudo quando é aberta. Nada é gravado, exceto o perfil.

**Stack:** Next.js App Router (server components e server actions), Drizzle, Zod, Vitest, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-11-10-diagnostico-carteira-design.md`

## Restrições globais

- Nenhum arquivo passa de 500 linhas.
- Valores em centavos inteiros (padrão do app). Taxas como fração: `1.0` = 100% do CDI e `0.109` = 10,9% a.a.
- Dado ausente faz a regra não disparar, ou vira `null` no valor. Nunca vira 0.
- Texto voltado à pessoa usuária, comentários novos e mensagens de commit passam pela skill `humanizer`. Escrita em pt-BR.
- Nenhum texto recomenda ativo específico.
- Os limites ficam em `CONFIG_DIAGNOSTICO`, nunca soltos no código.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Testes do core: `pnpm --filter @floow/core-finance exec vitest run <arquivo>`.
- Testes do web: `pnpm --filter web exec vitest run <arquivo>`.

## Pontos para a revisão conferir

1. **Posição de valor zero ou encerrada.** Não pode entrar em peso, em soma nem em R11/R12. O carregador filtra com `estaEncerrada`. Teste na Task 5.
2. **Carteira só com caixa, ou sem caixa.** Total zero não pode gerar divisão por zero nem peso `NaN`. Teste na Task 3 (`total zero não gera achado`).
3. **`indexador` com outra grafia** (`cdi`, `CDI`, `DI`). A comparação normaliza para maiúsculas e aceita `CDI` e `DI`. Teste na Task 2.
4. **Vencimento no passado.** Posição vencida e ainda não liquidada não entra na R11, porque a janela começa em 0 dia. Teste na Task 4.
5. **CNPJ do emissor com e sem máscara.** O agrupamento da R05 e da R06 usa só os dígitos. Teste na Task 3.

---

### Task 1: Tipos, config, formatação e orquestrador

**Arquivos:**
- Criar: `packages/core-finance/src/diagnostico/tipos.ts`, `packages/core-finance/src/diagnostico/index.ts`
- Modificar: `packages/core-finance/src/index.ts` (acrescentar `export * from './diagnostico'`)
- Teste: `packages/core-finance/src/__tests__/diagnostico/orquestrador.test.ts`

**Interfaces que produz:**

```ts
export type Perfil = 'conservador' | 'moderado' | 'arrojado'
export type Severidade = 'alta' | 'media' | 'info'
export type RegraId = 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R11' | 'R12'
export interface PosicaoDiagnostico {
  assetId: string; nome: string; classe: string; subtipo: string | null; ticker: string | null
  valorCents: number; cnpjEmissor: string | null; emissor: string | null
  indexador: string | null; percentualIndexador: number | null; taxaPrefixada: number | null
  vencimento: string | null /* aaaa-MM-dd */; titular: string | null
}
export interface ContaDeCaixa { tipo: 'checking' | 'savings' | 'cash'; saldoCents: number }
export interface ContextoDiagnostico {
  hoje: string; posicoes: PosicaoDiagnostico[]; caixa: ContaDeCaixa[]
  gastoMensalCents: number | null; cdi12m: number | null; perfil: Perfil | null
}
export interface Achado {
  ruleId: RegraId; severidade: Severidade; titulo: string; posicoes: string[]
  metricas: Record<string, number>; impactoAnualCents: number | null; exposicaoCents: number | null; dica: string
}
export interface Diagnostico { achados: Achado[]; impactoAnualCents: number; patrimonioCents: number }
export const CONFIG_DIAGNOSTICO: {
  r02MargemPp: 0.02; r02AltaCents: 200_000; r03TaxaMinima: 0.9; r03MesesColchao: 6; r04MesesColchao: 3
  r05Limite: 0.2; r05Alta: 0.3; r06LimiteFgcCents: 25_000_000; r07Limite: 0.8; r11Dias: 30; poupancaAnual: 0.0617
  subtiposFgc: ['CDB', 'LCI', 'LCA', 'LC', 'RDB']
}
export function patrimonioCents(ctx: ContextoDiagnostico): number   // soma das posições + caixa
export function ehPosCdi(p: PosicaoDiagnostico): boolean            // indexador CDI/DI (case-insensitive) e percentual != null
export function conglomerado(cnpj: string | null, assetId: string): string // bancoEmissor(cnpj) ?? raiz de 8 dígitos ?? `ativo:${assetId}`
export function diagnosticar(ctx: ContextoDiagnostico): Diagnostico
```

Os nomes `impactoAnualCents` e `exposicaoCents` levam o sufixo `Cents` por causa da convenção do app. Na spec eles aparecem como `impactoAnual` e `exposicao`.

`diagnosticar` chama as regras das Tasks 2 a 4. Nesta task ele chama uma lista vazia, e cada task seguinte acrescenta a sua regra. Depois ordena por severidade (alta, media, info) e por `impactoAnualCents ?? exposicaoCents ?? 0`, do maior para o menor. `impactoAnualCents` é a soma dos valores não nulos.

Para formatar os textos, use `brl` de `packages/core-finance/src/cfo/formato.ts`. Para o "R$ 48 mil", acrescente `brlCurto(cents)` em `diagnostico/tipos.ts`:
- de R$ 10 mil para cima, arredonda para mil ("R$ 48 mil");
- abaixo disso, usa `brl`.

- [ ] **Passo 1: testes que falham.** `diagnosticar` ordena por severidade e depois por valor. `patrimonioCents` soma posições e caixa. `conglomerado('60.701.190/0001-04', 'x')` devolve o nome do banco que `bancoEmissor` conhece. Um CNPJ desconhecido devolve os 8 primeiros dígitos. Um `null` devolve `ativo:x`. `brlCurto(4_812_300)` devolve `'R$ 48 mil'`.
- [ ] **Passo 2:** rodar e ver falhar (módulo inexistente).
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** rodar e ver passar.
- [ ] **Passo 5:** commit `feat(diagnostico): tipos, config e orquestrador`.

### Task 2: Caixa, liquidez e rendimento (R03, R04, R02)

**Arquivos:**
- Criar: `packages/core-finance/src/diagnostico/caixa-e-rendimento.ts`
- Modificar: `diagnostico/index.ts` (registrar as regras)
- Teste: `packages/core-finance/src/__tests__/diagnostico/caixa-e-rendimento.test.ts`

**Interfaces que produz:** `regraR03(ctx): Achado | null`, `regraR04(ctx): Achado | null`, `regraR02(ctx, jaNaR03: Set<string>): Achado[]`. No `diagnosticar`, a R02 recebe os `posicoes` do achado da R03.

**R03:**
- O grupo é formado por:
  - todo o caixa;
  - as posições `fixed_income` e `credit_fixed_income` com `ehPosCdi` e `percentualIndexador < 0.9`.
- Taxa de cada item: conta `checking` e `cash` valem 0. A poupança vale `poupancaAnual / cdi12m` (fica `null` quando o CDI é `null`). Posição usa o `percentualIndexador`.
- Excedente = soma do grupo − `6 × gastoMensalCents`. Dispara quando o excedente é maior que 0.
- `impactoAnualCents = round(excedente × cdi12m × (1 − média ponderada das taxas))`. Fica `null` quando o CDI ou alguma taxa é `null`.
- Severidade alta. `gastoMensalCents` `null` não dispara.

**R04:**
- Líquido = caixa + `treasury` com indexador `SELIC` + posição com vencimento até `hoje + 1 dia`.
- Dispara quando líquido < `3 × gasto`.
- `metricas`: `{ liquidoCents, alvoCents, faltaCents }`.
- A `dica` diz que só contou conta corrente, poupança, dinheiro e Tesouro Selic.
- Severidade alta, sem valor. Gasto `null` não dispara.

**R02:**
- Considera cada posição `fixed_income` ou `credit_fixed_income` com `ehPosCdi` que não está em `jaNaR03`.
- `diff = cdi12m × (1 − percentual)`. Dispara quando `diff > 0.02`.
- `impactoAnualCents = round(diff × valorCents)`.
- Severidade alta quando o valor passa de `r02AltaCents`, senão media.
- CDI `null` faz a regra devolver `[]`.

- [ ] **Passo 1: testes que falham.**
  - R03 dispara com caixa de R$ 100 mil e gasto de R$ 10 mil (excedente R$ 40 mil). Com CDI 0,109, o valor é `round(4_000_000 × 0.109)`.
  - R03 não dispara com excedente igual a 0.
  - A poupança reduz o valor da R03.
  - CDB a 95% do CDI fica fora do grupo da R03.
  - Gasto `null`: nem R03 nem R04 disparam.
  - CDI `null`: R03 dispara com `impactoAnualCents === null`.
  - R04 dispara com líquido de R$ 29.999,99 e gasto de R$ 10 mil. Não dispara com R$ 30 mil.
  - R04 conta Tesouro Selic e não conta CDB sem vencimento próximo.
  - R02 dispara para um CDB a 80% do CDI (diff 0,0218) e não dispara a 82% (0,01962).
  - R02 ignora posição que já está na R03.
  - `indexador: 'di'` conta como CDI.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** rodar e ver passar.
- [ ] **Passo 5:** commit `feat(diagnostico): caixa parado, colchão e rendimento abaixo do CDI`.

### Task 3: Concentração (R05, R06, R07)

**Arquivos:**
- Criar: `packages/core-finance/src/diagnostico/concentracao.ts`
- Modificar: `diagnostico/index.ts`
- Teste: `packages/core-finance/src/__tests__/diagnostico/concentracao.test.ts`

**Interfaces que produz:** `regraR05(ctx): Achado[]`, `regraR06(ctx): Achado[]`, `regraR07(ctx): Achado[]`.

**R05:**
- Grupos:
  - cada `br_equity` e cada `fii`, por `assetId`;
  - RF (`fixed_income` + `credit_fixed_income`) agrupada por `conglomerado(cnpjEmissor, assetId)`.
- Peso = grupo / `patrimonioCents`. Dispara quando o peso passa de `r05Limite` (estritamente maior).
- Severidade alta quando passa de `r05Alta`, senão media.
- `metricas.peso` vai como fração.

**R06:**
- Considera as posições cujo `subtipo` em maiúsculas está em `subtiposFgc`.
- Agrupa por `(titular ?? 'sem titular', conglomerado)`. Dispara quando a soma passa de `r06LimiteFgcCents` (estritamente maior).
- `exposicaoCents` = soma − limite. Severidade media.

**R07:**
- Só roda com perfil `moderado` ou `arrojado`.
- Baldes: `caixa`, `renda_fixa` (fixed_income + credit_fixed_income + treasury), `acoes` (br_equity), `fii`, `etf`, `fundos` (fund).
- Dispara para o balde com mais de 80% do patrimônio. Severidade media.

Em todas as três, patrimônio 0 devolve `[]`.

- [ ] **Passo 1: testes que falham.**
  - R05 não dispara com 20% exatos e dispara com 20,01%. Fica alta com 30,01%.
  - Dois CDBs do mesmo banco, um com CNPJ mascarado e outro sem máscara, somam no mesmo grupo.
  - ETF e Tesouro com 50% não disparam a R05.
  - R06 com R$ 250.000,00 não dispara e com R$ 250.000,01 dispara (exposição de 1 centavo).
  - Dois titulares com R$ 200 mil cada no mesmo banco não disparam a R06.
  - Debênture (`subtipo: 'DEBENTURES'`) fica fora da R06.
  - R07 com perfil `null` ou `conservador` devolve `[]`. Com `moderado` e 81% em renda fixa, dispara.
  - Total zero não gera achado.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** rodar e ver passar.
- [ ] **Passo 5:** commit `feat(diagnostico): concentração por ativo, emissor (FGC) e classe`.

### Task 4: Vencimento e dados incompletos (R11, R12)

**Arquivos:**
- Criar: `packages/core-finance/src/diagnostico/vencimento-e-dados.ts`
- Modificar: `diagnostico/index.ts`
- Teste: `packages/core-finance/src/__tests__/diagnostico/vencimento-e-dados.test.ts`

**Interfaces que produz:** `regraR11(ctx): Achado[]`, `regraR12(ctx): Achado | null`.

**R11:**
- Gera um achado por posição com `0 ≤ dias(hoje, vencimento) ≤ 29`.
- `exposicaoCents = valorCents`. Severidade info.

**R12:** um achado só (severidade info) quando existe pelo menos um destes casos:
- RF (`fixed_income`, `credit_fixed_income`) sem `percentualIndexador` e sem `taxaPrefixada`;
- `br_equity`, `fii` ou `etf` sem `ticker`;
- `gastoMensalCents === null`.

`metricas.posicoes` = quantidade de posições. A `dica` lista os nomes das posições e, quando for o caso, "sem histórico de gastos suficiente".

- [ ] **Passo 1: testes que falham.**
  - R11 dispara com 29 dias e com 0 dia. Não dispara com 30 dias nem com −1.
  - R12 junta duas posições sem taxa num achado só, com `metricas.posicoes === 2`.
  - R12 com gasto `null` e nenhuma posição incompleta gera um achado com `metricas.posicoes === 0`.
  - Carteira completa não gera R12.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** rodar e ver passar.
- [ ] **Passo 5:** commit `feat(diagnostico): vencimento próximo e dados incompletos`.

### Task 5: Perfil no banco e carregador do contexto

**Arquivos:**
- Criar: `supabase/migrations/00085_perfil_investidor.sql`
- Modificar: `packages/db/src/schema/auth.ts` (coluna em `orgs`)
- Criar: `apps/web/lib/investments/diagnostico/carregar.ts`, `apps/web/lib/investments/diagnostico/gasto-mensal.ts`, `apps/web/lib/investments/diagnostico/perfil-action.ts`
- Teste: `apps/web/__tests__/investments/diagnostico-carregar.test.ts`, `apps/web/__tests__/investments/diagnostico-gasto.test.ts`

**Interfaces que consome:** os tipos da Task 1; `getPositions` e `estaEncerrada`; `getContasDosAtivos`; `cdiAcumulado` de `@/lib/mercado/leitura`; `aggregateCashFlow` e o filtro de `lib/cfo/engine.ts:150-168` (`isIgnored = false`, `reviewState = 'confirmed'`, `effectiveAffectsCashFlow`).

**Interfaces que produz:**

```ts
export function gastoMensalDosMeses(meses: { month: string; expense: number }[], hoje: string): number | null
export async function carregarContexto(orgId: string, hoje: string): Promise<ContextoDiagnostico>
export async function salvarPerfilInvestidor(perfil: Perfil): Promise<{ error?: string }>
```

**Migration:**

```sql
ALTER TABLE public.orgs ADD COLUMN perfil_investidor text
  CHECK (perfil_investidor IN ('conservador', 'moderado', 'arrojado'));
```

O cabeçalho da migration explica por que a coluna existe. A policy "orgs: owners can update" já cobre a escrita. Schema: `perfilInvestidor: text('perfil_investidor', { enum: ['conservador', 'moderado', 'arrojado'] })`.

**`gastoMensalDosMeses`:**
- Considera os 6 meses fechados antes do mês de `hoje`.
- Faz a média de `|expense|` só dos meses que têm linha.
- Com menos de 3 meses, devolve `null`.

**`carregarContexto`:**
- Posições: `getPositions` sem as `estaEncerrada`. Depois uma query em `assets` pelos `assetId` traz `assetSubtype`, `cnpj`, `issuerName`, `indexer`, `indexerPercentage`, `preFixedRate`, `dueDate` e `ticker` original.
- Titular: a primeira conta com `titular` não nulo entre as de `porAtivo.get(assetId)`, em ordem de id.
- Caixa: `accounts` ativas com `type` em `checking`, `savings` ou `cash`.
- CDI: `cdiAcumulado(db, hoje − 12 meses, hoje)`.
- Perfil: lido de `orgs`.

**`salvarPerfilInvestidor`:**
- `'use server'`, `getOrgId()`, Zod enum, `update orgs` e `revalidatePath('/investments/diagnostico')`.
- Erro devolve `{ error }` com `mensagemDeErro()`.

- [ ] **Passo 1: testes que falham.**
  - `gastoMensalDosMeses` com 6 meses faz a média. Com 2 meses devolve `null`. Ignora o mês corrente. Com 4 meses divide por 4.
  - `carregarContexto`, com o db mockado como nos testes de `lib/investments`: posição encerrada fica fora; a conta `brokerage` não entra no caixa; o titular vem da conta do ativo.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar, incluindo a migration e o schema.
- [ ] **Passo 4:** rodar e ver passar. Rodar também `pnpm --filter @floow/db exec vitest run`.
- [ ] **Passo 5:** commit `feat(diagnostico): perfil do investidor e carregador do contexto`.

### Task 6: Aba Diagnóstico

**Arquivos:**
- Criar: `apps/web/app/(app)/investments/diagnostico/page.tsx`, `apps/web/app/(app)/investments/diagnostico/loading.tsx`
- Criar: `apps/web/components/investments/diagnostico/lista-de-achados.tsx`, `cartao-de-impacto.tsx`, `pergunta-de-perfil.tsx` (client)
- Modificar: `apps/web/components/investments/abas-de-investimentos.tsx` (acrescentar `{ href: '/investments/diagnostico', label: 'Diagnóstico' }` depois de Renda Passiva)
- Teste: `apps/web/__tests__/investments/diagnostico-tela.test.tsx`

**Interfaces que consome:** `carregarContexto`, `diagnosticar` e `salvarPerfilInvestidor`; `frescor(repoDrizzle(getServiceDb()))` para a data dos dados de mercado (usar `cdi` ou `bcb`, o job do BCB).

**Layout:** é o A da spec, seção "A tela". De cima para baixo:
1. a pergunta de perfil, só quando `perfil === null`;
2. o cartão de impacto;
3. a lista com borda por severidade (vermelho alta, laranja media, cinza info);
4. o rodapé com a data dos dados, o perfil com link "alterar" (que reabre a pergunta) e o aviso da CVM.

Estados vazios com os textos da spec. Componentes e cores existentes, só tema claro.

- [ ] **Passo 1: testes que falham** (render com Testing Library, no padrão dos testes de `__tests__/investments`).
  - Os achados aparecem na ordem recebida.
  - O cartão mostra "~R$ 1.600/ano" quando `impactoAnualCents = 160_000`.
  - A pergunta de perfil aparece com `perfil = null` e some com `'moderado'`.
  - Sem achados, aparece "Nenhum ponto de atenção na carteira hoje."
  - O aviso "Não constitui recomendação de investimento" está sempre presente.
  - A aba "Diagnóstico" fica ativa em `/investments/diagnostico`.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** rodar e ver passar. Rodar `pnpm --filter web exec next build --webpack` e confirmar que `/investments/diagnostico` aparece na saída.
- [ ] **Passo 5:** commit `feat(diagnostico): aba Diagnóstico em Investimentos`.

### Task 7: Consultor para de avisar concentração

**Arquivos:**
- Modificar: `packages/core-finance/src/cfo/analyzers/investment.ts` (remover o bloco `investment_concentration`; `consolidarPorAtivo` continua sendo usado pelo `investment_large_loss`)
- Modificar: `packages/core-finance/src/__tests__/cfo/investment-analyzer.test.ts` e `formato-pt-br.test.ts:49`
- Modificar: o comentário em `apps/web/lib/cfo/substituir-insights.ts:28`, se ele citar o tipo removido como exemplo

- [ ] **Passo 1:** trocar as expectativas. `analyzeInvestment` com alocação de 62% não devolve `investment_concentration`. O teste de lotes consolidados passa a checar o `investment_large_loss`.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** remover o bloco.
- [ ] **Passo 4:** rodar `pnpm --filter @floow/core-finance exec vitest run src/__tests__/cfo` e ver passar.
- [ ] **Passo 5:** commit `refactor(cfo): concentração passa para o Diagnóstico`.

### Task 8: Fechamento

- [ ] Rodar a suíte inteira: `pnpm -r exec vitest run`. A única falha aceita é uma das 8 que já existiam: auth-boundary auth/confirm, rls-ledger simulador-actions, pagina-conciliar ×3, pagina-regras ×2 e esqueletos.
- [ ] Build: `pnpm --filter web exec next build --webpack`.
- [ ] Depois disso, com o Ricardo:
  1. Ele aplica a 00085 no SQL Editor, copiando do arquivo.
  2. Merge em `master` e push.
  3. Ele abre a aba e confere à mão um achado de cada tipo que aparecer.
