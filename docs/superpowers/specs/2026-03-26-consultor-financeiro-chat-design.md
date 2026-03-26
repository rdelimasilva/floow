# Consultor Financeiro — Chat Interativo

**Data:** 2026-03-26
**Status:** Design aprovado
**Depende de:** `2026-03-25-hybrid-cfo-ai-agents-design.md` (ja implementado)

## Visao Geral

Chat interativo integrado ao Consultor Financeiro. Dois modos: chat contextual por insight (efemero) e chat geral na pagina /cfo (persistido). O consultor tem acesso aos dados financeiros do usuario, pode responder perguntas e executar acoes (criar orcamento, etc.) com confirmacao do usuario. Streaming token-a-token via ReadableStream. Provider-agnostico, sem dependencia de SDK externo.

## Decisoes de Design

| Decisao | Escolha | Razao |
|---|---|---|
| SDK/Framework | Raw fetch + ReadableStream | Zero dependencia, provider-agnostico, sem lock-in |
| Streaming | SSE via ReadableStream | Padrao Web API, funciona em qualquer runtime |
| Chat por insight | Efemero (nao persiste) | Conversas curtas e contextuais |
| Chat geral | Persistido no banco | Usuario pode voltar e rever conselhos |
| Tool calling | Propoe + confirma | LLM nunca executa direto, usuario confirma via botao |
| Freemium | Chat so no plano pago | Controle de custo LLM |

## Arquitetura

```
CLIENT (useChat hook)
  fetch('/api/cfo/chat', { stream: true })
  → ReadableStream reader
  → acumula tokens no state
  → detecta tool_call → mostra botoes de confirmacao
  → user confirma → POST /api/cfo/chat/action
      |
      v
API ROUTE (server)
  POST /api/cfo/chat
  1. Auth via session cookie
  2. Checa plano (freemium gate)
  3. Carrega contexto financeiro (engine existente)
  4. Carrega historico (se chat geral)
  5. Monta system prompt + tools + messages
  6. Chama LLMProvider.streamChat()
  7. Retorna ReadableStream (SSE)
  8. onFinish: salva mensagens no banco (se chat geral)
      |
      v
LLM PROVIDER (interface estendida)
  streamChat(messages, { system, tools, onChunk })
  → Anthropic: parseia SSE, converte pra ChatStreamChunk
  → OpenAI: idem (futuro)
  → Retorna ChatResponse unificado
```

## Tipos (extensao do types.ts existente)

```typescript
interface ChatMessage {
  id: string                        // UUID (db id para persistidos, client-generated para efemeros)
  role: 'user' | 'assistant' | 'tool_result'
  content: string
  toolCall?: ToolCall
  toolResult?: { success: boolean; message: string }
  createdAt: string                 // ISO timestamp
}

interface ChatTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema compliant — providers convertem direto pro formato da API
}

interface ToolCall {
  id: string
  name: string
  params: Record<string, unknown>
}

interface ChatStreamChunk {
  type: 'text' | 'tool_call' | 'done'
  text?: string
  toolCall?: ToolCall
}

interface ChatResponse {
  content: string
  toolCalls: ToolCall[]
  usage?: { inputTokens: number; outputTokens: number }
}
```

**Nota sobre `ChatTool.inputSchema`:** Usa JSON Schema padrao (o mesmo formato que Anthropic e OpenAI aceitam nativamente). O provider passa direto pra API sem conversao. Exemplo:

```json
{
  "type": "object",
  "properties": {
    "category": { "type": "string", "description": "Nome da categoria" },
    "amount": { "type": "number", "description": "Limite em centavos" }
  },
  "required": ["category", "amount"]
}
```

## LLM Provider — Interface estendida

A interface `LLMProvider` existente nao muda. Criamos uma interface separada para chat:

```typescript
interface ChatProvider extends LLMProvider {
  streamChat(
    messages: ChatMessage[],
    options: {
      system: string
      tools?: ChatTool[]
      onChunk: (chunk: ChatStreamChunk) => void
    }
  ): Promise<ChatResponse>
}
```

`ChatProvider` extende `LLMProvider` — implementacoes existentes (so `synthesize`) continuam funcionando. A factory `createAnthropicProvider` passa a retornar `ChatProvider` (backward-compatible pois `ChatProvider extends LLMProvider`).

A implementacao Anthropic (`anthropic.ts`) adiciona `streamChat`:
- Faz `fetch` com `stream: true` pra API da Anthropic
- Parseia SSE events (`content_block_delta`, `content_block_start` type `tool_use`)
- Converte pra `ChatStreamChunk` unificado e chama `onChunk`
- No final retorna `ChatResponse` com conteudo completo + tool calls

