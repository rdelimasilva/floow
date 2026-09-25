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
- O texto é o padrão da Meta ("{{1}} é seu código de verificação."). O
  corpo tem 1 variável (o código) e o botão de copiar código tem outra
  variável (o mesmo código).

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
