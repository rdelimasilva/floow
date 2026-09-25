# Ritmo no WhatsApp — Parte 12: Entrega

> Leia antes o índice `2026-09-25-whatsapp-ritmo.md` (Global Constraints e Review Focus) e a spec.

### Task 14: Verificação final, guia da Meta e deploy

**Files:**
- Create: `docs/notificacoes/whatsapp-meta.md`

**Interfaces:**
- Consumes: tudo o que foi feito nas Tarefas 1 a 13. Os nomes e a quantidade de parâmetros dos templates vêm de `channels/whatsapp.ts` (Tarefa 7): resumo = 12, alerta = 3, código = 1 no corpo + 1 no botão.
- Produces: o guia que o usuário segue na Meta, e o código em produção.

- [ ] **Step 1: Suíte inteira, typecheck e build**

Run: `pnpm --filter @floow/web test`
Expected: PASS (todas as suítes, inclusive `auth/rls-ledger` e `auth/auth-boundary`)

Run: `pnpm --filter @floow/web typecheck`
Expected: PASS

Run: `pnpm --filter @floow/web build`
Expected: build concluído sem erro. É produção, então o build roda antes do push.

- [ ] **Step 2: Conferir o limite de 500 linhas**

Run: `wc -l apps/web/lib/notifications/*.ts apps/web/lib/notifications/channels/*.ts "apps/web/app/(app)/settings/"*.tsx apps/web/app/api/webhooks/whatsapp/route.ts`
Expected: nenhum arquivo acima de 500.

- [ ] **Step 3: Escrever o guia `docs/notificacoes/whatsapp-meta.md`**

````markdown
# WhatsApp do floow — configuração na Meta

O código envia pelo WhatsApp Cloud API. Sem as variáveis abaixo, o envio vira
no-op (aviso no log) e nada quebra.

## 1. Conta e número

1. Em business.facebook.com, crie (ou use) o Business Manager do floow e
   conclua a **verificação da empresa**.
2. Em developers.facebook.com, crie um app do tipo **Business** e adicione o
   produto **WhatsApp**.
3. Registre um **número dedicado** (que não esteja em uso no app do WhatsApp).
4. Crie um **System User** com permissão `whatsapp_business_messaging` e gere
   um **token permanente**.

## 2. Templates (idioma: Portuguese (BR))

A Meta não aceita template que começa ou termina com variável.

### floow_codigo — categoria Authentication
- Tipo de entrega: **Copy code**. Validade do código: **10 minutos**.
- O texto é o padrão da Meta ("{{1}} é seu código de verificação.").

### floow_resumo_ritmo — categoria Utility
```
floow · {{1}} — ritmo de {{2}} (dia {{3}} de {{4}})
Orçado no mês: {{5}}
Esperado até hoje: {{6}}
Realizado até hoje: {{7}} ({{8}} do esperado)
Projeção do mês: {{9}} — {{10}}
{{11}}
Ver detalhes: {{12}}

Para parar, responda SAIR.
```
Exemplos: Pessoal · setembro · 25 · 30 · R$ 8.000,00 · R$ 6.666,67 · R$ 7.120,00 ·
107% · R$ 8.540,00 · estoura em R$ 540,00 · Mercado estourado · Lazer em risco ·
https://<domínio>/budgets/pacing

### floow_alerta_ritmo — categoria Utility
```
floow · {{1}}: {{2}}.
Ver detalhes: {{3}}

Para parar, responda SAIR.
```
Exemplos: Pessoal · Mercado estourou o teto · https://<domínio>/budgets/pacing

Se a Meta recusar o resumo por "muitas variáveis para o tamanho", junte
{{5}}–{{8}} numa frase só e ajuste `summaryParams` em
`apps/web/lib/notifications/channels/whatsapp.ts` (e o teste dele).

## 3. Variáveis na Vercel (Production)

| Variável | Valor |
|---|---|
| `WHATSAPP_TOKEN` | token permanente do System User |
| `WHATSAPP_PHONE_NUMBER_ID` | "Phone number ID" do número (não é o telefone) |
| `WHATSAPP_APP_SECRET` | App secret (Configurações do app → Básico) |
| `WHATSAPP_VERIFY_TOKEN` | um texto aleatório que você inventa (ex.: `openssl rand -hex 16`) |
| `WHATSAPP_API_VERSION` | opcional; padrão `v21.0` |

## 4. Webhook

No app da Meta → WhatsApp → Configuração:
- Callback URL: `https://<domínio>/api/webhooks/whatsapp`
- Verify token: o mesmo `WHATSAPP_VERIFY_TOKEN`
- Assine o campo **messages**.

## 5. Teste

1. Em Configurações → Notificações, cadastre seu número e confirme o código.
2. Mande "oi" para o número do floow: deve voltar a resposta padrão.
3. Ponha o WhatsApp de uma org em **Diário**: o resumo chega às 7h do dia seguinte.
4. Mande "SAIR": a coluna WhatsApp vai para "Desligado" em todas as orgs.
````

- [ ] **Step 4: Commit do guia**

```bash
git branch --show-current
git add docs/notificacoes/whatsapp-meta.md
git commit -m "docs(notificacoes): guia de configuração do WhatsApp na Meta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Sincronizar com o remoto**

Outras sessões fazem push em `master`. Traga o que chegou antes de subir:

```bash
git branch --show-current   # master
git fetch origin
git status -sb               # se aparecer "behind", continue abaixo
git pull --rebase origin master
```

Se o rebase trouxe commits, rode de novo o Step 1 inteiro.

- [ ] **Step 6: Migration em produção (o usuário faz) e push**

**Pare e peça ao usuário** para abrir `supabase/migrations/00064_notificacoes_whatsapp.sql` no editor, copiar de lá e rodar no SQL Editor do Supabase. Não copie a partir do terminal, porque trunca linhas. Espere a confirmação de que rodou sem erro.

Depois da confirmação:

```bash
git push origin master
```

Não mexa em `.git/config`: o helper de credencial `manager` forçado ali é o que faz o push funcionar.

- [ ] **Step 7: Conferir o deploy**

Acompanhe o deploy da Vercel até ficar `READY`. Depois, sem as variáveis do WhatsApp ainda configuradas, confira:
- `/settings` abre e mostra a grade de notificações.
- `curl -s -o /dev/null -w "%{http_code}" "https://<domínio>/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1"` retorna `403`.
- No log do cron das 7h do dia seguinte, `emailsSent` e `whatsappSent` aparecem na resposta, e não há erro `[ritmo]`.

- [ ] **Step 8: Entregar ao usuário**

Aponte o guia `docs/notificacoes/whatsapp-meta.md`. O WhatsApp só começa a enviar depois dos passos 1 a 4 do guia; até lá, o e-mail continua funcionando como antes.
