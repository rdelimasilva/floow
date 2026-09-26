# Histórico — ritmo de gastos no WhatsApp (fase 1)

Registro de como a funcionalidade foi pensada, construída e publicada, em 25/09/2026.
Spec: `docs/superpowers/specs/2026-09-25-whatsapp-ritmo-design.md` · Plano: `docs/superpowers/plans/2026-09-25-whatsapp-ritmo.md` · Guia da Meta: `docs/notificacoes/whatsapp-meta.md`.

## O pedido

> Serviço onde o usuário cadastra o WhatsApp para receber um push sobre o status do ritmo de gastos: **orçado × realizado até aquele dia**.

Depois veio um segundo pedido: um **agente com quem o usuário conversa** sobre as finanças pelo WhatsApp. A decisão foi não criar dois serviços. É **um canal com dois fluxos**:

```
            ┌─ saída (cron diário) ──► resumo/alerta de ritmo (template aprovado)
número do ──┤
 floow      └─ entrada (webhook) ────► fase 1: SAIR + resposta padrão · fase 2: agente
```

## Decisões tomadas na conversa

| Tema | Decisão |
|---|---|
| E-mail × WhatsApp | O WhatsApp **soma** ao e-mail |
| Multitenant | **Por org**: número único do floow; cada membro escolhe por org e canal; a mensagem traz o nome da org |
| Provedor | **Meta WhatsApp Cloud API direto** (`fetch`, sem SDK, como o Resend) |
| Preferência do e-mail | Deixou de ser global (`profiles.email_pacing_alerts`) e passou a ser por org, junto com o WhatsApp |
| Opt-in | Verificar o número liga o WhatsApp em **todas** as orgs do usuário |
| Frequência | O **usuário escolhe** por org e canal: Diário · Semanal (segunda) · Só alertas · Desligado |
| Padrões | E-mail = Só alertas (o comportamento antigo); WhatsApp = Semanal; WhatsApp sem número verificado = Desligado |
| Arquitetura | Um job com canais plugáveis, no lugar do job só de e-mail |
| Ordem | Fase 1 (alertas + base) primeiro; o agente conversacional fica para a fase 2 |

## O que foi construído

- **Migration `00065_notificacoes_whatsapp.sql`**
  - `profiles.whatsapp_phone` e `whatsapp_verified_at`, com índice único para o número verificado
  - `whatsapp_verifications`: só o hash do código, sem policy de RLS
  - `notification_preferences (org_id, user_id, channel, frequency)` com RLS
  - `pacing_alert_state` ganhou `channel`, que entrou na PK
  - Migração de quem tinha o e-mail desligado para `off` em cada org
  - Trigger que impede o usuário de gravar o próprio número como verificado
- **Cron diário** (`/api/cfo/run-daily`, 7h em Brasília) chama `runPacingAlertsForOrg`, que:
  - calcula o ritmo uma vez;
  - decide por pessoa e canal o que mandar: resumo, alerta ou nada;
  - envia por `channels/email.ts` ou `channels/whatsapp.ts`;
  - grava o estado por canal.
- **Resumo** (`pacing-summary.ts`): orçado no mês, esperado até hoje, realizado (% do esperado), projeção (estoura/sobra) e as categorias em risco, numa linha só.
- **Verificação do número**: código de 6 dígitos, 10 min de validade, 5 tentativas, até 3 envios por hora.
- **Webhook** `/api/webhooks/whatsapp`, autenticado por HMAC da Meta:
  - "SAIR" desliga o WhatsApp em todas as orgs;
  - qualquer outro texto recebe a resposta padrão;
  - o ponto de encaixe da fase 2 é `handleInboundText` em `lib/notifications/whatsapp-inbound.ts`.
- **Descadastro do e-mail**: agora vale por org. Os links antigos continuam funcionando.
- **Tela**: Configurações → Notificações, com uma grade org × canal e o cadastro do número. Não entrou item novo no menu.

## Como foi executado

