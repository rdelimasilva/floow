# Revisão de QA — Projeto Floow
**Data:** 2026-05-13  
**Escopo:** Monorepo completo (`apps/web`, `apps/mobile`, `packages/core-finance`, `packages/db`, `packages/shared`)

---

## Resumo Executivo

O projeto tem uma arquitetura sólida e bem organizada (Turborepo + pnpm, Next.js 16, Supabase, Drizzle ORM, Stripe, engine de IA com Claude). A lógica financeira pura (`core-finance`) é bem testada e desacoplada. Porém, foram identificados **4 problemas críticos** que precisam de atenção imediata, além de vários pontos de melhoria.

---

## 🔴 Crítico

### 1. Middleware de rota não está sendo invocado — sem proteção de páginas
**Arquivo:** `apps/web/lib/supabase/middleware.ts` / raiz do app  

O arquivo `apps/web/lib/supabase/middleware.ts` exporta `updateSession()`, mas **não existe um `apps/web/middleware.ts`** na raiz do app que o chame. Isso significa que o Next.js nunca executa a verificação de sessão em nenhuma rota — qualquer pessoa não autenticada pode acessar rotas protegidas como `/dashboard`, `/transactions`, etc.

**Correção:** Criar `apps/web/middleware.ts`:
```ts
import { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  if (!user && !request.nextUrl.pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    return Response.redirect(url)
  }
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
}
```

---

### 2. RLS (Row Level Security) sem nenhum teste automatizado
**Arquivo:** `packages/db/src/__tests__/rls.test.ts`

O arquivo inteiro contém apenas stubs `it.todo(...)`. A isolação multi-tenant (cada org vê só seus dados) é a garantia de segurança mais crítica do sistema e não tem cobertura alguma.

```ts
// ESTADO ATUAL — todos os testes são TODO
it.todo('user can only read orgs they belong to')
it.todo('user cannot read another org\'s subscriptions')
// ...
```

**Risco:** Um bug de query que vaze dados entre orgs seria indetectável até produção.

---

### 3. Arquivos violando o limite de 500 linhas (regra do CLAUDE.md)
**Regra:** Nenhum arquivo deve ultrapassar 500 linhas.

| Arquivo | Linhas |
|---|---|
| `apps/web/lib/finance/actions.ts` | **1.477** |
| `apps/web/lib/investments/actions.ts` | **555** |
| `apps/web/components/finance/transaction-form.tsx` | **544** |
| `apps/web/components/finance/import-form.tsx` | **544** |

O `actions.ts` de finanças tem quase 3x o limite. Dificulta revisão, aumenta chance de conflitos de merge e torna os testes unitários mais difíceis.

---

### 4. E2E tests — diretório vazio
**Arquivo:** `e2e/` + `playwright.config.ts`

O Playwright está configurado mas o diretório `e2e/` está vazio — nenhum teste de fluxo completo (login → criar conta → lançar transação → ver dashboard, etc.).

---

## 🟠 Alta Severidade

### 5. Lógica de decodificação JWT duplicada
**Arquivos:** `apps/web/lib/finance/queries.ts` (função `decodeJwtOrgId`) e `apps/web/app/api/cfo/chat/route.ts` (inline, sem nome)

A mesma lógica de parse do JWT para extrair `org_ids` está duplicada. Se o formato do claim mudar, precisará ser corrigido em dois lugares.

**Correção:** Exportar `decodeJwtOrgId` de `queries.ts` e importar na rota do chat.

---

### 6. `as any` em lógica financeira crítica
**Arquivo:** `apps/web/lib/finance/recurring-actions.ts`

Há múltiplos casts `as any` em torno do enum `frequency`:
```ts
const overdueDates = getOverdueDates(template.nextDueDate, template.frequency as any, today)
frequency: frequency as any,
const newNextDueDate = advanceByFrequency(lastDate, frequency as any)
```

Isso anula a segurança de tipos exatamente onde erros de valor causariam transações recorrentes geradas incorretamente.

**Causa provável:** O tipo do campo no Drizzle schema não está sendo reutilizado como o tipo do parâmetro da função. Melhor criar um tipo exportado `type Frequency = typeof frequencyEnum.enumValues[number]` e usá-lo consistentemente.

---

### 7. `mapStripeStatus` com fallback perigoso
**Arquivo:** `apps/web/app/api/webhooks/stripe/route.ts`

```ts
default:
  return 'active'  // status desconhecido → ativa assinatura!
```

Qualquer status Stripe não mapeado (ex: `'unpaid'` em novas versões da API) resulta em marcar a assinatura como `'active'`. O caso `'unpaid'` já está mapeado, mas o padrão deveria ser `'past_due'` ou lançar um erro loggado, não `'active'`.

---

### 8. `invoice.payment_succeeded` usa cast inseguro na API Stripe
**Arquivo:** `apps/web/app/api/webhooks/stripe/route.ts`

```ts
const periodEnd = (invoice as unknown as { lines?: { data?: Array<{ period?: { end?: number } }> } }).lines?.data?.[0]?.period?.end
```

