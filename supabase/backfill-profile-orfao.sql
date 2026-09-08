-- =============================================================================
-- Backfill de profile órfão
-- -----------------------------------------------------------------------------
-- PROBLEMA
--   `counterparties.confirmed_by` referencia `public.profiles(id)`
--   (00035_counterparty_review.sql). O server action `confirmCounterparty`
--   grava ali o `session.user.id`, que é o id de `auth.users`.
--
--   `handle_new_user()` (00001, reescrito em 00024) envolve todos os INSERTs
--   num bloco com `EXCEPTION WHEN OTHERS THEN RAISE WARNING`. Quando ele
--   falha, o usuário existe em `auth.users` sem linha em `public.profiles`.
--   Aí o UPDATE de `confirmCounterparty` viola
--   `counterparties_confirmed_by_fkey` e o action devolve 500.
--
--   Efeito prático: como `app/(app)/layout.tsx` troca o app inteiro pelo
--   `ReviewGate` enquanto o portão está fechado, o usuário nessa condição não
--   consegue confirmar nenhuma contraparte — ou seja, fica trancado fora do
--   app, e o POST estoura na URL da página onde a fila apareceu.
--
-- POR QUE 00025 NÃO RESOLVEU
--   `00025_backfill_orphan_users.sql` filtra por
--   `LEFT JOIN public.org_members ... WHERE m.user_id IS NULL` — só usuários
--   SEM org. Um usuário COM org e SEM profile passa batido, porque o
--   `INSERT INTO public.profiles` mora dentro daquele loop.
--
-- ESCOPO DESTE SCRIPT
--   Reparo de dados, idempotente. NÃO corrige o filtro do 00025 nem o
--   `handle_new_user()` permissivo — então o problema pode reincidir no
--   próximo signup cujo trigger falhe. Isso foi decisão consciente.
--
-- Colunas: só `id`, `email` e `full_name`, iguais ao que
-- `handle_new_user()` grava. `avatar_url` fica NULL de propósito — nem o
-- trigger nem o 00025 preenchem, e chutar a chave do metadata (`avatar_url`
-- vs `picture`) inventaria dado.
--
-- Uso:
--   psql "$DATABASE_URL" -f supabase/backfill-profile-orfao.sql
-- =============================================================================

-- Sem BEGIN/COMMIT: o SQL Editor do Supabase já roda a query numa transação,
-- e subquery escalar multilinha quebrou o parser dele. Duas statements
-- simples, uma por vez.

-- ---------------------------------------------------------------------------
-- 1. Reparo.
--    `profiles.email` é NOT NULL e `auth.users.email` é nullable (usuário só
--    de OAuth/telefone pode não ter email), daí o `u.email IS NOT NULL`:
--    órfão sem email não é reparável por aqui e precisa ser tratado à mão.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL AND u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Conferência: tem que voltar 0. Se voltar > 0, o que restou é órfão sem
--    email — este script não cobre, ver comentário do passo 1.
-- ---------------------------------------------------------------------------
SELECT count(*) AS orfaos_restantes
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
