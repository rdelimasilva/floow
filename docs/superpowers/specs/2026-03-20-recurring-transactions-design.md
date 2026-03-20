# Recurring Transactions — Design Spec

## Overview

Permitir que o usuario crie lancamentos recorrentes (receita, despesa ou transferencia) diretamente no formulario de transacao existente. Ao marcar como recorrente, todas as transacoes sao geradas em batch de uma vez. Transacoes futuras existem no banco mas so impactam o saldo quando `date <= hoje`.

## Modelo de Dados

### Tabela `recurring_templates` (existente)

Campos atuais: `id`, `org_id`, `account_id`, `category_id`, `type`, `amount_cents`, `description`, `frequency`, `next_due_date`, `is_active`, `notes`, `created_at`, `updated_at`.

**Novos campos a adicionar:**

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `end_mode` | text ('count', 'end_date', 'indefinite') | Como o usuario definiu o termino |
| `installment_count` | integer nullable | Numero de parcelas (quando end_mode = 'count') |
| `end_date` | date nullable | Data final (quando end_mode = 'end_date') |
| `transfer_destination_account_id` | UUID nullable | Conta destino para transferencias recorrentes |

### Tabela `transactions` (existente)

**Novo campo:**

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `recurring_template_id` | UUID nullable | Referencia ao template de origem |

Sem FK no Drizzle schema (evitar circular import). Constraint FK existe no SQL migration.

### Campos auxiliares na tabela `transactions`

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `balance_applied` | boolean NOT NULL DEFAULT true | Se o saldo ja foi contabilizado. Transacoes futuras recorrentes sao criadas com `false`. |
| `installment_number` | integer nullable | Numero da parcela (ex: 3) |
| `installment_total` | integer nullable | Total de parcelas (ex: 24) |

### Indice de deduplicacao

O indice existente precisa ser alterado para suportar transferencias (duas legs por data):

```sql
-- Dropar indice antigo
DROP INDEX IF EXISTS uq_generated_transactions;
-- Novo indice inclui account_id para permitir pares de transferencia
CREATE UNIQUE INDEX uq_generated_transactions
  ON public.transactions (recurring_template_id, date, account_id)
  WHERE recurring_template_id IS NOT NULL;
```

### Semantica de `next_due_date` e `is_active` no modelo batch

No modelo batch (todas as transacoes geradas de uma vez), estes campos tem significado diferente do modelo incremental:

- `next_due_date`: setado para a data apos a ultima parcela gerada. Serve como registro de quando a serie termina. Se `end_mode = 'indefinite'`, aponta para a data apos os 60 meses gerados.
- `is_active`: significa "nao cancelado". `true` = serie ativa (parcelas futuras existem). `false` = serie cancelada pelo usuario.

### Drizzle Schema

- `recurringTemplates` table em `packages/db/src/schema/automation.ts`
- `recurringTemplateId`, `balanceApplied`, `installmentNumber`, `installmentTotal` adicionados em `packages/db/src/schema/finance.ts` na tabela `transactions`
- Usar `transactionTypeEnum('type')` no template (nao `text('type')`) para consistencia com a tabela transactions

## UX — Formulario de Transacao

### Toggle "Recorrente"

Posicionado abaixo do campo de data no `transaction-form.tsx`. Quando ativado, expande tres campos:

1. **Frequencia** — select com 6 opcoes:
   - Diario, Semanal, Quinzenal, Mensal, Trimestral, Anual

2. **Termino** — radio group com 3 opcoes:
   - "Numero de parcelas" (input numerico)
   - "Ate uma data" (date picker)
   - "Sem fim" (gera ate 60 meses)

3. **Preview** — texto informativo:
   - Ex: "Serao geradas 24 transacoes de R$ 500,00, de Mar/2026 a Fev/2028"
   - Atualiza automaticamente conforme o usuario altera frequencia/termino/valor

### Comportamento por tipo

- **Receita/Despesa**: formulario padrao + campos recorrentes
- **Transferencia**: conta origem + conta destino + campos recorrentes. Gera pares de transacoes (debito + credito) com `transferGroupId` compartilhado por par

### Descricao numerada

A descricao de cada transacao gerada segue o padrao: `"{descricao} ({n}/{total})"`.

- Ex: "Aluguel (1/24)", "Aluguel (2/24)", ..., "Aluguel (24/24)"
- Para modo "sem fim": usa o total calculado no momento da geracao (ex: "(1/60)")

## Server Action — `createRecurringTransactions`

Nova server action dedicada em `apps/web/lib/finance/actions.ts`.

### Input (Zod schema)

```typescript
{
  accountId: string
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  categoryId?: string | null
  startDate: string          // data da primeira parcela
  frequency: RecurringFrequency
  endMode: 'count' | 'end_date' | 'indefinite'
  installmentCount?: number  // obrigatorio quando endMode = 'count'
  endDate?: string           // obrigatorio quando endMode = 'end_date'
  // transfer-specific
  destinationAccountId?: string  // obrigatorio quando type = 'transfer'
}
```

