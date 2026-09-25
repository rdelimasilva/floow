# Ritmo no WhatsApp — Parte 1: Dados

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 1: Migration, schema Drizzle e probe no banco real

**Files:**
- Create: `supabase/migrations/00064_notificacoes_whatsapp.sql`
- Create: `scripts/whatsapp-migration-probe.mjs`
- Modify: `packages/db/src/schema/notifications.ts`
- Modify: `packages/db/src/schema/auth.ts:30-41` (tabela `profiles`)

**Interfaces:**
- Consumes: nada.
- Produces (exportado de `@floow/db`):
  - `profiles.whatsappPhone: text | null`, `profiles.whatsappVerifiedAt: timestamptz | null`
  - `notificationPreferences` com `{ orgId, userId, channel, frequency, updatedAt }`
  - `whatsappVerifications` com `{ userId, phone, codeHash, expiresAt, attempts, createdAt }`
  - `pacingAlertState.channel` (text, padrão `'email'`)

Os testes do app mockam o banco, então CHECK constraints e policies só aparecem no banco real. É por isso que esta tarefa prova a migration com um script que aplica tudo **dentro de uma transação e desfaz no fim**.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/00064_notificacoes_whatsapp.sql`:

```sql
-- =============================================================================
-- Notificações de ritmo por WhatsApp, e preferência por org
-- -----------------------------------------------------------------------------
-- 1. Número de WhatsApp do usuário (um por pessoa, vale em todas as orgs).
-- 2. Código de verificação do número (só o backend lê/escreve).
-- 3. Preferência por org × usuário × canal, com frequência. Linha ausente =
--    padrão (e-mail 'alerts', WhatsApp 'weekly' se o número estiver verificado).
--    Substitui profiles.email_pacing_alerts, que era global por usuário.
-- 4. pacing_alert_state passa a ser por canal: se o e-mail sai e o WhatsApp
--    falha, só o WhatsApp reenvia no dia seguinte.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz;

-- Um número verificado pertence a um usuário só. É por aqui que o webhook
-- descobre quem mandou a mensagem.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_phone_verified_uq
  ON public.profiles (whatsapp_phone)
  WHERE whatsapp_verified_at IS NOT NULL;

-- 2 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_verifications (
  user_id     uuid PRIMARY KEY,
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS ligado e NENHUMA policy: só o backend acessa.
ALTER TABLE public.whatsapp_verifications ENABLE ROW LEVEL SECURITY;

-- 3 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  frequency   text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'alerts', 'off')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id, channel)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences: own select" ON public.notification_preferences;
CREATE POLICY "notification_preferences: own select"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notification_preferences: own insert" ON public.notification_preferences;
CREATE POLICY "notification_preferences: own insert"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND org_id IN (SELECT public.get_user_org_ids())
  );

DROP POLICY IF EXISTS "notification_preferences: own update" ON public.notification_preferences;
CREATE POLICY "notification_preferences: own update"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND org_id IN (SELECT public.get_user_org_ids())
  );

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

-- Quem tinha o e-mail de ritmo desligado continua desligado, em cada org.
INSERT INTO public.notification_preferences (org_id, user_id, channel, frequency)
SELECT m.org_id, m.user_id, 'email', 'off'
FROM public.org_members m
JOIN public.profiles p ON p.id = m.user_id
WHERE p.email_pacing_alerts = false
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.profiles.email_pacing_alerts IS
  'OBSOLETA desde 00064: a preferência vive em notification_preferences. Remover numa migration futura.';

-- 4 ---------------------------------------------------------------------------
ALTER TABLE public.pacing_alert_state
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'whatsapp'));

ALTER TABLE public.pacing_alert_state DROP CONSTRAINT IF EXISTS pacing_alert_state_pkey;
ALTER TABLE public.pacing_alert_state
  ADD CONSTRAINT pacing_alert_state_pkey PRIMARY KEY (org_id, month, category_id, channel);
