# Ritmo de gastos no WhatsApp — Fase 1

**Data:** 2026-09-25
**Status:** aprovado em conversa, aguardando revisão da spec escrita

## Objetivo

Avisar o usuário pelo WhatsApp sobre o ritmo de gastos da org: **orçado × realizado até aquele dia**. O WhatsApp **soma** ao e-mail, não o substitui. Tudo é **por org**: quem participa de várias orgs recebe e configura cada uma separadamente.

A fase 2 (fora deste escopo) é um agente com quem o usuário conversa pelo mesmo número sobre as finanças. Esta fase deixa prontos os pontos de encaixe: número verificado → usuário, e o webhook de entrada.

## Decisões

| Tema | Decisão |
|---|---|
| Provedor | Meta WhatsApp Cloud API direto, via `fetch` (sem SDK), como o Resend |
| Número de envio | Um só, do floow, compartilhado por todas as orgs |
| Número do usuário | Por usuário (`profiles`), verificado uma vez e válido em todas as orgs |
| Preferência | Por org × usuário × canal, com frequência escolhida pelo usuário |
| E-mail | Migra para o mesmo modelo por org. O comportamento atual (só alerta de piora) vira o padrão |
| Opt-in | Verificar o número liga o WhatsApp em **todas** as orgs do usuário |
| Estrutura | Um job com canais plugáveis (`runPacingAlertsForOrg`), substituindo o job de e-mail |

## Modelo de dados — migration `00064_notificacoes_whatsapp.sql`

### `profiles`
- `whatsapp_phone text`: número no formato E.164 (`+5511999998888`)
- `whatsapp_verified_at timestamptz`: nulo enquanto não confirmado
- Índice único parcial em `whatsapp_phone WHERE whatsapp_verified_at IS NOT NULL`. Um número verificado pertence a um único usuário. É por esse índice que o webhook chega do número ao usuário.

### `whatsapp_verifications` (nova)
- `user_id uuid PK`, `phone text`, `code_hash text`, `expires_at timestamptz` (agora + 10 min), `attempts int default 0`, `sent_count int`, `window_start timestamptz`
- RLS ligado e **sem policy**: só o backend acessa, no mesmo padrão de `pacing_alert_state`.
- Guarda apenas o hash do código (HMAC com `CRON_SECRET`), nunca o código em si.

### `notification_preferences` (nova)
- `org_id uuid` (FK orgs, cascade), `user_id uuid`, `channel text`, `frequency text`, `updated_at timestamptz`
- PK `(org_id, user_id, channel)`
- CHECK `channel IN ('email','whatsapp')`
- CHECK `frequency IN ('daily','weekly','alerts','off')`
- RLS: o usuário lê e grava apenas as próprias linhas (`user_id = auth.uid()`), e só de orgs de que é membro.
- **Linha ausente = padrão.** E-mail: `alerts`. WhatsApp: `weekly`, desde que o número esteja verificado. Quem entra numa org depois já nasce com o padrão, sem criar linha nenhuma.
- **Backfill:** para cada usuário com `email_pacing_alerts = false`, insere `(org, user, 'email', 'off')` em cada org de que participa.
- `profiles.email_pacing_alerts` deixa de ser lida pelo código. A remoção da coluna fica para uma migration posterior, para não quebrar o deploy no meio.

### `pacing_alert_state`
- Nova coluna `channel text NOT NULL DEFAULT 'email'`, com CHECK igual ao de cima
- A PK passa a ser `(org_id, month, category_id, channel)`
- As linhas existentes viram `'email'`

## Comportamento — o que sai e quando

O cron existente `/api/cfo/run-daily` (`0 10 * * *` UTC, ou seja, 7h em Brasília) chama `runPacingAlertsForOrg(orgId, deps)` para cada org ativa.

1. Calcula o ritmo **uma vez** por org (`buildBudgetPacingInput`).
2. Se `daysElapsed = 0` ou a org não tem orçamento no mês (`total.plannedCents = 0`), não envia nada.
3. Calcula as pioras por canal com `selectPacingAlerts(pacing, lastSent[channel])`, que continua sendo a regra atual.
4. Para cada membro e cada canal ligado (WhatsApp só se o número estiver verificado), `decideSend(frequency, weekday, hasWorsening)` devolve `'summary' | 'alert' | 'none'`:

| frequency | Segunda | Outros dias |
|---|---|---|
| `daily` | resumo | resumo |
| `weekly` | resumo | alerta, se houve piora |
| `alerts` | alerta, se houve piora | alerta, se houve piora |
| `off` | nada | nada |

   - O dia da semana é calculado em America/Sao_Paulo.
   - Quando sai o resumo e há piora no mesmo dia, o resumo destaca as categorias que pioraram, e não vai mensagem separada.
