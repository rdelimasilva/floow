# Consultor como agente único (web + WhatsApp)

Data: 2026-09-28
Status: fase 1 detalhada; fases 2–5 como roteiro (cada uma ganha spec próprio na vez dela)

## Objetivo

Um só agente — o Consultor Financeiro — que **aconselha** (consulta os dados e
responde) e **opera** (grava no plano, metas, fila etc.), acessível pela web
(/cfo e pelas telas) e pelo WhatsApp. Mesmo cérebro, mesmas ferramentas, mesmas
regras; os canais são adaptadores.

## Decisões já tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Consultivo × operacional | Um agente, dois papéis | O usuário passa do conselho à ação na mesma conversa ("posso comprar?" → "então tira 200 do lazer"). Dois agentes exigiriam roteador e repasse de contexto — onde se erra. |
| Separação dos papéis | Dentro do agente: ferramentas de leitura rodam direto; de escrita sempre pedem confirmação | O risco está em gravar, não em responder. |
| Agentes por tela (Plano de Gastos, Meta de Investimentos) | Não. Mesmo agente aberto da tela, com o contexto dela | Evita três agentes fazendo a mesma coisa. Cada tela acrescenta ferramentas, não agentes. |
| Web × WhatsApp | Mesmo núcleo, dois adaptadores | Toda melhoria vale nos dois. |
| Org no WhatsApp | Org padrão escolhida em Configurações ao ligar o WhatsApp | Previsível; quem tem uma org não percebe. |
| Histórico entre canais | WhatsApp é uma conversa própria, visível na lista de conversas da web; memória só do canal | Rastro do que foi feito sem misturar assuntos nem inflar contexto. |
| Consultor que puxa conversa | Fora do escopo | Template iniciado pelo floow com conselho tende a virar *marketing* na Meta (mais caro). Revisitar depois da fase 3. |

Custo: na Meta, resposta dentro da janela de 24h aberta pelo usuário é
mensagem de atendimento (gratuita), inclusive botões e listas. O custo do
WhatsApp consultivo é o Claude — por isso o limite de uso vale para os dois
canais (fase 1). Conferir a tabela da Meta antes da fase 3.

## Estado atual (o que muda)

- `app/api/cfo/chat/route.ts`: uma chamada ao Claude por mensagem. O contexto é
  um resumo fixo (`lib/cfo/chat-context.ts`: receita/despesa do mês, saldo
  total, 5 insights, resumo do dia). **Não consegue consultar dados** — "quanto
  gastei com iFood em setembro" fica sem resposta ou inventado.
- `lib/cfo/chat-tools.ts`: 4 ferramentas que o cliente executa depois de um
  clique (`create_budget`, `adjust_budget`, `view_transactions`,
  `view_account`). Duas só redirecionam para tela — não servem no WhatsApp.
- `packages/core-finance/src/cfo/llm/anthropic.ts`: `streamChat` não devolve
  os blocos `tool_use` do assistente ao reenviar o histórico — só o texto. Não
  suporta laço de ferramentas no servidor.
- Modelo padrão: `claude-sonnet-4-20250514`.
- Actions de orçamento (`lib/finance/budget-actions.ts`) descobrem a org pela
  sessão (`getOrgId()`). Pelo WhatsApp não há sessão.

## Roteiro

1. **Núcleo do agente + ferramentas de leitura** — /cfo migra para ele.
2. **Operações com confirmação** — linhas do plano (gastos e investimentos),
   notificações; botão "Pedir ao consultor" em Plano de Gastos e Meta de
   Investimentos.
3. **Canal WhatsApp** — org padrão, conversa "WhatsApp", confirmação por
   mensagem.
4. **Fila de classificação por botões** no WhatsApp.
5. **Gasto manual + conciliação com Open Finance.**

Operações vêm antes do WhatsApp: são testadas primeiro na web, onde é fácil ver
o que foi gravado, e o WhatsApp já estreia consultivo e operacional.

---

## Fase 1 — Núcleo do agente + leitura

### Resultado esperado

No /cfo, o consultor responde com números reais perguntas como:

- "Quanto gastei com mercado em setembro?"
- "Quais foram minhas maiores despesas esse mês?"
- "Como está meu plano de gastos de outubro?"
- "Quanto já investi da meta desse mês?"
- "Quanto tenho em conta hoje?"
- "Gastei mais com delivery esse mês do que no mês passado?"

