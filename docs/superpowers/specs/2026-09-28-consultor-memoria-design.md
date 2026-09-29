# Consultor que aprende com o usuário (memória)

Data: 2026-09-28
Status: aprovado em conversa; depende da fase 1 (`2026-09-28-consultor-agente-design.md`)

## Objetivo

O consultor guarda o que aprende sobre o usuário — objetivos, preferências,
restrições, contexto de vida — e usa isso em toda conversa, na web e no
WhatsApp. Personalização além dos números: "quero quitar o cartão até
dezembro", "não me sugira cortar academia", "prefiro resposta curta".

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Quando grava | Sozinho, sem perguntar; avisa na resposta ("Anotei: …") | Perguntar a cada fato é atrito. O aviso + a lista para apagar dão o controle. |
| O que grava | Tudo que for objetivo, preferência, restrição ou contexto de vida | O usuário pediu "grava tudo e usa". |
| O que nunca grava | Dado sensível (senha, CPF, número de cartão/conta) e números que já estão no banco | Segurança; número do banco muda e a memória ficaria velha. |
| Escopo | Por usuário **e** org | Orgs diferentes são finanças diferentes. Vale para web e WhatsApp — é do usuário, não do canal. |
| Confirmação | Nenhuma (não usa a ação pendente da fase 2) | Escreve só na memória do próprio usuário: baixo risco. |
| Onde ver e apagar | Lista "O que o consultor sabe sobre você" dentro do /cfo | Transparência e LGPD; menu lateral não cresce. |
| Teto | 50 memórias por usuário/org; ao encher, a mais antiga sai | "Grava tudo" sem virar depósito nem inflar o prompt. |

## Componentes

**Banco — migration `00067_consultor_memorias.sql`**
- Tabela `consultor_memorias`: `id uuid pk`, `org_id` (fk `orgs`, cascade),
  `user_id uuid not null`, `conteudo text not null` com
  `CHECK (char_length(conteudo) BETWEEN 1 AND 300)`, `canal text not null`
  com `CHECK (canal IN ('web','whatsapp'))`, `created_at timestamptz`.
- Índice `(org_id, user_id, created_at)`.
- RLS no padrão de `notification_preferences` (00065): select, insert e delete
  só do próprio `user_id = auth.uid()` e `org_id IN get_user_org_ids()`. Sem
  update: corrigir = esquecer + lembrar.
- Schema Drizzle em `packages/db/src/schema/cfo.ts`.

**Ferramentas — `lib/consultor/ferramentas/`**
- `lembrar({ fato })`: grava sob `withUserDbFor(ctx.userId)` com o canal da
  conversa. Recusa (`ParametroInvalido`) texto com cara de dado sensível —
  sequência de 11 dígitos (CPF), 13–19 dígitos (cartão) ou a palavra "senha".
  Se já há 50, apaga a mais antiga antes. Devolve "Anotado." ao Claude.
- `esquecer({ id })`: apaga a memória do usuário com esse id; id inexistente
  vira `ParametroInvalido`.
- Tipo novo no contrato: `'memoria'` (roda no servidor, como leitura; o
  agente só não executa `'sugestao'`).
- `ContextoFerramenta` ganha `canal`.

**Prompt**
- `carregarDadosDoPrompt` traz as memórias do usuário/org (mais antigas
  primeiro) sob `withUserDbFor(userId)`.
- Seção "## O que você sabe sobre o usuário" com `- [id] texto`.
- Regras: ao aprender objetivo, preferência, restrição ou contexto de vida,
  chame `lembrar` e diga "Anotei: …" na resposta; não grave o que já está
  anotado; para corrigir, `esquecer` + `lembrar`; nunca grave dado sensível
  nem número que está no banco; use as memórias para adaptar conselho e tom.

**Tela — /cfo**
- Botão "O que o consultor sabe sobre você" abre lista com data e botão de
  apagar (server action com `withUserDb`). Sem item novo no menu.

## Erros

- Falha ao gravar: `tool_result` com erro genérico (regra da fase 1); o Claude
  segue a conversa sem dizer "Anotei".
- Migration não aplicada em produção: a ferramenta falha e cai no caso acima —
  o chat continua funcionando.

## Testes

- `lembrar`/`esquecer` com `withUserDbFor` mockado: grava com org, usuário e
  canal do contexto; recusa sensível; teto de 50 apaga a mais antiga; id
  inexistente.
- `montarPrompt` com e sem memórias.
- Migration e policies no banco real com rollback (os testes mockam o banco e
  CHECK/RLS só estouram em produção): inserir como o usuário, tentar ler como
  outro, conteúdo com 301 caracteres.
- Manual: dizer "quero quitar o cartão até dezembro" → resposta com "Anotei";
  nova conversa → o consultor usa isso; apagar pela lista → some do prompt.

## Fora do escopo

Editar ou criar memória pela tela, memória compartilhada entre membros da
org, resumo automático de conversas antigas.