5. Grava `pacing_alert_state` **por canal**, e só quando ao menos um envio daquele canal deu certo e havia piora. Se o canal falhar, a piora é reenviada no dia seguinte. O resumo sozinho não altera o estado.

### Conteúdo do resumo (`pacing-summary.ts`, puro)
- Orçado no mês: `total.plannedCents`
- Esperado até hoje: `plannedCents × daysElapsed ÷ daysInMonth`, arredondado
- Realizado até hoje: `total.spentCents`, mais o percentual sobre o esperado
- Projeção do mês: `total.projectedCents`, e quanto estoura ou quanto sobra em relação ao orçado
- Categorias em `risco`/`estourado` numa linha só, separadas por " · " (as variáveis de template da Meta não aceitam quebra de linha)
- Link para `/budgets/pacing`
- O nome da org abre a mensagem, para quem participa de várias saber de qual é o alerta

Exemplo (WhatsApp):
```
floow · Pessoal — ritmo de setembro (dia 25 de 30)
Orçado no mês: R$ 8.000
Esperado até hoje: R$ 6.667
Realizado até hoje: R$ 7.120 (107% do esperado)
Projeção do mês: R$ 8.540 — estoura em R$ 540
Mercado estourado · Lazer em risco
Ver detalhes: <app>/budgets/pacing
```

O e-mail também aceita as 4 frequências e usa o mesmo resumo (`pacing-email.ts` ganha a variante de resumo). O padrão continua `alerts`.

## Integração com o WhatsApp

### Templates (a submeter na Meta)
- `floow_codigo`, *authentication*: código de verificação, com botão de copiar
- `floow_resumo_ritmo`, *utility*: as variáveis do resumo acima
- `floow_alerta_ritmo`, *utility*: nome da org, mês e categorias que pioraram, mais o link
- Idioma `pt_BR`. Os nomes dos templates ficam em constantes de `channels/whatsapp.ts`.

### `send-whatsapp.ts`
- `POST https://graph.facebook.com/v{N}/{WHATSAPP_PHONE_NUMBER_ID}/messages`, com `Authorization: Bearer WHATSAPP_TOKEN`
- Duas funções: `sendTemplate(to, name, params)` e `sendText(to, body)`. A segunda só pode ser usada dentro da janela de 24h aberta por mensagem do usuário.
- Retorno `{ ok: true, id } | { ok: false, error }`, no mesmo formato do `send-email.ts`
- Sem as variáveis de ambiente, vira no-op com `console.warn` e retorna `not_configured`
- Variáveis: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION`

### Verificação do número (`whatsapp-verification-actions.ts`)
1. `requestWhatsAppCode(rawPhone)`: normaliza para E.164 (`phone.ts`: tira máscara e põe +55 se vier sem DDI; rejeita o que não for celular BR válido nem número internacional com DDI). Recusa se o número já estiver verificado por outro usuário. Aplica o limite de 3 envios por hora por usuário. Gera o código de 6 dígitos, grava o hash e envia pelo `floow_codigo`.
2. `confirmWhatsAppCode(code)`: no máximo 5 tentativas e 10 minutos de validade. Se o código bater, grava `profiles.whatsapp_phone` e `whatsapp_verified_at` e apaga a verificação.
3. Trocar o número significa começar do passo 1. O número anterior deixa de valer só quando o novo é confirmado.
4. `removeWhatsApp()`: limpa o número e a verificação.
- Tudo a partir do `userId` verificado da sessão, nunca de um id vindo do cliente.

### Webhook `/api/webhooks/whatsapp/route.ts`
- `GET`: handshake. Responde `hub.challenge` quando `hub.verify_token === WHATSAPP_VERIFY_TOKEN`; caso contrário, 403.
- `POST`: valida `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com `WHATSAPP_APP_SECRET`, comparação em tempo constante). Assinatura inválida: 401.
- Mensagem de texto recebida → busca o usuário pelo número verificado:
  - Número desconhecido: ignora e responde 200.
  - "SAIR", "PARAR" ou "STOP" (sem distinguir maiúsculas nem acento): grava `frequency = 'off'` no WhatsApp em todas as orgs do usuário e responde com `sendText` confirmando.
  - Qualquer outro texto: responde "Por enquanto eu só mando o ritmo de gastos. Ajuste em Configurações: <link>". **Ponto de encaixe da fase 2:** o agente entra aqui, numa função `handleInboundText(user, text)`.
- Status de entrega com erro: `console.error` + Sentry, sem mudar nenhuma preferência.
- Responde 200 rápido em todo POST válido, porque a Meta reenvia quando não recebe 200.
- O middleware já libera `/api/webhooks` sem sessão (por prefixo, é o mesmo caso do Stripe); nada a mudar lá.