### Logica

1. **Validacao**: Zod parse + verificar que conta pertence ao org
2. **Calculo de datas**: usar `advanceByFrequency` em loop a partir de `startDate`
   - `count`: gerar N datas
   - `end_date`: gerar ate `endDate` (inclusive)
   - `indefinite`: gerar ate 60 meses a partir de `startDate`
3. **Auto-categorizacao**: se `categoryId` nao fornecido e tipo != transfer, buscar `getCategoryRules` e aplicar `matchCategory` ANTES de entrar na transaction
4. **Dentro de `db.transaction()`**:
   a. Inserir template em `recurring_templates`
   b. Inserir todas as transacoes em batch:
      - `recurring_template_id` = template.id
      - `description` = "{desc} ({n}/{total})"
      - `installment_number` = n, `installment_total` = total
      - **Convencao de sinal (igual ao `createTransaction` existente):**
        - Receita: `amountCents` = +valor (positivo)
        - Despesa: `amountCents` = -valor (negativo)
        - Transferencia: leg origem = -valor, leg destino = +valor
      - Para transferencias: inserir par com `transferGroupId` compartilhado, `categoryId = null`
   c. Calcular saldo: somar `amountCents` das transacoes com `date <= hoje`
      - Receita: soma positiva
      - Despesa: soma negativa
      - Transferencia: debita origem, credita destino
   d. Atualizar `balance_cents` da(s) conta(s) com `sql\`balance_cents + ${delta}\``
5. **`revalidatePath('/transactions')`**

### Limites e validacoes

- **Maximo de parcelas (installments):** 120 para qualquer modo/frequencia
- **Modo indefinido:** gera ate 60 meses OU 120 parcelas (o que vier primeiro)
- **Maximo de rows no banco:** 240 por batch (120 parcelas x 2 legs para transferencias)
- `startDate` deve ser uma data valida
- Para transferencias: `accountId !== destinationAccountId`
- `amountCents > 0`
- Conta(s) deve(m) estar ativa(s) (`isActive = true`)

## Cancelamento — `cancelRecurring`

Nova server action em `apps/web/lib/finance/actions.ts`.

### Input

```typescript
{
  templateId: string
}
```

### Logica

1. Verificar que o template pertence ao org do usuario
2. Dentro de `db.transaction()`:
   a. Buscar transacoes futuras: `recurring_template_id = templateId AND date > hoje`
      **IMPORTANTE:** usar `date > hoje` (estritamente maior). Transacoes com `date = hoje` ja podem ter sido reconciliadas no saldo. Usar `>=` causaria inconsistencia de saldo.
   b. Para transferencias: buscar `transferGroupId` das transacoes futuras e deletar os pares
   c. Deletar todas as transacoes futuras. Como elas tem `balance_applied = false`, o saldo nao precisa ser revertido.
   d. Marcar template como `is_active = false`
3. `revalidatePath('/transactions')`

### Acesso

- Botao "Cancelar recorrencia" no menu de acoes (tres pontinhos) de qualquer transacao com `recurring_template_id`
- Confirmacao antes de executar: "Isso ira remover X transacoes futuras. Continuar?"

## Saldo — Reconciliacao

### Principio

`balance_cents` na tabela `accounts` reflete apenas transacoes com `date <= hoje`. Transacoes futuras existem no banco mas nao impactam o saldo armazenado.

### Na criacao

A server action calcula quantas parcelas tem `date <= hoje` e atualiza o saldo apenas por essas.

### Na consulta

Queries de saldo (`getAccounts`, dashboard, etc.) ja exibem `balance_cents` que reflete a realidade ate hoje. Nenhuma mudanca necessaria se o saldo for atualizado corretamente.

### Atualizacao diaria

As transacoes futuras que "vencem" a cada dia precisam impactar o saldo. Duas opcoes:

1. **Recalculo sob consulta**: quando o usuario acessa a pagina, uma query verifica transacoes recorrentes com `date <= hoje` que ainda nao foram contabilizadas no saldo e atualiza
2. **Marca de contabilizacao**: campo `balance_applied` (boolean) na transacao. Na criacao, transacoes futuras ficam `false`. Uma funcao (chamada no acesso ou via cron) processa as que viraram `date <= hoje` e aplica o saldo

**Decisao: opcao 2 (marca de contabilizacao)**. Mais segura — evita recalculos parciais e da rastreabilidade. O campo `balance_applied` indica se aquela transacao ja foi contada no saldo.

### Fluxo de reconciliacao