```

- [ ] **Step 2: Escrever o probe**

`scripts/whatsapp-migration-probe.mjs`. Ele aplica a migration dentro de uma transação, verifica e faz rollback. Não altera nada no banco.

```js
#!/usr/bin/env node
/**
 * Prova a migration 00064 contra o banco de verdade, sem deixar rastro.
 *
 *   node scripts/whatsapp-migration-probe.mjs
 *
 * Aplica o SQL numa transação, confere backfill, CHECKs, PK nova e RLS, e
 * desfaz tudo no fim (rollback forçado). Não imprime dado pessoal.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

function carregarEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const texto = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  for (const linha of texto.split('\n')) {
    const corte = linha.indexOf('=')
    if (corte < 0 || linha.trim().startsWith('#')) continue
    if (linha.slice(0, corte).trim() === 'DATABASE_URL') return linha.slice(corte + 1).trim()
  }
  throw new Error('DATABASE_URL não encontrada (nem no ambiente nem no .env)')
}

const MIGRATION = readFileSync(
  new URL('../supabase/migrations/00064_notificacoes_whatsapp.sql', import.meta.url),
  'utf8',
)
const sql = postgres(carregarEnv(), { prepare: false })
let falhas = 0
const checar = (rotulo, ok, detalhe = '') => {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (!ok) falhas++
}
class Rollback extends Error {}

async function deveFalhar(tx, rotulo, fn) {
  await tx.unsafe('savepoint sp')
  try {
    await fn()
    checar(rotulo, false, 'passou, deveria ter falhado')
  } catch {
    checar(rotulo, true)
  }
  await tx.unsafe('rollback to savepoint sp')
}

try {
  await sql
    .begin(async (tx) => {
      const [{ n: desligados }] = await tx`
        select count(*)::int as n from org_members m join profiles p on p.id = m.user_id
        where p.email_pacing_alerts = false`
      const [{ n: estadoAntes }] = await tx`select count(*)::int as n from pacing_alert_state`

      await tx.unsafe(MIGRATION)

      const [{ n: backfill }] = await tx`
        select count(*)::int as n from notification_preferences
        where channel = 'email' and frequency = 'off'`
      checar('backfill do e-mail desligado', backfill === desligados, `${backfill}/${desligados}`)

      const [{ n: estadoDepois }] = await tx`
        select count(*)::int as n from pacing_alert_state where channel = 'email'`
      checar('pacing_alert_state preservado como email', estadoDepois === estadoAntes)

      const [membro] = await tx`select user_id, org_id from org_members order by created_at limit 1`
      if (!membro) throw new Error('Sem org_members para exercitar')

      await deveFalhar(tx, 'CHECK de channel', () =>
        tx`insert into notification_preferences values (${membro.org_id}, ${membro.user_id}, 'sms', 'daily')`)
      await deveFalhar(tx, 'CHECK de frequency', () =>
        tx`insert into notification_preferences values (${membro.org_id}, ${membro.user_id}, 'email', 'hourly')`)

      // Mesmo par (org, mês, categoria) em dois canais convive graças à PK nova.
      const cat = '00000000-0000-4000-8000-000000000001'
      await tx`insert into pacing_alert_state (org_id, month, category_id, status, channel)
               values (${membro.org_id}, '2099-01', ${cat}, 'risco', 'email'),
                      (${membro.org_id}, '2099-01', ${cat}, 'risco', 'whatsapp')`
      checar('PK por canal aceita os dois canais', true)

      // Índice único: dois usuários não verificam o mesmo número.
      const outros = await tx`select id from profiles order by created_at limit 2`
      if (outros.length === 2) {
        await tx`update profiles set whatsapp_phone = '+5500000000000', whatsapp_verified_at = now()
                 where id = ${outros[0].id}`
        await deveFalhar(tx, 'número verificado único', () =>
          tx`update profiles set whatsapp_phone = '+5500000000000', whatsapp_verified_at = now()
             where id = ${outros[1].id}`)
      }

      // RLS: como o próprio usuário, grava na sua org; não enxerga linha de outro.
      const claims = JSON.stringify({ sub: membro.user_id, role: 'authenticated' })
      await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`
      await tx`insert into notification_preferences (org_id, user_id, channel, frequency)
               values (${membro.org_id}, ${membro.user_id}, 'whatsapp', 'daily')
               on conflict (org_id, user_id, channel) do update set frequency = excluded.frequency`
      checar('RLS: usuário grava a própria preferência', true)
      const [{ n: alheias }] = await tx`
        select count(*)::int as n from notification_preferences where user_id <> ${membro.user_id}`
      checar('RLS: não enxerga preferência de outro', alheias === 0, `${alheias}`)
      await deveFalhar(tx, 'RLS: não grava preferência de outro usuário', () =>
        tx`insert into notification_preferences values
           (${membro.org_id}, '00000000-0000-4000-8000-000000000002', 'email', 'off')`)

      throw new Rollback()
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e
    })
} finally {
  await sql.end()
}

console.log(falhas === 0 ? '\nTudo certo (nada foi gravado).' : `\n${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)
```

- [ ] **Step 3: Rodar o probe**

Run: `node scripts/whatsapp-migration-probe.mjs`
Expected: todas as linhas `ok`, terminando com "Tudo certo (nada foi gravado)." Se algo falhar, corrija o SQL e rode de novo. O banco não muda, porque tudo roda dentro de transação.

- [ ] **Step 4: Atualizar o schema Drizzle de `profiles`**

Em `packages/db/src/schema/auth.ts`, dentro de `profiles`, logo depois de `emailPacingAlerts`:

```ts
  /** OBSOLETA desde 00064 — a preferência vive em notification_preferences. */
  emailPacingAlerts: boolean('email_pacing_alerts').notNull().default(true),
  /** WhatsApp em E.164 (+5511999998888). Só vale com whatsappVerifiedAt preenchido. */
  whatsappPhone: text('whatsapp_phone'),
  whatsappVerifiedAt: timestamp('whatsapp_verified_at', { withTimezone: true }),
