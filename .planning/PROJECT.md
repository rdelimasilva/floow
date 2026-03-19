# Floow

## What This Is

Floow é um gestor financeiro completo para investidores experientes — um SaaS multi-tenant que combina controle financeiro diário (contas, transações, fluxo de caixa), gestão de carteira de investimentos (posições, PnL, proventos, evolução patrimonial) e planejamento financeiro de longo prazo (aposentadoria, independência financeira, sucessão). Web app em Next.js com backend serverless via Supabase + Netlify.

## Core Value

O investidor experiente consegue ver seu patrimônio consolidado — finanças do dia a dia, carteira de investimentos e projeções futuras — tudo num único lugar, com dados reais e simulações precisas.

## Requirements

### Validated

- ✓ Auth (email/senha, magic link, OAuth Google/Apple, session persistence) — v1.0
- ✓ Multi-tenant com RLS (Row Level Security) — v1.0
- ✓ Freemium + planos pagos via Stripe — v1.0
- ✓ Contas bancárias e de corretora — v1.0
- ✓ Registro de transações (receitas, despesas, transferências) — v1.0
- ✓ Fluxo de caixa com categorização — v1.0
- ✓ Dashboard financeiro — v1.0
- ✓ Import OFX/CSV — v1.0
- ✓ CRUD completo (edit/delete) em contas, transações, ativos, eventos — v1.0
- ✓ Filtros e paginação em listagens de transações — v1.0
- ✓ Toast notifications para feedback de ações — v1.0
- ✓ Conciliação no import com matching e preview por transação — v1.0
- ✓ Snapshots de patrimônio (net worth, liquid assets, liabilities) — v1.0
- ✓ Registro de ativos (ações BR, FIIs, ETFs, cripto, renda fixa, internacional) — v1.0
- ✓ Eventos de carteira (compra, venda, dividendo, juros, split, amortização) — v1.0
- ✓ Posição consolidada com preço médio automático — v1.0
- ✓ PnL por ativo e total — v1.0
- ✓ Proventos (dividendos, juros) — v1.0
- ✓ Gráfico de evolução patrimonial — v1.0
- ✓ Alocação por classe de ativo — v1.0
- ✓ Integração investimentos ↔ fluxo de caixa — v1.0
- ✓ Simulação de aposentadoria (3 cenários) — v1.0
- ✓ Cálculo de independência financeira — v1.0
- ✓ Renda passiva estimada — v1.0
- ✓ Planejamento de saque — v1.0
- ✓ Plano sucessório (liquidez, distribuição, ITCMD) — v1.0

### Active

<!-- Current milestone v1.1 scope -->
- [ ] Categorização automática de transações
- [ ] Transações recorrentes

### Backlog

- [ ] Mobile app (Expo/React Native) — scaffolded but no screens
- [ ] Vinculação de portfolio event a transaction existente (skip cash flow quando extrato já importado)
- [ ] Atualização automática de preços via API
- [ ] Import de corretora (Pluggy/Belvo)
- [ ] Benchmark comparison (CDI, IBOV, S&P500)
- [ ] Rebalanceamento de carteira
- [ ] Multi-currency (BRL + USD)
- [ ] MFA (multi-factor authentication)
- [ ] Convites e roles (admin, viewer)

### Out of Scope

- Módulo PJ (pessoa jurídica) — fork futuro após PF estabilizar
- Real-time chat/suporte — não é core
- Open Finance integration (Pluggy/Belvo/Klavi) — v2+, complexidade regulatória
- Offline mode — real-time sync é core value

## Context

**Shipped v1.0 MVP** (2026-03-18) com 16,503 LOC TypeScript em 252 arquivos.

**Tech stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod, Recharts, Drizzle ORM, Supabase (PostgreSQL, Auth, RLS), Stripe, pnpm + Turborepo monorepo.

**Arquitetura de 3 motores:**
1. Finance Engine — contas, transações, fluxo de caixa, snapshots
2. Investments Engine — ativos, eventos, posições, preços, PnL, proventos
3. Planning Engine — aposentadoria, FI, saque, sucessão

O `core-finance` package é reutilizável entre web, mobile e functions. Funções puras com TDD (computePosition, aggregateIncome, simulateRetirement, etc.).

**Padrões estabelecidos:**
- Integer cents para todos os valores monetários
- Submodule imports em client components (evita bundling ofx-js)
- Server actions (não API routes) para mutations
- RSC + Suspense para streaming de dados
- Pure function + thin DB wrapper pattern
- Upsert via onConflictDoUpdate com uniqueIndex por orgId

## Constraints

- **Stack Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod, TanStack Query, Recharts
- **Stack Mobile:** Expo + React Native (scaffolded, screens pending)
- **Stack Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions, RLS)
- **ORM:** Drizzle ORM
- **Serverless:** Supabase Edge Functions (Deno) + Netlify Functions (Node.js)
- **Deploy:** Netlify (web) + Expo EAS (mobile) + Supabase (banco/auth)
- **Monorepo:** pnpm + Turborepo
- **Integrações:** Stripe (billing), Resend (email), Sentry (errors)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase como backend | Infra mínima, custo baixo, RLS nativo, escala automática | ✓ Good — RLS performant, auth trigger pattern works well |
| Drizzle ORM sobre Prisma | Mais leve, mais próximo do SQL, melhor para domínio financeiro | ✓ Good — schema + migration separation works, transactions reliable |
| Monorepo com Turborepo | Compartilhar core-finance entre web/mobile/functions | ✓ Good — pure functions reusable, submodule imports solve bundling |
| Freemium com Stripe | Modelo SaaS padrão, baixa fricção de entrada | ✓ Good — webhooks + server actions clean pattern |
| Integer cents for money | Avoid floating-point errors in financial calculations | ✓ Good — zero precision issues across 4 phases |
| Server actions over API routes | Simpler, co-located with pages, no extra endpoints | ✓ Good — consistent pattern across all features |
| Inversion-based middleware | Allowlist public routes instead of blocklist | ✓ Good — new routes auto-protected |
| Pure function + DB wrapper | Testable computation, thin persistence layer | ✓ Good — TDD effective for core-finance |
| Submodule imports in client | Prevent webpack bundling Node-only deps | ✓ Good — solved ofx-js browser bundling issue |
| RSC + Suspense streaming | Server-side data loading with loading states | ✓ Good — clean separation, fast initial loads |

## Current Milestone: v1.1 Automação

**Goal:** Automatizar tarefas repetitivas — categorização inteligente de transações e transações recorrentes programadas.

**Target features:**
- Categorização automática de transações (regras baseadas em padrões de descrição)
- Transações recorrentes (templates com frequência, geração automática)

---
*Last updated: 2026-03-18 after v1.1 milestone start*