Trocar de provider = implementar `streamChat` com parse dos SSE do outro provider. Client e API route nao mudam.

## Tool Calling

### Tools disponiveis

| Tool | Descricao | Execucao |
|---|---|---|
| `create_budget` | Criar orcamento pra categoria | Adapter em `chat-tools.ts` → converte params JSON pra FormData → chama `upsertBudgetGoal()` |
| `adjust_budget` | Ajustar limite de orcamento | Adapter em `chat-tools.ts` → converte params JSON pra FormData → chama `upsertBudgetGoal()` |
| `view_transactions` | Redirecionar pra transacoes filtradas | Client-side redirect (retorna URL no tool_result) |
| `view_account` | Redirecionar pra conta | Client-side redirect (retorna URL no tool_result) |

**Nota sobre adapters:** As server actions existentes (`upsertBudgetGoal`) recebem `FormData`. O modulo `chat-tools.ts` define adapters que convertem `ToolCall.params` (JSON) pra `FormData` antes de chamar a action. Cada tool tem um adapter registrado num mapa `TOOL_EXECUTORS`.

**Seguranca:** O endpoint `/api/cfo/chat/action` valida `toolCall.name` contra uma allowlist hardcoded (`ALLOWED_TOOLS`) antes de executar. Nomes fora da lista sao rejeitados com 400.

### Fluxo de confirmacao

1. LLM retorna `ChatStreamChunk` com `type: 'tool_call'`
2. Client renderiza `ToolCallCard` com botoes Confirmar/Cancelar
3. Usuario clica Confirmar → `POST /api/cfo/chat/action`
4. Server executa a action correspondente
5. Resultado retornado ao chat como mensagem `tool_result`

O LLM **nunca executa direto**. Sempre propoe, usuario confirma.

## Modelo de Dados

### Tabela: cfo_conversations

```sql
CREATE TABLE cfo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,              -- supabase auth.users id, conversas sao pessoais
  title TEXT,                          -- auto-gerado: primeiras palavras da primeira mensagem do usuario
  insight_id UUID REFERENCES cfo_insights(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cfo_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_conversations_select" ON cfo_conversations FOR SELECT TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_conversations_insert" ON cfo_conversations FOR INSERT TO authenticated
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_conversations_update" ON cfo_conversations FOR UPDATE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_conversations_delete" ON cfo_conversations FOR DELETE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE INDEX idx_cfo_conversations_org ON cfo_conversations (org_id, updated_at DESC);
```

### Tabela: cfo_messages

```sql
CREATE TABLE cfo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES cfo_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_call JSONB,
  tool_result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cfo_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_messages_select" ON cfo_messages FOR SELECT TO authenticated
  USING (conversation_id IN (
    SELECT id FROM cfo_conversations
    WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  ));

CREATE POLICY "cfo_messages_insert" ON cfo_messages FOR INSERT TO authenticated
  WITH CHECK (conversation_id IN (
    SELECT id FROM cfo_conversations
    WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  ));

CREATE POLICY "cfo_messages_delete" ON cfo_messages FOR DELETE TO authenticated
  USING (conversation_id IN (
    SELECT id FROM cfo_conversations
    WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  ));

CREATE INDEX idx_cfo_messages_conversation ON cfo_messages (conversation_id, created_at);
```

### Comportamento por modo

| Modo | Cria conversation? | Salva messages? | insight_id |
|---|---|---|---|
| Chat geral | Sim (persistido) | Sim | null |
| Chat por insight | Nao | Nao (efemero) | N/A |

## API Routes

### POST /api/cfo/chat

```
Request:
{
  conversationId?: string,     // null = nova conversa (chat geral) ou efemero
  insightId?: string,          // se chat por insight
  message: string,
  history?: ChatMessage[]      // obrigatorio para chat efemero (sem conversationId nem insightId eh erro)
}
```

**Resolucao do historico:**
- Chat geral com `conversationId`: server carrega historico do banco, ignora `history`
- Chat geral sem `conversationId`: server cria nova conversa, `history` vazio
- Chat por insight com `insightId`: server usa `history` enviado pelo client (efemero, multi-turn)

**Rate limiting:** Maximo de 30 mensagens/hora por org. Controlado via contagem em `cfo_messages` + counter in-memory para efemeros.

```
Response: ReadableStream
  Content-Type: text/event-stream

  data: {"type":"text","text":"Seus gastos..."}\n\n
  data: {"type":"tool_call","toolCall":{"id":"t1","name":"create_budget","params":{...}}}\n\n
  data: {"type":"done"}\n\n
```

