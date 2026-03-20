# Ativos Imobilizados — Design Spec

**Date:** 2026-03-19
**Status:** Approved

## Overview

Módulo de cadastro e acompanhamento de ativos imobilizados (imóveis, veículos, etc.) com valorização/depreciação automática baseada em taxa anual, e atualização manual do valor de mercado. Impacta o cálculo de patrimônio líquido.

## Data Model

### `fixed_asset_types` — Tipos configuráveis

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| org_id | uuid FK → orgs | nullable — null = tipo padrão do sistema |
| name | text NOT NULL | ex: "Imóvel", "Veículo" |
| is_system | boolean NOT NULL | default false |
| created_at | timestamptz | default now() |

**Seed padrão (is_system = true, org_id = null):**
- Imóvel
- Veículo
- Outro

### `fixed_assets` — Ativo imobilizado

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| org_id | uuid FK → orgs NOT NULL | ON DELETE CASCADE |
| type_id | uuid FK → fixed_asset_types NOT NULL | |
| name | text NOT NULL | ex: "Apartamento Centro", "Honda Civic 2022" |
| purchase_value_cents | integer NOT NULL | valor de compra em centavos |
| purchase_date | date NOT NULL | data da aquisição |
| current_value_cents | integer NOT NULL | último valor conhecido (manual ou = purchase) |
| current_value_date | date NOT NULL | data da última atualização de valor |
| annual_rate | numeric(7,4) NOT NULL | ex: 0.0300 = +3%, -0.1000 = -10% |
| address | text | opcional — endereço do imóvel |
| license_plate | text | opcional — placa do veículo |
| model | text | opcional — modelo/descrição adicional |
| is_active | boolean NOT NULL | default true |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Ao criar:** `current_value_cents` = `purchase_value_cents`, `current_value_date` = `purchase_date`.

**Ao atualizar valor manualmente:** atualiza `current_value_cents` e `current_value_date` para a data informada. A taxa anual passa a incidir sobre esse novo valor a partir dessa data.

### RLS Policies

Seguem o mesmo padrão das outras tabelas:
- `fixed_asset_types`: SELECT para authenticated (system types visíveis a todos), INSERT/UPDATE/DELETE para org members (own types only)
- `fixed_assets`: CRUD para org members via `get_user_org_ids()`

## Business Logic

### Estimativa de valor atual

Função pura em `@floow/core-finance`:

```typescript
function estimateAssetValue(
  baseValueCents: number,
  baseDate: Date,
  annualRate: number,
  referenceDate: Date = new Date()
): number
```

- `baseValueCents` = `current_value_cents` (último valor conhecido)
- `baseDate` = `current_value_date`
- Fórmula: `baseValueCents × (1 + annualRate) ^ (diasDecorridos / 365)`
- Retorna valor em centavos (arredondado)

### Impacto no patrimônio

`computeSnapshot()` em `core-finance` deve incluir a soma dos valores estimados de todos os ativos imobilizados ativos da org. Aparece no breakdown como tipo `"fixed_assets"` com label "Imobilizado".

## Sidebar

Nova seção no menu:

```
Investimentos
  └ Investimentos

Ativos Imobilizados    ← NOVO
  └ Ativos Imobilizados

Planejamento
  └ Planejamento
```

Ícone sugerido: `Building2` ou `Landmark` (Lucide).

## Pages

### `/fixed-assets` — Listagem

- PageHeader: "Ativos Imobilizados" + descrição + botão "Novo Ativo"
- Tabela com colunas: Nome, Tipo, Valor de Compra, Valor Atual (estimado), Taxa Anual, Status
- Valor atual calculado client-side via `estimateAssetValue()`
- Total estimado no rodapé
- CRUD de tipos inline (como categorias) — acessível via tabs ou seção colapsável

### `/fixed-assets/new` — Cadastro

Formulário com campos:
- Nome (obrigatório)
- Tipo (select — obrigatório)
- Valor de compra (obrigatório, input monetário)
- Data de compra (obrigatório)
- Taxa anual % (obrigatório, aceita negativo)
- Endereço (opcional)
- Placa (opcional)
- Modelo (opcional)

### `/fixed-assets/[id]` — Detalhe

- Dados do ativo
- Valor estimado atual (calculado)
- Botão "Atualizar Valor de Mercado" → abre form inline: novo valor + data
- Histórico de atualizações manuais (se quisermos persistir — V2)
- Link para editar

### `/fixed-assets/[id]/edit` — Edição

Mesmo formulário do cadastro, pré-preenchido.

## Files Affected

| Layer | Files |
|-------|-------|
| Migration | `supabase/migrations/00010_fixed_assets.sql` |
| DB Schema | `packages/db/src/schema/fixed-assets.ts` (novo) |
| DB Index | `packages/db/src/index.ts` (export novo schema) |
| Core Finance | `packages/core-finance/src/asset-valuation.ts` (novo) |
| Core Finance | `packages/core-finance/src/snapshot.ts` (modificar computeSnapshot) |
| Shared | `packages/shared/src/schemas/fixed-assets.ts` (novo — Zod schemas) |
| Actions | `apps/web/lib/fixed-assets/queries.ts` (novo) |
| Actions | `apps/web/lib/fixed-assets/actions.ts` (novo) |
| Components | `apps/web/components/fixed-assets/asset-form.tsx` (novo) |
| Components | `apps/web/components/fixed-assets/asset-list.tsx` (novo) |
| Components | `apps/web/components/fixed-assets/asset-type-list.tsx` (novo) |
| Components | `apps/web/components/fixed-assets/update-value-form.tsx` (novo) |
| Pages | `apps/web/app/(app)/fixed-assets/page.tsx` (novo) |
| Pages | `apps/web/app/(app)/fixed-assets/new/page.tsx` (novo) |
| Pages | `apps/web/app/(app)/fixed-assets/[id]/page.tsx` (novo) |
| Pages | `apps/web/app/(app)/fixed-assets/[id]/edit/page.tsx` (novo) |
| Sidebar | `apps/web/components/layout/sidebar.tsx` (adicionar seção) |
| Patrimônio | `apps/web/components/finance/patrimony-summary.tsx` (label "Imobilizado") |

## What Does NOT Change

- Módulo de investimentos (ações, FIIs, etc.)
- Módulo de transações/contas
- Estrutura de autenticação
- Layout geral (já redesenhado)

## Success Criteria

- CRUD completo de tipos e ativos imobilizados
- Valor estimado calculado automaticamente pela taxa anual
- Atualização manual do valor de mercado redefine a base de cálculo
- Patrimônio líquido inclui valor estimado dos ativos imobilizados
- Campos opcionais (endereço, placa, modelo) funcionam sem obrigatoriedade
- Tipos pré-configurados (Imóvel, Veículo, Outro) disponíveis por padrão
