# Consultor no WhatsApp (fase 3)

Data: 2026-09-28
Status: aprovado em conversa. Vem antes da fase 2 (operações): no WhatsApp o
consultor estreia com consulta e memória, e as operações chegam depois nos dois
canais. Depende de `2026-09-28-consultor-agente-design.md` (fase 1) e
`2026-09-28-consultor-memoria-design.md`.

## Objetivo

Quem ligou o WhatsApp ao floow conversa com o mesmo consultor da web: pergunta
sobre gastos, plano, saldos, e ele aprende e usa as memórias.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Org da conversa | `profiles.whatsapp_org_id`. Vazio + uma org só → essa org. Vazio + várias → responde pedindo para escolher em Configurações (com link) | Previsível; quem tem uma org não vê nada novo. |
| Onde escolhe | Um seletor "Org do consultor no WhatsApp" dentro do bloco do WhatsApp em Configurações, só quando o usuário tem mais de uma org | Menu lateral não cresce. |
| Ferramentas | Consulta + memória. As de sugestão (botões da web) ficam fora | Não há botão no WhatsApp. |
| Conversa | Uma conversa `canal = 'whatsapp'` por usuário/org, com histórico das últimas 20 mensagens | Memória curta do canal, como decidido na fase 1. |
| Ver a conversa na web | **Adiado.** A conversa fica gravada, mas a web ainda não tem lista de conversas (nem das da web) | Construir o histórico de conversas é uma tela nova; sem operações no WhatsApp, o rastro que importa (memórias) já está visível no /cfo. Volta com a fase 2. |
| Mensagem repetida da Meta | Ignorada: o id da mensagem (`wamid`) é gravado com a pergunta, com índice único | A Meta reenvia; responder duas vezes custa Claude em dobro e confunde. |
| Espera | Marca como lida com indicador "digitando" assim que chega | A resposta leva de 5 a 20 s; sem sinal parece que o número morreu. |
| Tempo | O webhook responde 200 à Meta na hora e processa com `after()`; `maxDuration = 60` no route; o agente já para em 45 s | A Meta reenvia o que não recebe 200 rápido. |
| Limite de uso | O agente aplica o limite (mesmos buckets por org); estourou → responde o aviso de limite | Um canal, uma checagem. |
| Resposta longa | Quebrada em partes de até 4000 caracteres, em limites de parágrafo | O WhatsApp aceita até 4096 por mensagem. |
| SAIR | Continua desligando só o ritmo de gastos; o consultor segue respondendo quem escreve | Resposta a quem escreveu não é notificação. |

## Componentes

**Migration `00068_consultor_whatsapp.sql`**
- `profiles.whatsapp_org_id uuid NULL REFERENCES orgs(id) ON DELETE SET NULL`.
- `cfo_conversations.canal text NOT NULL DEFAULT 'web' CHECK (canal IN ('web','whatsapp'))`.
- `cfo_messages.external_id text NULL` + índice único parcial onde não é nulo.

**Webhook**
- `parseWebhook` passa a devolver o `id` da mensagem (`wamid`) em `InboundText`.
- `handleInboundText`: vínculo e SAIR como hoje; no lugar da resposta padrão,
  chama o consultor (dependência nova `consultar(userId, msg)`), mantendo o
  arquivo testável por injeção como é hoje.
- O route agenda o tratamento com `after()` e devolve 200 na hora.

**Canal WhatsApp do consultor — `lib/consultor/whatsapp.ts`**
1. Resolve a org (regra acima). Sem org definida e várias orgs → responde com o
   link de Configurações e para.
2. Grava a pergunta na conversa WhatsApp (cria se não existir) com o `wamid`;
   se o `wamid` já existe, para (repetição).
3. Marca como lida + "digitando".
4. Monta o prompt (`canal: 'whatsapp'`), histórico da conversa (sem a pergunta
   atual), e chama `responder` com as ferramentas de consulta e memória e o
   limite real.
5. Grava a resposta e envia em partes.
6. Erro no agente → envia "O consultor está indisponível agora. Tente de novo
   em instantes." e loga.

Tudo sem cookies: userId vem do número verificado; leituras e escritas da
conversa sob `withUserDbFor(userId)`.

**Configurações**
- Seletor da org no bloco do WhatsApp (só com WhatsApp ligado e mais de uma org),
  gravando `profiles.whatsapp_org_id` por server action.

## Erros

- Envio pela Meta falha: loga (como hoje); a resposta fica gravada na conversa.
- Pergunta repetida: nada acontece.
- Usuário saiu da org escolhida: `whatsapp_org_id` fica inválido para ele →
  cai na regra de org vazia.

## Testes

- `handleInboundText`: texto comum de número ligado chama `consultar`; vínculo e
  SAIR não chamam.
- Canal WhatsApp com deps injetadas: org única, org escolhida, várias orgs sem
  escolha (responde link, não chama o agente), `wamid` repetido (não chama o
  agente), limite (responde aviso), erro do agente (responde indisponível),
  resposta longa quebrada em partes, ferramentas sem as de sugestão.
- `parseWebhook` devolve o id.
- Migration no banco real com rollback: índice único de `external_id` barra o
  segundo insert; CHECK de `canal`.
- Manual: mandar "quanto gastei com mercado este mês?" no WhatsApp e conferir
  com a tela.

## Fora do escopo

Histórico de conversas na web; operações (fase 2); áudio, imagem e outros tipos
de mensagem (seguem ignorados); consultor puxando conversa.