## Tela — Configurações → Notificações

Fica dentro de `settings`, sem item novo no menu.
- **WhatsApp:** campo do número → "Enviar código" → campo do código → "Verificado ✓ +55 11 9…" com as opções Trocar e Remover
- **Grade org × canal:** uma linha por org do usuário e colunas E-mail e WhatsApp, cada célula com um seletor Diário / Semanal / Só alertas / Desligado. A coluna WhatsApp fica desabilitada enquanto o número não estiver verificado.
- `preferences-actions.ts` é reescrito para `getNotificationPreferences()` (mescla as linhas gravadas com os padrões) e `setNotificationFrequency(orgId, channel, frequency)`, gravando sob RLS (`withUserDb`).

## Descadastro do e-mail

O token do link passa a assinar `userId + orgId`. O POST de `/api/email/unsubscribe` grava `frequency = 'off'` no e-mail **daquela org**. Os textos da página citam o nome da org. Tokens antigos, sem `orgId`, continuam válidos e desligam o e-mail em todas as orgs do usuário.

## Tratamento de erros

- Cada org e cada envio são isolados. A falha de um vai para o log e o Sentry e não interrompe os demais, mantendo o padrão atual do cron.
- O estado de "alerta enviado" só é gravado por canal quando houve sucesso naquele canal.
- 429 ou limite de volume da Meta: registra no log, não repete no mesmo dia.
- `not_configured` (sem variáveis de ambiente): no-op silencioso, depois do aviso.

## Testes

- **Puros, com TDD:** `decideSend` (tabela completa de frequência × dia × piora), `pacing-summary` (esperado até hoje, %, estoura/sobra, linha única, sem orçamento), `phone.ts` (máscaras, DDI, inválidos), assinatura do webhook.
- **Job** com dependências falsas, estendendo o padrão de `pacing-email.test.ts`: canais misturados, um canal falhando e o outro não, estado gravado por canal, org sem orçamento, dia 1, WhatsApp não verificado.
- **Webhook:** assinatura inválida → 401; SAIR → desliga todas as orgs; texto qualquer → resposta padrão; número desconhecido → 200 sem efeito.
- **Verificação:** limite de envios, expiração, 5 tentativas, número já usado por outro usuário.
- **Migration no banco real, com rollback:** backfill do e-mail, troca de PK do `pacing_alert_state`, CHECKs de `channel`/`frequency` e as policies de RLS de `notification_preferences` (um usuário não enxerga as linhas de outro).

## Arquivos

```
supabase/migrations/00064_notificacoes_whatsapp.sql
packages/db/src/schema/notifications.ts                (+ notificationPreferences, whatsappVerifications, channel)
packages/db/src/schema/auth.ts                         (+ whatsappPhone, whatsappVerifiedAt)
apps/web/lib/notifications/schedule.ts                 decideSend
apps/web/lib/notifications/pacing-summary.ts           resumo (puro)
apps/web/lib/notifications/phone.ts                    E.164
apps/web/lib/notifications/send-whatsapp.ts            Graph API
apps/web/lib/notifications/channels/email.ts           adaptador
apps/web/lib/notifications/channels/whatsapp.ts        adaptador + nomes de template
apps/web/lib/notifications/pacing-alerts-job.ts        substitui pacing-email-job.ts
apps/web/lib/notifications/pacing-alerts-deps.ts       substitui pacing-email-deps.ts
apps/web/lib/notifications/whatsapp-verification-actions.ts
apps/web/lib/notifications/preferences-actions.ts      reescrito
apps/web/lib/notifications/unsubscribe-token.ts        + orgId
apps/web/app/api/webhooks/whatsapp/route.ts
apps/web/app/api/email/unsubscribe/route.ts            por org
apps/web/app/api/cfo/run-daily/route.ts                chama o job novo
apps/web/app/(app)/settings/...                        seção Notificações
```

Nenhum arquivo pode passar de 500 linhas.

## Fora do escopo

- O agente conversacional (fase 2)
- Escolher dia e hora do resumo
- Desligar sozinho números com falhas repetidas
- Remover a coluna `profiles.email_pacing_alerts`

## Dependências externas (responsabilidade do usuário, em paralelo)

1. Criar o app na Meta (Business) com o produto WhatsApp
2. Verificar a empresa no Business Manager
3. Registrar o número dedicado do floow
4. Submeter os 3 templates e aguardar a aprovação
5. Gerar o token permanente (System User) e configurar as variáveis na Vercel
6. Cadastrar a URL do webhook e o verify token no app da Meta
