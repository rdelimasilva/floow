# Hybrid CFO — AI Agents para Insights Financeiros

**Data:** 2026-03-25
**Status:** Design aprovado

## Visao Geral

Um CFO pessoal automatizado que analisa os dados financeiros do usuario diariamente e entrega insights mastigados, priorizados por impacto, com acoes sugeridas executaveis. Nao e um chatbot — o usuario abre o app e a analise ja esta pronta.

## Decisoes de Design

| Decisao | Escolha | Razao |
|---|---|---|
| Arquitetura | Hybrid CFO (regras + LLM) | Confiabilidade de regras para dados financeiros + inteligencia do LLM para sintese |
| Frequencia | Cron diario + event triggers | Analise completa diaria + reacao imediata a eventos criticos |
| LLM provider | Agnostico (interface abstrata) | Evitar lock-in, permitir otimizar custo/qualidade |
| Custo LLM | Consciente — LLM so para sintese | ~$0.02-0.05/usuario/dia, maioria dos dias 0-1 chamadas |
| UX | Dashboard cards + pagina /cfo dedicada | Capturar atencao no dashboard + profundidade na pagina |
| Categorias de insight | Todas as 7 | Cobertura completa do CFO |

## Arquitetura em 3 Camadas

```
TRIGGERS (cron diario | event | user opens /cfo)
    |
    v
CAMADA 1 — ANALYSIS ENGINE (Deterministica, sem LLM)
    7 analyzers: cash_flow, budget, debt, investment,
    patrimony, retirement, behavior
    Output: InsightResult[] (tipo, severidade, dados, acao sugerida)
    |
    v (so se ha insights relevantes)
CAMADA 2 — LLM SYNTHESIS (Provider-agnostico)
    Correlaciona insights entre categorias
    Prioriza por impacto real
    Gera texto natural, tom de CFO
    Output: SynthesisOutput (insights priorizados + resumo diario)
    |
    v
CAMADA 3 — STORAGE + UI
    Tabela cfo_insights (persistencia com TTL)
    Dashboard: top 3 cards
    /cfo: visao completa com drill-down + acoes
```

## Camada 1 — Motor de Regras

### InsightResult (tipo compartilhado)

```typescript
type InsightCategory =
  | "cash_flow"
  | "budget"
  | "debt"
  | "investment"
  | "patrimony"
  | "retirement"
  | "behavior"

type InsightResult = {
  type: string                    // ex: "cash_flow_negative_trend"
  category: InsightCategory
  severity: "critical" | "warning" | "info" | "positive"
  title: string                   // texto template padrao (usado se LLM indisponivel)
  body: string                    // explicacao template padrao
  metric: Record<string, number>  // dados numericos que fundamentam
  suggestedAction?: {
    type: string                  // ex: "create_budget_goal"
    params: Record<string, unknown>
  }
}
```

### Inputs tipados por Analyzer

Cada analyzer recebe um input tipado (funcao pura, sem acesso ao DB):

```typescript
type CashFlowAnalyzerInput = {
  monthlyTotals: { month: string; income: number; expense: number }[]  // ultimos 3-6 meses
  accountBalances: { accountId: string; name: string; balance: number }[]
}

type BudgetAnalyzerInput = {
  goals: { category: string; limit: number; spent: number; period: string }[]
  historicalUsage: { category: string; month: string; spent: number }[]  // ultimos 3 meses
}

type DebtAnalyzerInput = {
  debts: { name: string; balance: number; monthlyPayment: number; interestRate: number; isOverdraft: boolean }[]
  monthlyIncome: number
}

type InvestmentAnalyzerInput = {
  positions: { asset: string; class: string; allocation: number; pnlPercent: number }[]
  totalInvested: number
  dividendsReceived: number
  dividendsExpected: number
}

type PatrimonyAnalyzerInput = {
  snapshots: { month: string; netWorth: number; liquidAssets: number }[]  // ultimos 6-12 meses
  fixedAssets: { name: string; currentValue: number; previousValue: number }[]
}

type RetirementAnalyzerInput = {
  plan: { targetAge: number; currentAge: number; monthlyContribution: number; desiredIncome: number } | null
  currentSavingsRate: number
  netWorth: number
}

type BehaviorAnalyzerInput = {
  transactions: { date: string; amount: number; category: string; dayOfWeek: number }[]  // ultimos 30-90 dias
  averageTransactionAmount: { current: number; previous: number }
}
```

A camada de orquestracao (`engine.ts`) busca os dados do DB e monta esses inputs antes de chamar cada analyzer.

### Os 7 Analyzers