E, quando não houver dado, diz que não há — nunca inventa.

Nada muda no WhatsApp nesta fase.

### Arquitetura

```
/api/cfo/chat (web, SSE)          [fase 3: webhook WhatsApp]
          \                              /
           agente.responder({ orgId, userId, canal, conversaId, mensagem, tela? })
                         |
          laço: Claude ⇄ ferramentas (máx. 5 rodadas)
                         |
          ferramentas/leitura/*  — recebem { db, orgId }, nunca a sessão
```

### Componentes

**`lib/consultor/agente.ts`** — o laço.
- Entrada: `{ orgId, userId, canal: 'web' | 'whatsapp', conversaId, mensagem, tela?, onTexto? }`.
- Aplica o limite de uso (mesmos buckets de hoje, `cfo.chat.burst` e
  `cfo.chat.hour`, sujeito `orgId`) — sai do route e passa a valer para
  qualquer canal. Uma pergunta conta uma vez, não por rodada.
- Recebe o histórico já montado pelo canal (últimas 20 mensagens, só texto),
  chama o Claude com as ferramentas, executa as de leitura pedidas, devolve os
  resultados e repete até o Claude responder sem pedir ferramenta ou até 5
  rodadas. Histórico e persistência ficam no adaptador de cada canal.
- Estourou 5 rodadas: responde "Não consegui concluir essa análise. Tente
  perguntar de forma mais específica." e registra no log.
- Saída: `{ texto, acoesSugeridas }` (ver "Ações da tela atual" abaixo).
- `onTexto` recebe o texto em streaming de todas as rodadas, separadas por
  linha em branco (a web usa; o WhatsApp vai ignorar).

**`lib/consultor/prompt.ts`** — instruções do agente.
- Base do prompt atual (tom, pt-BR, respostas curtas), mais:
  - "Todo número vem de ferramenta. Se a ferramenta não trouxe, você não sabe."
  - Como aconselhar: comparar com o plano e com meses anteriores antes de opinar.
  - Canal: na web pode usar markdown; no WhatsApp (fase 3), só `*negrito*` e listas simples.
  - `tela` (fase 2): "O usuário está em Plano de Gastos, mês 2026-10."
- Contexto fixo encolhe: data de hoje, nomes das contas e categorias (para o
  Claude acertar os parâmetros), insights ativos. Receita/despesa/saldo passam a
  vir das ferramentas.

**`lib/consultor/ferramentas/`** — uma ferramenta por arquivo, com um registro.
- Formato: `{ nome, tipo: 'leitura' | 'escrita', descricao, esquema, executar(ctx, params) }`.
- `ctx = { db, orgId, userId }`. Toda consulta filtra por `ctx.orgId`.
- Parâmetros validados com zod antes de executar; inválido vira `tool_result`
  com erro para o Claude corrigir.
- Resultado limitado (máx. 30 linhas) e já formatado em reais — o Claude não
  faz conta com centavos.

Ferramentas de leitura da fase 1:

| Ferramenta | Parâmetros | Devolve |
|---|---|---|
| `resumo_do_periodo` | `inicio`, `fim` | receita, despesa, saldo do período |
| `gastos_por_categoria` | `inicio`, `fim`, `categoria?` | total por categoria (ou de uma), ordenado |
| `buscar_transacoes` | `inicio`, `fim`, `texto?`, `categoria?`, `conta?` | até 30 lançamentos (data, descrição, valor, categoria, conta) + total |
| `plano_do_mes` | `mes`, `tipo: 'spending' \| 'investing'` | cada linha: planejado × realizado × restante |
| `saldos_das_contas` | — | saldo por conta ativa e total |

Só transações confirmadas (`reviewState = 'confirmed'`), como o contexto de hoje.
Onde já existir query pronta que dependa de `getOrgId()`, extrai-se o núcleo com
`orgId` explícito e a função antiga passa a chamá-lo — sem mudar o comportamento
da tela.

**`packages/core-finance` — provider**
- `streamChat` passa a aceitar, no histórico, mensagens do assistente com blocos
  `tool_use` e mensagens `tool_result` com `tool_use_id` e `is_error`, no formato
  da API da Anthropic.