14 tarefas num branch isolado (`feat/whatsapp-ritmo`), porque outra sessão mexia no `master`. Cada tarefa teve implementador e revisor separados, e no fim houve uma revisão do branch inteiro.

**Problemas de segurança pegos na revisão e corrigidos antes de publicar:**
1. O limite de 5 tentativas do código podia ser furado com chamadas simultâneas. Agora a tentativa é gasta de forma atômica, antes de comparar o código.
2. Dava para descobrir de graça se um número pertence a um usuário do floow. Agora a cota é gasta antes dessa checagem.
3. O usuário conseguia se marcar como "verificado" pela API do Supabase, sem código, tanto por UPDATE quanto por DELETE + INSERT. Um trigger na migration bloqueia isso, e a confirmação grava pela conexão de serviço.
4. Falhas na resposta do webhook sumiam sem log.

**Ajustes da revisão final:**
- timeout de 10 s nas chamadas à Meta;
- descadastro de uma org que o usuário já deixou não dá mais erro 500;
- `search_path` fixo no trigger;
- falha ao gravar o estado de um canal não derruba o outro.

**Resultado:** 1.134 testes passando, typecheck e build ok.

## Publicação e o incidente da migration

1. A migration foi renumerada de 00064 para **00065**, porque a 00064 já existia (conexão paralela por produto).
2. O push foi para o `master` (`ce31e5b`) e o deploy da Vercel concluiu.
3. **Incidente:** depois do deploy, a checagem no banco mostrou que a 00065 **não estava** no projeto `vntvwvhpquyayuiypacf`. O SQL tinha rodado em outro lugar ou falhado sem aviso. A migration foi reaplicada no projeto certo, a partir do arquivo aberto no editor, e a checagem confirmou tudo: tabelas, colunas, PK com `channel`, 3 policies, trigger e `search_path`.
   - **Lição:** depois de aplicar uma migration, conferir no banco antes de dar como feito.

## Cuidados

- **Não fazer rollback instantâneo na Vercel** para antes de `ce31e5b` sem recriar um índice único em `pacing_alert_state (org_id, month, category_id)`. Sem ele, o código antigo falha ao gravar o estado, e o alerta de e-mail passa a se repetir todo dia.
- O resumo diário por e-mail usa a cota do Resend compartilhada com o login (100/dia).

## Decisões aceitas ou adiadas

- **Adiado para a fase 2 — SAIR em orgs futuras:** o SAIR não cobre orgs em que a pessoa entrar depois, que nascem com o padrão Semanal. O mesmo vale para quem responde SAIR e depois cadastra outro número. Isso precisa de um opt-out global.
- **Adiado para a fase 2 — mensagens repetidas:** o webhook não descarta mensagens repetidas pelo `messages[].id`. Hoje isso é inofensivo; precisa estar resolvido antes de o agente executar ações.
- **Aceito — o resumo não marca o que é novo:** ele lista todas as categorias em risco, sem destacar quais pioraram naquele dia.
- **Aceito — estado gravado por canal, não por pessoa:** se o envio falha para uma pessoa e dá certo para outra no mesmo canal, a que falhou perde aquele alerta.

## Próximos passos

1. **Configurar a Meta** seguindo `docs/notificacoes/whatsapp-meta.md`:
   - app e verificação da empresa;
   - número;
   - token permanente;
   - os 3 templates (`floow_codigo`, `floow_resumo_ritmo`, `floow_alerta_ritmo`);
   - as variáveis `WHATSAPP_*` na Vercel, com redeploy;
   - o webhook.

   Até isso ficar pronto, só o e-mail envia.
2. Conferir o primeiro cron: a resposta precisa trazer `emailsSent` e `whatsappSent`, sem erro `[ritmo]` no log.
3. **Fase 2:** o agente conversacional entra em `handleInboundText`.
   - Ferramentas só de leitura, sob RLS da org ativa.
   - Org ativa escolhida na conversa.
   - Limite de mensagens por usuário.
   - Histórico com prazo de retenção (LGPD).
