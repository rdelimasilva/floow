# Floow

## What This Is

Floow é um gestor financeiro completo para investidores experientes — um SaaS multi-tenant que combina controle financeiro diário, gestão de carteira de investimentos e planejamento financeiro de longo prazo. Disponível em web (Next.js) e mobile (Expo/React Native), com backend serverless via Supabase + Netlify.

## Core Value

O investidor experiente consegue ver seu patrimônio consolidado — finanças do dia a dia, carteira de investimentos e projeções futuras — tudo num único lugar, com dados reais e simulações precisas.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

**Finance Engine**
- [ ] Contas bancárias e de corretora (multi-moeda)
- [ ] Registro de transações (receitas, despesas, transferências)
- [ ] Fluxo de caixa com categorização
- [ ] Dashboard financeiro diário

**Investments Engine**
- [ ] Registro de ativos (ações BR, FIIs, ETFs, cripto, renda fixa, ativos internacionais)
- [ ] Eventos de carteira (compra, venda, dividendo, juros, split, amortização, depósito, retirada)
- [ ] Posição consolidada com preço médio automático
- [ ] Preços históricos e valorização
- [ ] Proventos (dividendos, juros)
- [ ] PnL (lucro/prejuízo) por ativo e total
- [ ] Gráfico de evolução patrimonial
- [ ] Alocação por classe de ativo (renda variável, renda fixa, cripto, caixa)
- [ ] Integração com fluxo de caixa (aporte = débito, resgate = crédito, dividendo = crédito)

**Planning Engine**
- [ ] Simulação de aposentadoria (conservador, base, agressivo)
- [ ] Cálculo de independência financeira
- [ ] Renda passiva estimada
- [ ] Planejamento de saque
- [ ] Plano sucessório (liquidez, distribuição entre herdeiros)

**Valuation**
- [ ] Snapshots de patrimônio (net worth, liquid assets, liabilities, breakdown)

**Plataforma SaaS**
- [ ] Auth (email/senha, magic link, OAuth Google/Apple, MFA)
- [ ] Multi-tenant com RLS (Row Level Security)
- [ ] Freemium + planos pagos via Stripe
- [ ] Web app (Next.js)
- [ ] Mobile app (Expo/React Native)

### Out of Scope

- Importação automática de corretora (Pluggy/Belvo) — v2, complexidade alta
- Atualização automática de preços — v2, requer API paga
- Benchmarks e rebalanceamento — v2
- Módulo PJ (pessoa jurídica) — fork futuro após PF estabilizar
- Real-time chat/suporte — não é core
- Open Finance integration — v2+

## Context

**Mercado:** Brasil + global. Ativos brasileiros (B3, FIIs, Tesouro Direto, CDBs, LCIs) e internacionais (NYSE, cripto).

**Público:** Investidores experientes que já investem e querem consolidação + planejamento. Não é para iniciantes aprendendo a investir.

**Modelo:** SaaS freemium — funcionalidades básicas grátis, planos premium via Stripe. Começa PF, depois fork para PJ.

**Arquitetura de 3 motores:**
1. Finance Engine — contas, transações, fluxo de caixa
2. Investments Engine — ativos, eventos, posições, preços, valuation
3. Planning Engine — metas, aposentadoria, sucessão

O `core-finance` package no monorepo é reutilizável entre web, mobile e functions.

**Performance:** Materialized views, snapshots de cashflow e valuation para evitar cálculos pesados em tempo real.

## Constraints

- **Stack Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod, TanStack Query
- **Stack Mobile:** Expo + React Native (React Native Paper ou Tamagui, TanStack Query, Supabase client)
- **Stack Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions, RLS) — sem backend tradicional
- **ORM:** Drizzle ORM (preferência sobre Prisma)
- **Serverless:** Supabase Edge Functions (Deno) + Netlify Functions (Node.js)
- **Deploy:** Netlify (web) + Expo EAS (mobile) + Supabase (banco/auth)
- **Monorepo:** pnpm + Turborepo
- **Integrações:** Stripe (billing), Resend (email), Sentry (errors)
- **API de preços:** Alpha Vantage / TwelveData / Finnhub / Yahoo Finance (a definir)
- **CI/CD:** GitHub + Netlify auto-deploy + Supabase migrations via CLI

**Estrutura do monorepo:**
```
apps/
  web/           # Next.js
  mobile/        # Expo
  functions-netlify/
  functions-supabase/

packages/
  core-finance/  # Motor financeiro reutilizável
  core-ui/       # Componentes compartilhados
  shared/        # Types, utils, schemas Zod
  domain-personal/
  domain-business/

db/
  migrations/
  seeds/
```

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase como backend | Infra mínima, custo baixo, RLS nativo, escala automática | — Pending |
| Drizzle ORM sobre Prisma | Mais leve, mais próximo do SQL, melhor para domínio financeiro | — Pending |
| Web + Mobile desde o início | Ambos juntos para não acumular dívida técnica | — Pending |
| Monorepo com Turborepo | Compartilhar core-finance entre web/mobile/functions | — Pending |
| Freemium com Stripe | Modelo SaaS padrão, baixa fricção de entrada | — Pending |
| PF primeiro, PJ depois | Validar produto com pessoa física antes de expandir | — Pending |
| Materialized views para performance | Evitar cálculos pesados em tempo real no financeiro | — Pending |

---
*Last updated: 2026-03-09 after initialization*