Server action `reconcileRecurringBalances(orgId)`:
1. Buscar transacoes com `recurring_template_id IS NOT NULL AND balance_applied = false AND date <= hoje`
2. Agrupar por `account_id` e somar os `signed_amounts`
3. Dentro de `db.transaction()`: atualizar `balance_cents` de cada conta e marcar transacoes como `balance_applied = true`
4. **Trigger:** chamar em `apps/web/app/(app)/layout.tsx` (server component do layout principal).
   - Short-circuit: query rapida `SELECT 1 FROM transactions WHERE balance_applied = false AND date <= current_date AND org_id = $1 LIMIT 1`. Se nao retornar nada, nao faz nada.
   - Alternativa futura: cron via Supabase pg_cron (v2).

### Timezone

Todas as comparacoes `date <= hoje` usam a data do calendario local (Brasil, UTC-3). No server, calcular "hoje" com:
```typescript
const today = new Date()
today.setHours(0, 0, 0, 0) // normalizar para meia-noite local
const todayStr = today.toISOString().split('T')[0] // 'YYYY-MM-DD'
```
Usar `todayStr` como parametro nas queries SQL (nao usar `current_date` do PostgreSQL, pois depende do timezone do servidor).

## Visual no Extrato

### Indicacao de recorrencia

- Icone `Repeat` (lucide-react) ao lado da descricao de transacoes com `recurring_template_id`
- A numeracao "(3/24)" na descricao ja serve como identificador visual
- Transacoes futuras (`date > hoje`) podem ter opacidade reduzida ou badge "Agendada"

### Acoes disponiveis

- Transacao com `recurring_template_id`: menu de acoes inclui "Cancelar recorrencia"
- A edicao/exclusao individual continua funcionando, mas com ajustes:
  - `deleteTransaction` deve checar `balance_applied`: se `false`, nao reverter saldo ao deletar
  - `updateTransaction` deve checar `balance_applied`: se `false`, nao reverter saldo antigo (apenas aplicar novo se data <= hoje)
  - Gaps na numeracao sao aceitaveis (ex: "(1/24)", "(3/24)" se o usuario deletou a 2a parcela)

## Migration SQL

```sql
-- Novos campos em recurring_templates
ALTER TABLE public.recurring_templates
  ADD COLUMN end_mode text NOT NULL DEFAULT 'count',
  ADD COLUMN installment_count integer,
  ADD COLUMN end_date date,
  ADD COLUMN transfer_destination_account_id uuid REFERENCES public.accounts(id);

-- Novos campos em transactions
ALTER TABLE public.transactions
  ADD COLUMN recurring_template_id uuid REFERENCES public.recurring_templates(id),
  ADD COLUMN balance_applied boolean NOT NULL DEFAULT true,
  ADD COLUMN installment_number integer,
  ADD COLUMN installment_total integer;

-- Transacoes futuras criadas por recorrencia terao balance_applied = false
-- Transacoes normais (nao recorrentes) sempre tem balance_applied = true (default)

-- Indice para reconciliacao (parcial, so rows pendentes)
CREATE INDEX idx_transactions_balance_pending
  ON public.transactions (org_id, date)
  WHERE balance_applied = false AND recurring_template_id IS NOT NULL;

-- Atualizar indice de deduplicacao para suportar transferencias
DROP INDEX IF EXISTS uq_generated_transactions;
CREATE UNIQUE INDEX uq_generated_transactions
  ON public.transactions (recurring_template_id, date, account_id)
  WHERE recurring_template_id IS NOT NULL;

-- RLS ja existe para recurring_templates (migration 00006)
```

## Arquivos a criar/modificar

### Novos
- `packages/db/src/schema/automation.ts` — adicionar `recurringTemplates` table object
- Migration SQL para novos campos

### Modificar
- `packages/db/src/schema/finance.ts` — adicionar `recurringTemplateId`, `balanceApplied`, `installmentNumber`, `installmentTotal` na tabela transactions
- `apps/web/lib/finance/actions.ts` — adicionar `createRecurringTransactions`, `cancelRecurring`, `reconcileRecurringBalances`; modificar `deleteTransaction` e `updateTransaction` para checar `balance_applied`
- `apps/web/lib/finance/queries.ts` — adicionar `recurringTemplateId` no select de `getTransactions`; query para buscar transacoes de um template
- `apps/web/components/finance/transaction-form.tsx` — toggle recorrente + campos de frequencia/termino
- `apps/web/components/finance/transaction-list.tsx` — icone Repeat + menu "Cancelar recorrencia"
- `apps/web/app/(app)/layout.tsx` — chamar `reconcileRecurringBalances` com short-circuit
- `packages/db/src/schema/index.ts` — exportar novas tabelas/campos

### Nota sobre planos existentes (Phase 07)

Este design supersede os planos 07-01 e 07-02 existentes. Principais diferencas:
- Transferencias recorrentes agora sao suportadas (antes excluidas)
- Modelo batch (gerar tudo de uma vez) em vez de geracao sob demanda
- UX integrada no formulario existente em vez de pagina separada
- Usa `transactionTypeEnum` em vez de `text('type')` no Drizzle schema