- Modelo vira configuração (`CFO_CHAT_MODEL`), padrão `claude-sonnet-5`.

**`app/api/cfo/chat/route.ts`** — vira adaptador fino: autentica, resolve
`orgId`, chama `agente.responder`, repassa o texto em SSE no formato de hoje.
`hooks/use-chat.ts` não muda.

**Ações da tela atual** (`create_budget`, `adjust_budget`, `view_transactions`,
`view_account`) continuam como estão na fase 1: o agente as devolve como ações
sugeridas e o cliente executa depois do clique, pela rota
`/api/cfo/chat/action` de hoje. A fase 2 as substitui.

### Persistência

Sem mudança de tabela. Continua salvando a mensagem do usuário e a resposta
final em `cfo_messages`. As rodadas intermediárias de ferramenta não são
salvas: o histórico reenviado ao Claude é só texto, e ele consulta de novo se
precisar. (Mantém o contexto pequeno e barato.)

### Erros

- Ferramenta falha (exceção de banco): `tool_result` com `is_error`, mensagem
  genérica ao Claude; detalhe só no log/Sentry.
- API da Anthropic falha ou estoura tempo: resposta "O consultor está
  indisponível agora. Tente de novo em instantes." (web recebe como chunk
  `error`, igual hoje).
- Tempo total: 30 s por chamada (já existe) e `maxDuration` do route ajustado
  para comportar 5 rodadas (60 s).

### Testes

- Cada ferramenta: teste unitário com banco mockado (filtro por org, período,
  limite de linhas, formatação em reais).
- Laço do agente: provider falso que pede ferramenta → recebe resultado →
  responde; ferramenta com erro; estouro de 5 rodadas; limite de uso.
- Provider: conversão do histórico com `tool_use`/`tool_result`.
- Antes de ir para produção: rodar as seis perguntas de "Resultado esperado"
  na org com dados e conferir os números contra as telas.

### Fora da fase 1

Ferramentas de escrita, WhatsApp, botão nas telas, gravação das rodadas de
ferramenta.

---

## Fases 2–5 (roteiro — detalhar no spec de cada uma)

### Fase 2 — Operações com confirmação

- Ferramentas de escrita não gravam: devolvem **ação pendente**
  `{ id, ferramenta, params, resumo }` guardada no banco, com validade curta.
  O canal pede confirmação (web: botão; WhatsApp: "sim"). Confirmar executa pelo
  núcleo com `orgId` explícito.
- Ferramentas: criar / ajustar / remover linha do plano (`budget_entries`,
  `spending` e `investing` — é o "lançamento" de Plano de Gastos e de Meta de
  Investimentos); ligar/desligar e mudar horário das notificações.
- Actions de `budget-actions.ts` usadas pelo agente ganham núcleo com `orgId`
  explícito; a server action vira casca.
- Botão "Pedir ao consultor" em Plano de Gastos e Meta de Investimentos, abrindo
  o agente com `tela` preenchida.
- Sai o fluxo antigo de `chat-tools.ts`. Atenção: `create_budget` hoje cria
  `budget_goals`, não linha do plano — decidir se alguma coisa ainda usa isso.

### Fase 3 — Canal WhatsApp

- Configurações: org padrão do WhatsApp.
- `cfo_conversations` ganha `canal`; uma conversa "WhatsApp" por usuário/org,
  listada na web.
- Webhook responde 200 na hora e processa em segundo plano (`after()`);
  mensagem de vínculo e SAIR continuam antes do agente em `handleInboundText`.
- Confirmação de ação pendente por "sim"/"não" (e botões, se couber).
- Limite de uso estourado: uma mensagem avisando, não silêncio.

### Fase 4 — Fila de classificação por botões

- Um grupo por mensagem: contraparte, quantidade, total, sugestão
  (`sugestao-da-fila.ts`), botões Confirmar / Outra categoria / Pular; "Outra"
  abre lista (até 10).
- Transferências ficam fora (precisam de conta de destino): link para o app.

### Fase 5 — Gasto manual + conciliação

- "Gastei 45 no almoço" cria lançamento previsto; quando o Open Finance trouxer
  o realizado, propõe o par.
- Antes do spec: verificar se `forecast-match-db.ts` / `matchForecast` aceitam
  esse previsto (hoje servem a recorrências) e definir a conta (perguntar ou
  padrão).