**1. Cash Flow Analyzer**
- Receita vs despesa mensal (alerta se despesa > 90% da receita)
- Tendencia de gastos (3 meses crescentes consecutivos -> warning)
- Projecao: se tendencia continuar, em quantos meses o saldo zera
- Saldo de conta ficou negativo -> critical

**2. Budget Analyzer**
- Budget estourado no mes corrente -> warning/critical
- Categoria com gasto > 120% do orcado -> warning
- Budget com folga consistente (3 meses < 60%) -> info (sugerir realocar)

**3. Debt Analyzer**
- Custo total de juros/mes vs receita (> 30% -> critical)
- Cheque especial ativo -> critical
- Projecao de quitacao vs capacidade de pagamento
- Divida nova enquanto outras estao em atraso -> critical

**4. Investment Analyzer**
- Alocacao desbalanceada vs metas (se houver budget de investimento)
- Concentracao > 40% em um unico ativo -> warning
- Dividendos recebidos vs projetados
- Posicao com prejuizo > 20% -> info

**5. Patrimony Analyzer**
- Net worth cresceu/caiu vs mes anterior
- Marco atingido (multiplos de R$50k ou R$100k) -> positive
- Taxa de crescimento patrimonial (acelerando/desacelerando)
- Variacao significativa em ativos fixos (imoveis, veiculos) vs avaliacao anterior

**6. Retirement Analyzer**
- Progresso vs meta de FIRE/aposentadoria
- Impacto do gasto atual no plano (se continuar assim, atrasa X meses)
- Taxa de poupanca atual vs necessaria

**7. Behavior Analyzer**
- Gastos de fim de semana vs dia de semana
- Categorias com picos recorrentes (ex: delivery toda sexta)
- Gasto medio por transacao subindo
- Frequencia de transacoes incomum (muitas micro-transacoes)

### Event Trigger Mapping

| Evento | Analyzers disparados |
|---|---|
| Transacao criada/importada | Cash Flow, Budget, Behavior |
| Saldo negativo detectado | Cash Flow, Debt |
| Budget goal atualizado | Budget |
| Portfolio event criado | Investment |
| Divida criada/atualizada | Debt, Retirement |
| Snapshot mensal gerado | Patrimony, Retirement |

## Camada 2 — LLM Synthesis

### Provider-agnostico

```typescript
interface LLMProvider {
  synthesize(input: SynthesisInput): Promise<SynthesisOutput>
}

type SynthesisInput = {
  insights: InsightResult[]
  financialContext: {
    monthlyIncome: number
    monthlyExpenses: number
    netWorth: number
    debtTotal: number
    investmentTotal: number
    savingsRate: number
    topCategories: { name: string; amount: number }[]
  }
  locale: string  // default "pt-BR", extensivel para i18n futuro
}

type SynthesisOutput = {
  prioritizedInsights: {
    title: string               // "Seus gastos estao engolindo sua renda"
    body: string                // Explicacao em 2-3 frases
    detailMarkdown: string      // Drill-down com dados e contexto
    correlatedWith?: string[]   // IDs de outros insights relacionados
  }[]
  dailySummary: string          // Resumo geral do dia em 1-2 frases
}
```

### Estrategia de custo LLM

| Cenario | Chamada LLM? | Razao |
|---|---|---|
| Cron diario, insights encontrados | Sim (1 chamada) | Sintetiza todos os insights do dia |
| Cron diario, nenhum insight novo | Nao | Nada a sintetizar |
| Event trigger, severity <= info | Nao | Salva insight com texto template |
| Event trigger, severity = critical | Sim (1 chamada) | Merece sintese imediata |
| Usuario abre /cfo, insights frescos | Nao | Serve do banco |
| Usuario abre /cfo, insights stale | Reprocessa Camada 1 | So chama LLM se houver novidade |

O LLM **nao tem acesso a transacoes individuais** — so metricas agregadas. Reduz tokens e elimina risco de expor dados sensiveis.

### Merge InsightResult + SynthesisOutput

A integracao entre Camada 1 e Camada 2 funciona assim:

1. Camada 1 produz N `InsightResult[]` — cada um ja tem `title`/`body` template
2. Camada 2 (LLM) recebe todos e retorna `SynthesisOutput` com textos humanizados
3. O merge e **1:1 por index** — o LLM retorna um array do mesmo tamanho, na mesma ordem
4. Para cada insight: `title`, `body` e `detailMarkdown` do LLM sobrescrevem os templates
5. `severity`, `metric`, `suggestedAction`, `type`, `category` **nunca mudam** — vem da Camada 1
6. O LLM pode adicionar `correlatedWith` (referencias cruzadas entre insights)
7. O `dailySummary` e um campo extra que nao corresponde a nenhum insight individual

