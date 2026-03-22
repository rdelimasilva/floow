# Design: Orçamento (Metas de Gastos + Investimentos)

**Data:** 2026-03-22
**Status:** Aprovado

## Visão Geral

Módulo de orçamento com dois sub-módulos: metas de gastos (teto global + limites por categoria) e metas de investimentos (aporte periódico + meta de patrimônio). Progresso calculado automaticamente a partir de transações reais, com possibilidade de ajuste manual. Alertas visuais na própria página e no dashboard.

## Navegação

Novo bloco **"Orçamento"** no sidebar, posicionado entre "Dia a dia" e "Investimentos":

- Ícone do grupo: `PiggyBank` (lucide-react)
- Sub-itens:
  - **Meta de gastos** → `/budgets/spending`
  - **Meta de investimentos** → `/budgets/investing`

O sidebar já suporta seções com múltiplos itens (padrão `NAV_SECTIONS`). Basta adicionar uma nova seção.

## Meta de Gastos (`/budgets/spending`)

### Funcionalidades

1. **Teto global de despesas**: valor máximo total de gastos para o período configurado
2. **Limites por categoria**: opcionalmente define teto individual por categoria de despesa (ex: Alimentação R$800, Lazer R$300)
3. **Períodos configuráveis**: mensal, trimestral, semestral ou anual — cada meta define seu próprio período
4. **Progresso automático**: calcula gastos puxando transações do tipo `expense` no período atual, agrupadas por categoria
5. **Ajuste manual**: permite adicionar/subtrair valores para corrigir discrepâncias (ex: reembolso pendente)

### Visualização

- Barra de progresso por categoria e uma barra de progresso global (teto)
- Cores da barra:
  - **Verde**: < 70% do limite
  - **Amarelo**: 70–90% do limite
  - **Vermelho**: > 90% do limite
- Valor gasto vs. limite exibido ao lado de cada barra
- Período atual destacado no topo da página

### UI

- **PageHeader** com título "Meta de Gastos" e botão "Editar meta"
- Card superior com teto global + barra de progresso
- Grid de cards por categoria com barra + valores
- Botão "Ajuste manual" abre dialog para registrar ajuste com descrição

## Meta de Investimentos (`/budgets/investing`)

### Funcionalidades

1. **Aporte periódico**: meta de quanto investir por período (ex: R$2.000/mês)
2. **Meta de patrimônio**: valor-alvo de patrimônio investido com data limite (ex: R$500.000 até dez/2027)
3. **Períodos configuráveis**: mesmos do módulo de gastos (mensal, trimestral, semestral, anual)
4. **Progresso automático de aportes**: puxado de `portfolio_events` com tipo `buy` no período
5. **Progresso de patrimônio**: comparado com soma de posições atuais (`positions` × preço atual)
6. **Ajuste manual**: mesma mecânica do módulo de gastos

### Visualização

- Card de aporte periódico com barra de progresso (mesmas cores do módulo de gastos)
- Card de meta de patrimônio com:
  - Valor atual vs. meta
  - Barra de progresso
  - Projeção: "no ritmo atual, você atinge a meta em X meses"
- Histórico de aportes por período em mini-gráfico de barras

### UI

- **PageHeader** com título "Meta de Investimentos" e botão "Editar meta"
- Card superior: aporte do período atual
- Card inferior: meta de patrimônio com projeção
- Botão "Ajuste manual" com dialog

## Alertas no Dashboard

Card **"Metas em risco"** no dashboard (`/dashboard`):

- Aparece apenas quando há metas em risco (>80% gasto ou abaixo do ritmo de aporte)
- Lista cada meta em risco com:
  - Nome da meta
  - Progresso atual (ex: "R$4.200 de R$5.000 — 84%")
  - Link direto para a página da meta
- Metas de gasto: alerta quando > 80% do limite
- Metas de investimento: alerta quando aporte está abaixo do ritmo proporcional ao período (ex: dia 20 do mês e investiu < 66%)

## Banco de Dados

### Novas tabelas

#### `budget_goals`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid PK | |
| org_id | uuid FK → orgs | Multi-tenant |
| type | enum('spending', 'investing') | Tipo da meta |
| name | text | Nome da meta (ex: "Orçamento mensal", "Aporte mensal") |
| target_cents | integer | Valor-alvo em centavos |
| period | enum('monthly', 'quarterly', 'semiannual', 'annual') | Período de recorrência |
| patrimony_target_cents | integer NULL | Meta de patrimônio (apenas investing) |
| patrimony_deadline | date NULL | Data limite para patrimônio (apenas investing) |
| is_active | boolean default true | Meta ativa ou pausada |
| created_at | timestamptz | |

#### `budget_category_limits`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid PK | |
| budget_goal_id | uuid FK → budget_goals | |
| category_id | uuid FK → categories | |
| limit_cents | integer | Teto para esta categoria |

Constraint: unique(budget_goal_id, category_id)

#### `budget_adjustments`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid PK | |
| budget_goal_id | uuid FK → budget_goals | |
| amount_cents | integer | Positivo = adiciona gasto/aporte, negativo = subtrai |
| description | text | Motivo do ajuste |
| date | date | Data do ajuste |
| created_at | timestamptz | |

### Indexes

- `budget_goals`: (org_id, type, is_active)
- `budget_category_limits`: (budget_goal_id)
- `budget_adjustments`: (budget_goal_id, date)

### RLS

Todas as tabelas com RLS habilitado, policy padrão: `org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid`

## Queries de Progresso

### Gastos no período

```sql
SELECT category_id, SUM(ABS(amount_cents)) as spent
FROM transactions
WHERE org_id = $1
  AND type = 'expense'
  AND date >= $period_start
  AND date <= $period_end
  AND is_ignored = false
GROUP BY category_id
```

Somado com ajustes manuais do mesmo período da `budget_adjustments`.

### Aportes no período

```sql
SELECT SUM(total_cost_cents) as invested
FROM portfolio_events
WHERE org_id = $1
  AND event_type = 'buy'
  AND event_date >= $period_start
  AND event_date <= $period_end
```

### Patrimônio atual

Soma de `positions.quantity * latest_price` para o org.

## Estrutura de Arquivos

```
app/(app)/budgets/
├── spending/
│   └── page.tsx          (Meta de gastos)
├── investing/
│   └── page.tsx          (Meta de investimentos)
└── (shared components em components/finance/budget-*)

components/finance/
├── budget-progress-bar.tsx    (Barra de progresso reutilizável)
├── budget-goal-form.tsx       (Form de criação/edição de meta)
├── budget-adjustment-dialog.tsx (Dialog de ajuste manual)
└── budget-alert-card.tsx      (Card de alertas para dashboard)

lib/finance/
├── budget-queries.ts          (Queries de metas e progresso)
└── budget-actions.ts          (Server actions CRUD)

packages/db/src/schema/
└── budget.ts                  (Drizzle schema)

supabase/migrations/
└── 00014_budget_goals.sql     (Migration + RLS)
```

## Dependências

- Transações existentes (`transactions` table) para cálculo automático de gastos
- Eventos de portfólio (`portfolio_events`) para cálculo de aportes
- Posições (`positions`) para patrimônio atual
- Categorias (`categories`) para limites por categoria
- Dashboard (`app/(app)/dashboard/page.tsx`) para card de alertas
