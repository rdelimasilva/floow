# ADR 0001 — Colocar o caminho do app sob RLS

Data: 2026-09-17
Status: aceito, cutover pendente de validação

## Contexto

O banco tem RLS habilitado nas 37 tabelas e policies de isolamento por org bem
escritas. No caminho do app elas **nunca são avaliadas**.

O Drizzle conecta via `DATABASE_URL` com o papel `postgres.<ref>`, que é dono
das tabelas — e dono ignora RLS a menos que a tabela tenha `FORCE ROW LEVEL
SECURITY`. A própria migration `00026` já registra isso:

> *"The app accidentally worked because Drizzle queries via DATABASE_URL use the
> `postgres` role (BYPASSRLS), so these policies never got exercised. Isolation
> today is only at the application layer."*

Consequência: o isolamento entre tenants existe apenas porque cada query lembra
de filtrar por `org_id`. Há 143 chamadas de `getDb()` no repositório. Uma que esqueça o
filtro vaza dado de outra org, e nada no banco barra.

O hotfix de autenticação (commit `e7c3ad6`) fechou o vetor que permitia
**escolher** a org pelo cookie. O risco que sobra é menor, mas real: um erro de
programação vira vazamento entre tenants sem rede de proteção.

## Decisão

Adotar o mesmo desenho do PostgREST: o app conecta com um papel de login sem
privilégio próprio e, **por transação**, assume `authenticated` e publica as
claims do usuário.

```sql
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"<user_id>","role":"authenticated"}', true);
```

Com isso `auth.uid()` resolve e todas as policies passam a valer.

### Por que dentro de transação e com `set_config(..., true)`

O pooler está em modo *transaction* (porta 6543, `?pgbouncer=true`): a conexão
volta ao pool a cada commit. Um `SET` de sessão vazaria o contexto de um
usuário para a próxima requisição que pegasse aquela conexão. O terceiro
argumento `true` prende o valor à transação.

### Por que não `FORCE ROW LEVEL SECURITY`

`FORCE` sujeitaria também o **dono** ao RLS. As migrations rodam como dono e
fazem seeds (`INSERT INTO categories`, `fixed_asset_types`, `counterparties`);
como não há policy `TO postgres`, todo seed futuro passaria a ser negado.
Trocar o papel da aplicação atinge o objetivo sem esse efeito colateral.

Em troca, a regressão "alguém aponta `DATABASE_URL` de volta para `postgres`"
fica silenciosa. Por isso existe `assertRlsEnforced()`.

## O que já está no repositório

| Peça | Onde |
|---|---|
| `withRls(db, userId, fn)` | `packages/db/src/rls.ts` |
| `assertRlsEnforced(db)` | `packages/db/src/rls.ts` |
| `getServiceDb()` explícito | `packages/db/src/client.ts` |
| Papel `floow_app` + grants | `supabase/migrations/00044_app_role_rls.sql` |
| Prova contra o banco real | `scripts/rls-probe.mjs` |

Nada disso muda o comportamento atual. `getDb()` segue sendo a conexão de
serviço; está marcado como `@deprecated` para não crescer.

## Cutover

**O passo 1 é bloqueante.** Sem ele a conversão é trabalho perdido — e pior,
quebraria o app inteiro.

1. `node scripts/rls-probe.mjs` contra o banco. Tem de passar em todas as
   checagens. Ele é read-only e reverte a transação.
2. Aplicar `00044`, definir a senha fora do versionamento
   (`ALTER ROLE floow_app WITH PASSWORD '...'`).
3. Converter as queries, um arquivo por commit, começando pelas de leitura
   (menor estrago se algo escapar). Inventário abaixo.
4. Rotas sem usuário (cron `run-daily`, webhook do Stripe, backfill) ficam em
   `getServiceDb()` — acesso amplo é o objetivo delas. Cada uma precisa da sua
   própria autorização, que hoje existe.
5. Trocar `DATABASE_URL` para `floow_app` no Vercel, primeiro em preview.
6. Ligar `assertRlsEnforced()` na subida em produção.

### Risco conhecido

Não há teste de integração contra Postgres real neste repositório; os testes
mockam `@floow/db` por completo. A conversão precisa ser validada slice a slice
em preview, não só por CI verde.

### Inventário — 36 arquivos

| Arquivo | Chamadas |
|---|---|
| apps/web/lib/finance/actions.ts | 21 |
| apps/web/lib/finance/queries.ts | 12 |
| apps/web/lib/investments/queries.ts | 8 |
| apps/web/lib/finance/budget-queries.ts | 8 |
| apps/web/lib/investments/actions.ts | 7 |
| apps/web/lib/fixed-assets/actions.ts | 7 |
| apps/web/lib/finance/budget-actions.ts | 7 |
| apps/web/lib/planning/queries.ts | 6 |
| apps/web/lib/planning/actions.ts | 5 |
| apps/web/lib/openfinance/connection-actions.ts | 5 |
| apps/web/lib/fixed-assets/queries.ts | 5 |
| apps/web/lib/finance/recurring-actions.ts | 5 |
| apps/web/lib/finance/category-actions.ts | 5 |
| apps/web/lib/cfo/queries.ts | 4 |
| apps/web/lib/openfinance/counterparty-queries.ts | 3 |
| apps/web/lib/openfinance/counterparty-actions.ts | 3 |
| apps/web/lib/finance/import-actions.ts | 3 |
| apps/web/lib/finance/debt-queries.ts | 3 |
| apps/web/lib/finance/debt-actions.ts | 3 |
| apps/web/lib/cfo/chat-queries.ts | 3 |
| apps/web/lib/openfinance/resource-actions.ts | 2 |
| apps/web/lib/openfinance/queries.ts | 2 |
| apps/web/lib/cfo/chat-actions.ts | 2 |
| apps/web/lib/cfo/actions.ts | 2 |
| packages/db/src/client.ts | 1 |
| apps/web/lib/openfinance/backfill.ts | 1 |
| apps/web/lib/investments/position-snapshots.ts | 1 |
| apps/web/lib/finance/cash-flow-actions.ts | 1 |
| apps/web/lib/finance/budget-daily-queries.ts | 1 |
| apps/web/lib/cfo/engine.ts | 1 |
| apps/web/lib/cfo/chat-context.ts | 1 |
| apps/web/lib/cfo/budget-pacing-input.ts | 1 |
| apps/web/lib/auth/session.ts | 1 |
| apps/web/lib/audit/record.ts | 1 |
| apps/web/app/api/cfo/run-daily/route.ts | 1 |
| apps/web/app/api/cfo/chat/route.ts | 1 |