Se o LLM falhar, os insights sao salvos com os textos template da Camada 1 — sem perda de dados.

## Modelo de Dados

### Tabela: cfo_insights

```sql
CREATE TABLE cfo_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  detail_markdown TEXT,
  metric JSONB NOT NULL DEFAULT '{}',
  correlated_with TEXT[],         -- IDs como text (sem FK em arrays), filtrar invalidos no query
  suggested_action_type TEXT,
  suggested_action_params JSONB,
  source TEXT NOT NULL DEFAULT 'cron',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL, -- cron: +24h, event critical: +12h, positive: +7d
  dismissed_at TIMESTAMPTZ,
  acted_on_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: segue padrao JWT existente no projeto
ALTER TABLE cfo_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_insights_select" ON cfo_insights FOR SELECT TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_insights_insert" ON cfo_insights FOR INSERT TO authenticated
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_insights_update" ON cfo_insights FOR UPDATE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_insights_delete" ON cfo_insights FOR DELETE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE INDEX idx_cfo_insights_org_active
  ON cfo_insights (org_id, severity, generated_at DESC)
  WHERE dismissed_at IS NULL AND expires_at > now();
```

**Nota:** `correlated_with` usa `TEXT[]` em vez de `UUID[]` pois PostgreSQL nao suporta FK em arrays. Insights expirados podem deixar referencias orfas — o query filtra IDs invalidos no momento da leitura.

**TTL e cleanup:**
- Cron insights: `expires_at = generated_at + 24h`
- Event critical: `expires_at = generated_at + 12h`
- Positive (marcos): `expires_at = generated_at + 7d`
- Cleanup: pg_cron job semanal `DELETE FROM cfo_insights WHERE expires_at < now() - interval '30 days'` (manter 30 dias de historico apos expiracao para analytics)

### Tabela: cfo_runs

```sql
CREATE TABLE cfo_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,
  trigger_event TEXT NOT NULL DEFAULT 'cron_daily',  -- nunca nulo, facilita debounce index
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  analyzers_run TEXT[] NOT NULL,
  insights_generated INTEGER DEFAULT 0,
  llm_called BOOLEAN DEFAULT FALSE,
  llm_tokens_used INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: mesma politica JWT
ALTER TABLE cfo_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_runs_select" ON cfo_runs FOR SELECT TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_runs_insert" ON cfo_runs FOR INSERT TO authenticated
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE INDEX idx_cfo_runs_org_latest
  ON cfo_runs (org_id, run_type, started_at DESC);

-- Debounce: unique parcial para prevenir race condition
CREATE UNIQUE INDEX idx_cfo_runs_debounce
  ON cfo_runs (org_id, trigger_event)
  WHERE started_at > now() - interval '5 minutes';
```

**Nota sobre debounce:** O indice unique parcial `idx_cfo_runs_debounce` garante que INSERT concurrent para o mesmo `(org_id, trigger_event)` dentro de 5 minutos falha com conflict. O codigo usa `INSERT ... ON CONFLICT DO NOTHING` para debounce atomico sem race conditions.

**Nota sobre service role:** As API routes `run-daily` e `run-event` usam `serviceRoleKey` do Supabase, que bypassa RLS por padrao. As policies acima sao para acesso via frontend (GET insights, dismiss).

## Infraestrutura de Triggers

### Cron diario

**Prerequisito:** Requer extensao `pg_cron` (disponivel no Supabase Pro). Alternativa para free tier: Vercel Cron ou endpoint chamado por servico externo (e.g., cron-job.org).

```
pg_cron (03:00 BRT)
  -> POST /api/cfo/run-daily
    -> busca org_ids ativos (criterio: ao menos 1 transacao nos ultimos 30 dias)
    -> processa em batches de 10 orgs, sequencial entre batches
    -> timeout total: 5 minutos (Netlify/Vercel function limit)
    -> para cada org: Camada 1 -> Camada 2 (se necessario) -> salva insights
```

**Concorrencia:** Para escalar alem de ~50 orgs, migrar para queue-based (Upstash QStash ou similar). Na fase inicial, processamento sequencial em batches e suficiente.

### Event triggers

Fire-and-forget dentro dos server actions existentes, com logging de erro:

```typescript
async function triggerCfoAnalysis(
  orgId: string,
  event: string,
  analyzers: InsightCategory[]
) {
  fetch(`${baseUrl}/api/cfo/run-event`, {
    method: "POST",
    body: JSON.stringify({ orgId, event, analyzers }),
    headers: { authorization: `Bearer ${serviceRoleKey}` }
  }).catch((err) => {
    console.error(`[CFO] Event trigger failed for org=${orgId} event=${event}:`, err)
  })
}
```