```

Substitua o comentário atual de `emailPacingAlerts` pelo comentário "OBSOLETA" acima.

- [ ] **Step 5: Atualizar `packages/db/src/schema/notifications.ts`**

Arquivo inteiro:

```ts
import { pgTable, uuid, text, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { orgs } from './auth'

export type NotificationChannel = 'email' | 'whatsapp'
export type NotificationFrequency = 'daily' | 'weekly' | 'alerts' | 'off'

/**
 * Último status de ritmo enviado, por categoria, mês e canal.
 *
 * Existe para o alerta sair só quando o status piora. Por canal para que a
 * falha de um não faça o outro repetir. Sem policy de RLS: só o cron lê e
 * escreve (ver 00051 e 00064).
 */
export const pacingAlertState = pgTable(
  'pacing_alert_state',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** YYYY-MM */
    month: text('month').notNull(),
    categoryId: uuid('category_id').notNull(),
    /** 'risco' | 'estourado' */
    status: text('status').notNull(),
    channel: text('channel').$type<NotificationChannel>().notNull().default('email'),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.month, table.categoryId, table.channel] }),
  }),
)

/**
 * Frequência do aviso de ritmo por org × usuário × canal. Linha ausente = padrão
 * (ver DEFAULT_FREQUENCY em apps/web/lib/notifications/schedule.ts).
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    channel: text('channel').$type<NotificationChannel>().notNull(),
    frequency: text('frequency').$type<NotificationFrequency>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.userId, table.channel] }),
  }),
)

/** Código pendente de verificação do WhatsApp. Sem policy de RLS: só o backend. */
export const whatsappVerifications = pgTable('whatsapp_verifications', {
  userId: uuid('user_id').primaryKey(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 6: Ajustar o ON CONFLICT antigo e rodar o typecheck**

Depois da migration, não existe mais constraint única só em `(org_id, month, category_id)`, e o `onConflictDoUpdate` de `apps/web/lib/notifications/pacing-email-deps.ts` falharia. Troque o `target` dele para:

```ts
          target: [pacingAlertState.orgId, pacingAlertState.month, pacingAlertState.categoryId, pacingAlertState.channel],
```

O arquivo inteiro sai na Tarefa 9; isto só mantém o código coerente entre um commit e outro.

Run: `pnpm --filter @floow/web typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # deve ser master
git add supabase/migrations/00064_notificacoes_whatsapp.sql scripts/whatsapp-migration-probe.mjs packages/db/src/schema/notifications.ts packages/db/src/schema/auth.ts apps/web/lib/notifications/pacing-email-deps.ts
git commit -m "feat(notificacoes): tabelas de preferência por org, WhatsApp e estado por canal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Não faça push ainda.** O código novo e a migration vão para produção juntos, na Tarefa 14: o usuário aplica a migration no Supabase imediatamente antes do push, abrindo `supabase/migrations/00064_notificacoes_whatsapp.sql` no editor e copiando de lá (colar a partir do terminal trunca linhas).
