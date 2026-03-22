# Design: Dívidas Contratadas — Controle de Dívidas

**Data:** 2026-03-22
**Status:** Aprovado

## Visão Geral

Módulo para controle de financiamentos, empréstimos, parcelamentos e consórcios. Cada dívida é vinculada a uma categoria de despesa, e o progresso (parcelas pagas, saldo devedor) é calculado automaticamente cruzando com transações reais dessa categoria.

## Navegação

Novo bloco **"Dívidas Contratadas"** no sidebar entre "Controle Patrimonial" e "Planejamento":
- Item: **Controle de Dívidas** → `/debts`

## Modelo de Dados

### Tabela `debts`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid PK | |
| org_id | uuid FK → orgs | Multi-tenant |
| name | text | Ex: "Financiamento Imóvel" |
| type | text | 'financing' / 'loan' / 'installment' / 'consortium' |
| total_cents | integer | Valor total contratado |
| installments | integer | Número total de parcelas |
| installment_cents | integer | Valor da parcela |
| interest_rate | numeric(7,4) | Taxa de juros mensal (%) |
| start_date | date | Data da primeira parcela |
| category_id | uuid FK → categories | Categoria para cruzar com transações |
| is_active | boolean default true | Dívida ativa ou quitada |
| created_at | timestamptz | |

### Indexes

- `(org_id, is_active)` — listar dívidas ativas

### RLS

Policy padrão: `org_id = (jwt -> app_metadata ->> 'org_id')::uuid`

## Categorias

Categorias de tipo `expense` criadas pelo usuário ao cadastrar a dívida, seguindo convenção "Dívidas: [nome]". Exemplos:
- "Dívidas: Financiamento Imóvel"
- "Dívidas: Empréstimo Pessoal"
- "Dívidas: Parcelamento TV"

O formulário de criação de dívida permite selecionar categoria existente ou criar uma nova automaticamente.

## Cálculo Automático de Progresso

O progresso de cada dívida é calculado cruzando com transações reais:

- **Parcelas pagas** = COUNT de transações com `category_id` da dívida
- **Valor pago** = SUM(ABS(amount_cents)) das transações com `category_id` da dívida
- **Saldo devedor** = total_cents - valor_pago
- **Próximo vencimento** = start_date + parcelas_pagas meses
- **Progresso %** = (valor_pago / total_cents) * 100

## Tipos de Dívida

| Valor | Label |
|-------|-------|
| financing | Financiamento |
| loan | Empréstimo |
| installment | Parcelamento |
| consortium | Consórcio |

## Página `/debts`

### Layout

- **PageHeader** com título "Controle de Dívidas" e botão "Nova dívida"
- **Tabela** com colunas:
  - Nome
  - Tipo (badge)
  - Parcelas (pagas/total)
  - Valor Pago
  - Saldo Devedor
  - Próx. Vencimento
  - Progresso (barra)
- **Rodapé** com total de saldo devedor
- **Ações por linha**: editar, excluir (com confirmação)

### Formulário de Nova Dívida

Campos: nome, tipo (select), valor total (R$), número de parcelas, valor da parcela (R$), taxa de juros (%), data início, categoria (select existente ou criar nova).

### Empty State

"Nenhuma dívida cadastrada." com botão "Cadastrar dívida".

## Estrutura de Arquivos

```
packages/db/src/schema/debt.ts          — Drizzle schema
packages/db/src/index.ts                — Barrel export
supabase/migrations/00018_debts.sql     — Migration + RLS
apps/web/lib/finance/debt-queries.ts    — Queries + progresso
apps/web/lib/finance/debt-actions.ts    — Server actions CRUD
apps/web/app/(app)/debts/page.tsx       — Server component
apps/web/app/(app)/debts/client.tsx     — Client component
components/layout/sidebar.tsx           — Novo bloco sidebar
```

## Dependências

- Transações (`transactions`) para cálculo automático de parcelas pagas
- Categorias (`categories`) para vinculação