### Debounce

- `cfo_runs` tem indice unique parcial `(org_id, trigger_event)` para janela de 5 minutos
- Insert usa `ON CONFLICT DO NOTHING` — debounce atomico sem race condition
- Import batch dispara trigger uma vez apos completar, nao por transacao

### API Routes

```
apps/web/app/api/cfo/
  run-daily/route.ts      # POST — pg_cron
  run-event/route.ts      # POST — server actions
  insights/route.ts       # GET  — frontend
```

## UX

### Dashboard — strip de 3 cards

- Ate 3 cards priorizados por severidade (critical primeiro)
- Cards critical/warning com borda colorida
- Titulo + body curto (2 linhas) + link de acao ou drill-down
- Sem insights do dia -> card positivo ("Tudo sob controle hoje")
- Carregado como RSC com Suspense boundary proprio (consistente com dashboard existente)

### Pagina /cfo

- Resumo diario do LLM no topo
- Insights agrupados por severidade (Critico > Atencao > Info > Positivo)
- Drill-down em accordion com analise detalhada
- Botoes de acao que mapeiam para server actions existentes
- Dismiss (seta dismissed_at) + feedback implicito (acted_on_at)
- Secao de descartados colapsada no final

### Sidebar

Novo item "CFO Pessoal" com badge de contagem (critical + warning ativos).

### Dismiss multi-tenant

Em orgs com multiplos membros, dismiss e **por org** (nao por usuario). Justificativa: insights financeiros sao sobre a org, nao sobre o individuo. Se um membro descarta, todos veem como descartado. Se no futuro for necessario dismiss per-user, migrar `dismissed_at` para uma junction table `cfo_insight_dismissals(insight_id, user_id, dismissed_at)`.

### Mapeamento de acoes sugeridas

| Acao sugerida | Server action existente |
|---|---|
| Criar/ajustar orcamento | `upsertBudgetGoal()` em `budget-actions.ts` |
| Ver transacoes filtradas | Redirect `/transactions?category=X&period=Y` |
| Ver conta | Redirect `/accounts/[id]` |
| Ajustar meta de aposentadoria | Redirect `/planning` (edicao inline existente) |

## Estrutura de Codigo

```
packages/core-finance/src/cfo/
  types.ts
  analyzers/
    cash-flow.ts
    budget.ts
    debt.ts
    investment.ts
    patrimony.ts
    retirement.ts
    behavior.ts
    index.ts
  llm/
    provider.ts
    anthropic.ts
    openai.ts
    synthesizer.ts
    prompts.ts
  engine.ts

packages/db/src/schema/
  cfo.ts

apps/web/
  app/(app)/cfo/
    page.tsx
    client.tsx
  app/api/cfo/
    run-daily/route.ts
    run-event/route.ts
    insights/route.ts
  components/cfo/
    insight-card.tsx
    insight-detail.tsx
    insight-actions.tsx
    daily-summary.tsx
    cfo-dashboard-strip.tsx
  lib/cfo/
    actions.ts
    queries.ts
    trigger.ts
```

## Testes

- **Analyzers (unit, Vitest):** Dados mockados, testar thresholds e edge cases
- **LLM Synthesizer (unit):** Provider mockado, testar montagem de prompt e fallback
- **API Routes (integration):** Verificar cfo_runs + cfo_insights, debounce
- **UI (Playwright E2E):** Dashboard strip, pagina /cfo, drill-down, dismiss

## Fallback e Resiliencia

| Falha | Comportamento |
|---|---|
| LLM indisponivel | Insights salvos com texto template generico |
| LLM timeout (>15s) | Cancela, usa template, loga em cfo_runs.error |
| Cron falha | Proxima abertura do app reprocessa on-demand |
| Dados insuficientes | Analyzer retorna [], nenhum insight inventado |
| Usuario novo (< 30 dias) | So analyzers com dados suficientes rodam |

## Rollout em 3 Fases

**Fase 1 — Motor de regras (sem LLM):**
- Analyzers + tabelas + API routes + UI
- Insights com texto template
- Ja entrega valor: alertas, acoes sugeridas, drill-down

**Fase 2 — Integracao LLM:**
- Camada 2 (synthesizer + provider)
- Texto humanizado substitui templates
- Resumo diario e correlacoes entre categorias

**Fase 3 — Event triggers:**
- Integrar triggerCfoAnalysis nos server actions
- Insights em tempo real para eventos criticos