O client usa `fetch` + `response.body.getReader()` + `TextDecoder` para ler os chunks. Parseia cada linha `data: {...}` manualmente (nao usa `EventSource`).

Auth via session cookie. Checa plano do usuario (freemium gate).

### POST /api/cfo/chat/action

```
Request:
{
  conversationId?: string,
  toolCall: { id: string, name: string, params: Record<string, unknown> }
}

Response:
{ success: boolean, message: string }
```

## Hook: useChat

```typescript
function useChat(options?: { insightId?: string }) {
  // State
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null

  // Actions
  sendMessage(text: string): void
  confirmAction(toolCall: ToolCall): void

  // ~60 linhas, zero dependencia externa
}
```

Internamente:
- `sendMessage`: POST /api/cfo/chat com ReadableStream reader, acumula tokens via `setMessages`
- `confirmAction`: POST /api/cfo/chat/action, adiciona tool_result ao messages

## Contexto enviado ao LLM

```
System prompt (persona consultor financeiro)
+ Contexto financeiro resumido (~500 tokens):
  - receita/despesa mensal, net worth, dividas, investimentos, savings rate
  - top categorias de gasto
+ Insights ativos (resumo dos 3-5 mais relevantes)
+ [Se chat por insight] Dados detalhados daquele insight (metric, body, suggested actions)
+ [Se chat geral] Ultimas 20 mensagens do historico (truncado pra caber em ~4000 tokens de mensagens)
+ [Se disponivel] daily_summary do ultimo cfo_run (resumo narrativo pre-gerado)
+ Tools disponiveis com descricoes
```

O contexto financeiro e o mesmo resumo compacto ja usado na sintese de insights. Nao envia transacoes individuais.

**Truncamento:** Maximo de 20 mensagens ou ~4000 tokens de historico (o que for menor). Mensagens mais antigas sao descartadas, mantendo sempre a primeira mensagem (contexto inicial) + as N mais recentes.

## UX

### Chat por insight (efemero)

Botao "Conversar" no InsightCard. Abre painel inline abaixo do card (accordion). Chat pre-carregado com contexto daquele insight. Fecha ao colapsar.

### Chat geral (persistido)

Secao na pagina /cfo abaixo dos insights. Mensagem de boas-vindas do consultor. Input de texto com botao enviar. Historico carregado do banco.

### Componentes

- `ChatPanel` — lista de mensagens + input + streaming indicator
- `ChatMessage` — bolha de mensagem (user/assistant/tool_result)
- `ToolCallCard` — card de confirmacao de acao com botoes Confirmar/Cancelar

## Estrutura de Codigo

```
packages/core-finance/src/cfo/
  types.ts                          # + ChatMessage, ChatTool, ToolCall, ChatStreamChunk, ChatResponse
  llm/
    anthropic.ts                    # + streamChat method

packages/db/src/schema/
  cfo.ts                            # + cfoConversations, cfoMessages tables

apps/web/
  app/api/cfo/
    chat/route.ts                   # POST — stream chat
    chat/action/route.ts            # POST — execute tool call
  app/(app)/cfo/
    client.tsx                      # + secao de chat geral
  components/cfo/
    chat-panel.tsx                  # componente reutilizavel
    chat-message.tsx                # bolha de mensagem
    tool-call-card.tsx              # card de confirmacao
    insight-card.tsx                # + botao Conversar e chat inline
  hooks/
    use-chat.ts                     # hook custom (~60 linhas)
  lib/cfo/
    chat-actions.ts                 # executeToolCall, saveMessage
    chat-queries.ts                 # getConversation, getMessages
    chat-tools.ts                   # definicao das tools + mapeamento
    chat-context.ts                 # monta system prompt + contexto financeiro
```

## Testes

- **`use-chat.ts`** — Vitest com fetch mockado, verificar streaming e acumulacao de tokens
- **`chat-tools.ts`** — Testar mapeamento tool name → server action
- **`chat-context.ts`** — Testar montagem de system prompt com dados financeiros

## Fallback e Resiliencia

| Falha | Comportamento |
|---|---|
| LLM indisponivel | Mostra erro "Consultor indisponivel, tente novamente" |
| LLM timeout (>30s) | Cancela stream, mostra erro |
| Tool call falha | Retorna tool_result com success=false e mensagem de erro |
| Usuario sem plano pago | Mostra card de upgrade em vez do chat |
| Stream interrompido | Client detecta e mostra botao "Tentar novamente" |
