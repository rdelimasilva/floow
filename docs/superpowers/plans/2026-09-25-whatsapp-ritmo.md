# Ritmo de gastos no WhatsApp — Plano de implementação (índice)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mandar pelo WhatsApp (somando ao e-mail) o ritmo de gastos da org, orçado × realizado até o dia, com frequência escolhida por org e canal.

**Architecture:** O job de e-mail de ritmo (`pacing-email-job.ts`) vira um job com canais plugáveis (`pacing-alerts-job.ts`), chamado pelo cron diário existente. A decisão de "o que sai hoje" (`schedule.ts`) e o conteúdo (`pacing-summary.ts`) são funções puras. Cada canal (`channels/email.ts`, `channels/whatsapp.ts`) só formata e envia. As preferências migram de `profiles.email_pacing_alerts` (global) para `notification_preferences` (org × usuário × canal). O número do WhatsApp é verificado por código, e um webhook recebe "SAIR" e é o ponto de encaixe do agente da fase 2.

**Tech Stack:** Next.js (App Router, server actions), Drizzle + Postgres (Supabase, RLS), Vitest, Meta WhatsApp Cloud API via `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-25-whatsapp-ritmo-design.md`

## Partes

O plano está dividido por causa do limite de 500 linhas por arquivo (CLAUDE.md). Execute na ordem:

| Parte | Arquivo | Tarefas |
|---|---|---|
| 1 | `2026-09-25-whatsapp-ritmo-1-dados.md` | 1. Migration + schema Drizzle + probe no banco real |
| 2 | `2026-09-25-whatsapp-ritmo-2-puros.md` | 2. `phone.ts` · 3. `schedule.ts` |
| 3 | `2026-09-25-whatsapp-ritmo-3-resumo.md` | 4. `format.ts` + `pacing-summary.ts` |
| 4 | `2026-09-25-whatsapp-ritmo-4-envio.md` | 5. `send-whatsapp.ts` · 6. descadastro do e-mail por org |
| 5 | `2026-09-25-whatsapp-ritmo-5-canais.md` | 7. canais de e-mail e WhatsApp |
| 6 | `2026-09-25-whatsapp-ritmo-6-job.md` | 8. job `runPacingAlertsForOrg` |
| 7 | `2026-09-25-whatsapp-ritmo-7-cron.md` | 9. deps reais + troca no cron |
| 8 | `2026-09-25-whatsapp-ritmo-8-preferencias.md` | 10. preferências por org × canal |
| 9 | `2026-09-25-whatsapp-ritmo-9-verificacao.md` | 11. verificação do número |
| 10 | `2026-09-25-whatsapp-ritmo-10-webhook.md` | 12. webhook |
| 11 | `2026-09-25-whatsapp-ritmo-11-tela.md` | 13. tela de Notificações |
| 12 | `2026-09-25-whatsapp-ritmo-12-entrega.md` | 14. verificação final, guia da Meta e deploy |

## Global Constraints