O SDK do Stripe tem tipagem própria para isso. Usar `invoice.lines.data[0].period.end` diretamente, ou `(invoice as Stripe.Invoice & { lines: Stripe.ApiList<Stripe.InvoiceLineItem> })`.

---

### 9. `assertEnv` não é usado — crashes silenciosos em produção
**Arquivo:** `packages/shared/src/env.ts`

Existe um utilitário `assertEnv(name)` que valida e lança erro claro quando uma variável de ambiente está ausente, mas o código o ignora. Em vez disso, usa `process.env.VAR!` em todo lugar (com non-null assertion). Se `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` não estiverem definidas, o app crasha em runtime em vez de falhar em startup com mensagem clara.

---

## 🟡 Média Severidade

### 10. Componente de gráfico sem tipagem
**Arquivo:** `apps/web/components/finance/cash-flow-chart.tsx`

```ts
data: any[]
```

A prop `data` do chart está tipada como `any[]`. Dado que o componente lida com dados financeiros de múltiplas séries, uma tipagem explícita evitaria passar dados no formato errado silenciosamente.

---

### 11. `customer.subscription.updated` não atualiza `current_period_end`
**Arquivo:** `apps/web/app/api/webhooks/stripe/route.ts`

O evento `customer.subscription.updated` atualiza status e `cancel_at_period_end`, mas não atualiza `current_period_end`. Esse campo é atualizado apenas em `invoice.payment_succeeded`. Se houver mudança de plano sem renovação imediata, o `current_period_end` pode ficar desatualizado até o próximo pagamento.

---

### 12. Sem rate limiting no endpoint `run-event`
**Arquivo:** `apps/web/app/api/cfo/run-event/route.ts`

O endpoint `run-daily` tem batching e tratamento de erro por org. O `run-event` não tem proteção equivalente — um loop de eventos mal configurado poderia gerar chamadas ilimitadas ao LLM.

---

### 13. Testes do `actions.test.ts` mockam API desatualizada
**Arquivo:** `apps/web/__tests__/finance/actions.test.ts`

O teste mocka `createDb` de `@floow/db`, mas o código de produção usa `getDb()`. Isso significa que os mocks podem não estar interceptando corretamente as chamadas reais, e os testes podem dar falso positivo.

---

## 🟢 Pontos Positivos

O projeto tem vários padrões muito bem executados:

- **Validação Zod em todas as server actions** — `createAccountSchema.parse(...)` antes de qualquer escrita no DB.
- **Updates de saldo atômicos** — `sql\`balance_cents + ${delta}\`` evita race conditions em operações de transferência.
- **`assertAccountOwnership()`** — Verificação explícita de posse antes de modificar qualquer conta, em todas as actions relevantes.
- **Rate limiting no chat do CFO** — 30 mensagens/hora por org, implementado no handler.
- **`core-finance` puro** — Toda lógica financeira (simulação, recorrência, portfólio) é função pura sem dependência de DB. Fácil de testar, fácil de reutilizar.
- **Cobertura de testes unitários em core-finance** — 19 arquivos de teste cobrindo balance, cash-flow, categorização, simulação, portfólio, importação OFX/CSV, CFO analyzers, etc.
- **React `cache()` para deduplicação** — `getOrgId`, `getAccounts` e outras queries usam `cache()` corretamente para evitar múltiplas chamadas por request.
- **Fallback de JWT → DB para orgId** — Se o custom_access_token_hook não injetar o claim, o sistema faz fallback gracioso para consulta no DB.
- **Webhook Stripe retorna 200 mesmo em erro de handler** — Evita retries desnecessários do Stripe em erros de lógica interna.
- **`console.error` apenas em erros reais** — Sem `console.log` de debug no código de produção.

---

## Resumo de Ações

| Prioridade | Item | Esforço |
|---|---|---|
| 🔴 Crítico | Criar `middleware.ts` na raiz de `apps/web` | Pequeno |
| 🔴 Crítico | Implementar testes RLS reais com Supabase local | Grande |
| 🔴 Crítico | Quebrar `actions.ts` (1.477 linhas) em módulos | Médio |
| 🔴 Crítico | Escrever pelo menos 3-5 testes E2E de fluxo principal | Grande |
| 🟠 Alta | Extrair e reutilizar `decodeJwtOrgId` | Pequeno |
| 🟠 Alta | Resolver `as any` no `recurring-actions.ts` | Pequeno |
| 🟠 Alta | Corrigir `mapStripeStatus` default | Pequeno |
| 🟠 Alta | Substituir casts Stripe por tipos SDK corretos | Pequeno |
| 🟠 Alta | Usar `assertEnv()` nos pontos de inicialização | Pequeno |
| 🟡 Média | Tipar `data` no cash-flow-chart | Pequeno |
| 🟡 Média | Atualizar `current_period_end` em `subscription.updated` | Pequeno |
| 🟡 Média | Adicionar rate limiting em `run-event` | Pequeno |
| 🟡 Média | Corrigir mock `getDb` nos testes de actions | Pequeno |
