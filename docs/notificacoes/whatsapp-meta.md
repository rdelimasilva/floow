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

Não há template de código: a verificação do número é invertida. A pessoa
manda "floow XXXX-XXXX" do próprio WhatsApp para o número do floow, e a
resposta sai como texto livre (a mensagem dela abre a janela de 24h).

### floow_resumo_ritmo_v2 — categoria Utility
Corpo (o `*` é negrito e o `_` itálico no WhatsApp):
```
*📊 Ritmo de {{1}} · {{2}}*
_dia {{3}} de {{4}}_

💰 Orçado: *{{5}}*
🎯 Esperado até hoje: {{6}}
🧾 Realizado: *{{7}}* ({{8}})
📈 Projeção: {{9}}
*{{10}}*

{{11}}

Para parar, responda SAIR.
```
Botão: URL fixa "Ver detalhes" → `https://www.floowapp.com.br/budgets/pacing`.
Exemplos: setembro · Personal · 26 · 30 · R$ 25.529,00 · R$ 22.125,13 · R$ 20.308,20 · 92% ·
R$ 23.432,54 · ✅ Sobra R$ 2.096,46 · ⚠️ Atenção: Alimentação, Viagens (estourados) · Limpeza (em risco)

### floow_alerta_ritmo_v2 — categoria Utility
```
*🚨 Ritmo de gastos · {{1}}*

{{2}}

Para parar, responda SAIR.
```
Mesmo botão "Ver detalhes". Exemplos: Personal · ⚠️ Atenção: Alimentação (estourado)

Os parâmetros saem de `summaryParams`/`alertParams` em
`apps/web/lib/notifications/channels/whatsapp.ts` (11 e 2). As versões sem `_v2`
foram substituídas e podem ser apagadas no Gerenciador do WhatsApp.

## 3. Variáveis na Vercel (Production)

| Variável | Valor |
|---|---|
| `WHATSAPP_TOKEN` | token permanente do System User |
| `WHATSAPP_PHONE_NUMBER_ID` | "Phone number ID" do número (não é o telefone) |
| `WHATSAPP_APP_SECRET` | App secret (Configurações do app → Básico) |
| `WHATSAPP_VERIFY_TOKEN` | um texto aleatório que você inventa (ex.: `openssl rand -hex 16`) |
| `WHATSAPP_API_VERSION` | opcional; padrão `v21.0` |
| `WHATSAPP_DISPLAY_NUMBER` | o telefone do floow no WhatsApp, só dígitos com DDI; monta o link wa.me da tela de conexão. Em produção é `551171773256` — **sem o nono dígito**: com o 9 (`5511971773256`) o wa.me respondia "este número não está no WhatsApp". Teste o link no celular antes de fixar. Sem a variável, a tela mostra "WhatsApp ainda não está disponível." |

## 4. Webhook

No painel novo o caminho é: developers.facebook.com → app → **Casos de uso** →
"Conectar-se com clientes pelo WhatsApp" → **Personalizar** → **Etapa 2.
Configuração da produção** → **Configurar webhooks**.
- Callback URL: `https://<domínio>/api/webhooks/whatsapp`
- Verify token: o mesmo `WHATSAPP_VERIFY_TOKEN` (faça o deploy com a variável antes de clicar em "Verificar e salvar")
- Em "Campos do webhook", assine **só** `messages`.

Mais dois passos, sem os quais a Meta não entrega nenhuma mensagem real
(o webhook fica verificado, mas mudo — nos logs da Vercel só aparece o GET da verificação):
1. **Publicar o app** (menu Publicar). App não publicado só recebe webhooks de teste do painel.
2. **Inscrever a conta do WhatsApp (WABA) no app**, uma vez, pelo Graph API Explorer
   (developers.facebook.com/tools/explorer, token com `whatsapp_business_management`):
   `POST <WABA_ID>/subscribed_apps` → `{"success": true}`. WABA do floow: `1805595557452259`.

## 5. Teste

1. Em Configurações → Notificações, clique em **Conectar WhatsApp** e envie a
   mensagem pelo botão "Abrir no WhatsApp" (ou pelo QR code). Em alguns
   segundos a tela mostra "Verificado ✓" e o WhatsApp responde "Pronto!".
2. Mande "oi" para o número do floow: deve voltar a resposta padrão.
3. Ponha o WhatsApp de uma org em **Diário**: o resumo chega às 7h do dia seguinte.
4. Mande "SAIR": a coluna WhatsApp vai para "Desligado" em todas as orgs.