- Nenhum arquivo pode passar de **500 linhas** (CLAUDE.md).
- Textos para o usuário em **pt-BR** ("tela", "você"), com acentuação correta.
- Canais: exatamente `'email' | 'whatsapp'`. Frequências: exatamente `'daily' | 'weekly' | 'alerts' | 'off'`.
- Padrões quando não há linha em `notification_preferences`: e-mail = `alerts`, WhatsApp = `weekly`. WhatsApp sem número verificado = `off`, sempre.
- O resumo semanal sai na **segunda-feira** (fuso America/Sao_Paulo). O cron continua `0 10 * * *` UTC (7h em Brasília).
- O código de verificação tem **6 dígitos**, vale **10 minutos**, aceita no máximo **5 tentativas** e pode ser enviado no máximo **3 vezes por hora** por usuário (`consumeRateLimit`, bucket `whatsapp.code`).
- Templates da Meta (idioma `pt_BR`): `floow_codigo`, `floow_resumo_ritmo`, `floow_alerta_ritmo`.
- Variáveis de ambiente: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION` (padrão `v21.0`). Sem elas, o envio vira no-op com `console.warn`.
- Tudo o que nasce de ação do usuário roda sob `withUserDb` (RLS). `getServiceDb`/`getDb` só no cron, no webhook e nas tabelas sem policy (`whatsapp_verifications`, `rate_limits`, `pacing_alert_state`).
- A chave do usuário vem sempre de `requireUserId()`, nunca de um id enviado pelo cliente.
- Git: commit direto em `master`, com **`git add` de arquivos nomeados** (nunca `-A`). Confira `git branch --show-current` antes de cada commit, porque outra sessão pode trocar a branch.
- Teste: `pnpm --filter @floow/web test -- <caminho>` (Vitest). Typecheck: `pnpm --filter @floow/web typecheck`.

## Review Focus

1. **Usuário em várias orgs:** a mensagem de cada org sai separada, com o nome da org, e o "SAIR" desliga o WhatsApp em todas. Testado nas Tarefas 8 e 12.
2. **Número digitado de formas diferentes** (`(11) 99999-8888`, `11999998888`, `+55 11 9 9999 8888`, `5511999998888`) vira sempre `+5511999998888`, e o mesmo número não pode ser verificado por dois usuários. Testado nas Tarefas 2 e 11 (e, no webhook, o `wa_id` sem o nono dígito na 12).
3. **E-mail antigo:** quem tinha o e-mail desligado continua sem receber depois da migration, e o link de descadastro de e-mails já enviados (token sem `orgId`) continua funcionando. Testado nas Tarefas 1 e 6.
4. **Um canal falha e o outro não:** o estado de "alerta enviado" é gravado só no canal que funcionou, e o outro reenvia amanhã. Testado na Tarefa 8.
5. **Org sem orçamento no mês, ou mês ainda não iniciado** (`plannedCents = 0` ou `daysElapsed = 0`): nada é enviado em nenhum canal, nem o resumo diário. Testado na Tarefa 8.

## Mapa de arquivos

```
supabase/migrations/00064_notificacoes_whatsapp.sql           T1  criar
scripts/whatsapp-migration-probe.mjs                          T1  criar
packages/db/src/schema/notifications.ts                       T1  modificar
packages/db/src/schema/auth.ts                                T1  modificar
apps/web/lib/notifications/phone.ts                           T2  criar
apps/web/lib/notifications/schedule.ts                        T3  criar
apps/web/lib/notifications/format.ts                          T4  criar (brl, MESES, oneLine; T7 + escapeHtml)
apps/web/lib/notifications/pacing-summary.ts                  T4  criar
apps/web/lib/notifications/send-whatsapp.ts                   T5  criar
apps/web/lib/notifications/preferences-store.ts               T6  criar
apps/web/lib/notifications/unsubscribe-token.ts               T6  modificar
apps/web/app/api/email/unsubscribe/route.ts                   T6  modificar
apps/web/lib/notifications/pacing-summary-email.ts            T7  criar
apps/web/lib/notifications/channels/{types,email,whatsapp}.ts T7  criar
apps/web/lib/notifications/pacing-alerts-job.ts               T8  criar (substitui pacing-email-job.ts)
apps/web/lib/notifications/recipients.ts                      T9  criar
apps/web/lib/notifications/pacing-alerts-deps.ts              T9  criar (substitui pacing-email-deps.ts)
apps/web/app/api/cfo/run-daily/route.ts                       T9  modificar
apps/web/lib/notifications/notification-settings.ts           T10 criar
apps/web/lib/notifications/preferences-actions.ts             T10 reescrever
apps/web/lib/notifications/whatsapp-verification.ts           T11 criar
apps/web/lib/notifications/whatsapp-verification-actions.ts   T11 criar
apps/web/lib/notifications/whatsapp-webhook.ts                T12 criar
apps/web/lib/notifications/whatsapp-inbound.ts                T12 criar (encaixe da fase 2)
apps/web/lib/notifications/whatsapp-inbound-deps.ts           T12 criar
apps/web/app/api/webhooks/whatsapp/route.ts                   T12 criar
apps/web/app/(app)/settings/notifications-section.tsx         T13 criar (substitui pacing-email-toggle.tsx, que sai na T10)
apps/web/app/(app)/settings/whatsapp-phone-form.tsx           T13 criar
apps/web/app/(app)/settings/page.tsx                          T10, T13 modificar
docs/notificacoes/whatsapp-meta.md                            T14 criar
```

Testes em `apps/web/__tests__/notifications/`.
