# Memória do Consultor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O consultor grava sozinho o que aprende sobre o usuário (objetivos, preferências, restrições, contexto), usa isso em toda conversa e mostra a lista no /cfo para apagar.

**Architecture:** Tabela `consultor_memorias` (migration 00067, já aplicada em produção) com RLS por usuário/org. Um módulo de dados `lib/consultor/memorias.ts` lê/grava/apaga sempre sob `withUserDbFor(userId)`. Duas ferramentas novas do agente (`lembrar`, `esquecer`, tipo `'memoria'`, rodam sem confirmação). As memórias entram no prompt pela carga que já existe (`carregarDadosDoPrompt`). No /cfo, uma seção lista as memórias com botão de apagar (server action).

**Tech Stack:** Next.js, TypeScript, Drizzle, zod 3, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-consultor-memoria-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md).
- Textos e comentários em pt-BR ("tela", "você").
- Toda leitura/escrita de `consultor_memorias` roda sob `withUserDbFor(userId)` (ou `withUserDb` na server action) e filtra por `org_id` e `user_id`. Nunca `getDb()`/`getServiceDb()` — o teste `__tests__/auth/rls-ledger.test.ts` barra `getDb()` novo.
- Conteúdo: 1 a 300 caracteres (CHECK do banco); canal `'web' | 'whatsapp'`.
- Teto: `MAX_MEMORIAS = 50` por usuário/org; ao gravar a 51ª, apaga a mais antiga.
- Dado sensível recusado: após remover espaços, pontos, hífens e barras, qualquer sequência de 11 a 19 dígitos; ou a palavra "senha" (sem caixa).
- Trabalho na branch `feat/consultor-memoria` do worktree `.claude/worktrees/consultor-agente`; `git add` só dos arquivos da tarefa; commit termina com linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Memória de uma org aparecendo em outra org do mesmo usuário — todas as consultas filtram `org_id` além do RLS (Task 1).
2. Fato de 301+ caracteres vindo do Claude — deve virar erro de parâmetro, não exceção do banco (Task 2).
3. `esquecer` com id de outro usuário ou inexistente — erro de parâmetro, nada apagado (Task 2).
4. Prompt sem memórias — seção não aparece vazia nem quebra (Task 3).
5. Apagar pela tela com id de outra pessoa — a server action não apaga (RLS + filtro) e não quebra a tela (Task 4).

---

### Task 1: Schema Drizzle e módulo de dados das memórias

**Files:**
- Modify: `packages/db/src/schema/cfo.ts` (acrescentar tabela e tipos no fim)
- Create: `apps/web/lib/consultor/memorias.ts`
- Test: `apps/web/__tests__/consultor/memorias.test.ts`

**Interfaces:**
- Produces:
  - `consultorMemorias` (pgTable), `type ConsultorMemoria`, exportados por `@floow/db` (o `index.ts` já faz `export * from './schema/cfo'`).
  - `memorias.ts`: `MAX_MEMORIAS = 50`; `type CanalDaMemoria = 'web' | 'whatsapp'`; `interface Memoria { id: string; conteudo: string; createdAt: Date }`;
    `listarMemorias(orgId: string, userId: string): Promise<Memoria[]>` (mais antigas primeiro);
    `gravarMemoria(p: { orgId: string; userId: string; canal: CanalDaMemoria; conteudo: string }): Promise<void>`;
    `apagarMemoria(orgId: string, userId: string, id: string): Promise<boolean>` (true se apagou).

- [ ] **Step 1: Schema**

No fim de `packages/db/src/schema/cfo.ts`, antes dos `export type` existentes ou logo depois deles:

```ts
/** O que o consultor aprendeu sobre o usuário, por org (migration 00067). */
export const consultorMemorias = pgTable(
  'consultor_memorias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    conteudo: text('conteudo').notNull(),
    canal: text('canal').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxUsuario: index('idx_consultor_memorias_usuario').on(table.orgId, table.userId, table.createdAt),
  })
)

export type ConsultorMemoria = typeof consultorMemorias.$inferSelect
```

Run: `cd packages/db && pnpm typecheck` (se o pacote não tiver o script, `cd apps/web && pnpm typecheck`).
Expected: sem erro.

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/__tests__/consultor/memorias.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Transação falsa: grava as chamadas de cada construtor do Drizzle e devolve
 * o que a fila `respostas` mandar, na ordem das consultas.
 */
const chamadas: { op: string; args: unknown[] }[] = []
let respostas: unknown[] = []
function consulta(op: string) {
  const alvo: Record<string, unknown> = {}
  const proxy: unknown = new Proxy(alvo, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const r = respostas.shift()
        return (ok: (v: unknown) => void) => ok(r)
      }
      return (...args: unknown[]) => {
        chamadas.push({ op: `${op}.${prop}`, args })
        return proxy
      }
    },
  })
  return proxy
}
const tx = {
  select: (...a: unknown[]) => { chamadas.push({ op: 'select', args: a }); return consulta('select') },
  insert: (...a: unknown[]) => { chamadas.push({ op: 'insert', args: a }); return consulta('insert') },
  delete: (...a: unknown[]) => { chamadas.push({ op: 'delete', args: a }); return consulta('delete') },
}
vi.mock('@/lib/db/rls', () => ({ withUserDbFor: vi.fn((_u: string, fn: (t: unknown) => unknown) => fn(tx)) }))

import { withUserDbFor } from '@/lib/db/rls'
import { listarMemorias, gravarMemoria, apagarMemoria, MAX_MEMORIAS } from '@/lib/consultor/memorias'

beforeEach(() => {
  chamadas.length = 0
  respostas = []
  vi.mocked(withUserDbFor).mockClear()
})

describe('memorias', () => {
  it('listar roda sob o RLS do usuário e devolve as linhas', async () => {
    respostas = [[{ id: 'm1', conteudo: 'quer quitar o cartão', createdAt: new Date(0) }]]
    const r = await listarMemorias('org-1', 'u1')
    expect(withUserDbFor).toHaveBeenCalledWith('u1', expect.any(Function))
    expect(r).toEqual([{ id: 'm1', conteudo: 'quer quitar o cartão', createdAt: new Date(0) }])
  })

  it('gravar abaixo do teto só insere, com org, usuário, canal e conteúdo aparado', async () => {
    respostas = [[{ total: 3 }], undefined]
    await gravarMemoria({ orgId: 'org-1', userId: 'u1', canal: 'web', conteudo: '  prefere resposta curta  ' })
    expect(chamadas.some((c) => c.op === 'delete')).toBe(false)
    const valores = chamadas.find((c) => c.op === 'insert.values')!.args[0]
    expect(valores).toEqual({ orgId: 'org-1', userId: 'u1', canal: 'web', conteudo: 'prefere resposta curta' })
  })

  it('gravar no teto apaga a mais antiga antes de inserir', async () => {
    respostas = [[{ total: MAX_MEMORIAS }], undefined, undefined]
    await gravarMemoria({ orgId: 'org-1', userId: 'u1', canal: 'whatsapp', conteudo: 'x' })
    const ops = chamadas.map((c) => c.op).filter((o) => o === 'delete' || o === 'insert')
    expect(ops).toEqual(['delete', 'insert'])
  })

  it('apagar devolve true quando apagou e false quando não achou', async () => {
    respostas = [[{ id: 'm1' }]]
    expect(await apagarMemoria('org-1', 'u1', 'm1')).toBe(true)
    respostas = [[]]
    expect(await apagarMemoria('org-1', 'u1', 'mX')).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/memorias.test.ts`
Expected: FAIL — módulo `@/lib/consultor/memorias` não existe.

- [ ] **Step 4: Implement**

```ts
// apps/web/lib/consultor/memorias.ts
/**
 * Memória do consultor: o que ele aprendeu sobre o usuário, por org.
 *
 * Tudo sob o RLS do usuário (withUserDbFor): o WhatsApp não tem sessão, então
 * o userId entra explícito. O filtro por org_id vai junto porque o mesmo
 * usuário pode estar em várias orgs e a memória de uma não vale na outra.
 */
import { consultorMemorias } from '@floow/db'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { withUserDbFor } from '@/lib/db/rls'

export const MAX_MEMORIAS = 50

export type CanalDaMemoria = 'web' | 'whatsapp'

export interface Memoria {
  id: string
  conteudo: string
  createdAt: Date
}

const doUsuario = (orgId: string, userId: string) =>
  and(eq(consultorMemorias.orgId, orgId), eq(consultorMemorias.userId, userId))

export function listarMemorias(orgId: string, userId: string): Promise<Memoria[]> {
  return withUserDbFor(userId, (tx) =>
    tx
      .select({ id: consultorMemorias.id, conteudo: consultorMemorias.conteudo, createdAt: consultorMemorias.createdAt })
      .from(consultorMemorias)
      .where(doUsuario(orgId, userId))
      .orderBy(asc(consultorMemorias.createdAt)),
  )
}

/** No teto, a mais antiga sai para a nova entrar. */
export function gravarMemoria(p: { orgId: string; userId: string; canal: CanalDaMemoria; conteudo: string }): Promise<void> {
  return withUserDbFor(p.userId, async (tx) => {
    const [{ total }] = await tx
      .select({ total: count() })
      .from(consultorMemorias)
      .where(doUsuario(p.orgId, p.userId))
    if (Number(total) >= MAX_MEMORIAS) {
      const maisAntigas = tx
        .select({ id: consultorMemorias.id })
        .from(consultorMemorias)
        .where(doUsuario(p.orgId, p.userId))
        .orderBy(asc(consultorMemorias.createdAt))
        .limit(Number(total) - MAX_MEMORIAS + 1)
      await tx.delete(consultorMemorias).where(inArray(consultorMemorias.id, maisAntigas))
    }
    await tx.insert(consultorMemorias).values({
      orgId: p.orgId,
      userId: p.userId,
      canal: p.canal,
      conteudo: p.conteudo.trim(),
    })
  })
}

export function apagarMemoria(orgId: string, userId: string, id: string): Promise<boolean> {
  return withUserDbFor(userId, async (tx) => {
    const apagadas = await tx
      .delete(consultorMemorias)
      .where(and(doUsuario(orgId, userId), eq(consultorMemorias.id, id)))
      .returning({ id: consultorMemorias.id })
    return apagadas.length > 0
  })
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/memorias.test.ts && pnpm typecheck`
Expected: PASS. Se a transação falsa do teste não acompanhar algum encadeamento do Drizzle usado aqui, ajuste o teste (não o código) mantendo as mesmas asserções de comportamento.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/cfo.ts apps/web/lib/consultor/memorias.ts apps/web/__tests__/consultor/memorias.test.ts
git commit -m "feat(consultor): schema e módulo de dados da memória"
```

---

### Task 2: Ferramentas `lembrar` e `esquecer`, com o canal no contexto

**Files:**
- Modify: `apps/web/lib/consultor/ferramentas/tipos.ts` (`ContextoFerramenta` ganha `canal`; tipo `'memoria'`)
- Modify: `apps/web/lib/consultor/agente.ts` (`EntradaDoAgente` ganha `canal`; passa para o `ctx`)
- Modify: `apps/web/app/api/cfo/chat/route.ts` (passa `canal: 'web'` ao `responder`)
- Create: `apps/web/lib/consultor/ferramentas/memoria.ts`
- Modify: `apps/web/lib/consultor/ferramentas/index.ts` (registra as duas)
- Modify: testes que montam `ContextoFerramenta`/`EntradaDoAgente` só se o typecheck exigir (acrescentar `canal: 'web'`)
- Test: `apps/web/__tests__/consultor/ferramentas-memoria.test.ts`

**Interfaces:**
- Consumes: Task 1 (`gravarMemoria`, `apagarMemoria`, `CanalDaMemoria`); `validar`, `ParametroInvalido` (fase 1).
- Produces: `ContextoFerramenta { orgId; userId; canal: CanalDaMemoria }`; `Ferramenta.tipo: 'leitura' | 'memoria' | 'sugestao'`; `EntradaDoAgente.canal: CanalDaMemoria`; `lembrar: Ferramenta` (`lembrar`, params `{ fato }`), `esquecer: Ferramenta` (`esquecer`, params `{ id }`); `pareceSensivel(texto: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/consultor/ferramentas-memoria.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/consultor/memorias', () => ({ gravarMemoria: vi.fn(), apagarMemoria: vi.fn() }))

import { gravarMemoria, apagarMemoria } from '@/lib/consultor/memorias'
import { lembrar, esquecer, pareceSensivel } from '@/lib/consultor/ferramentas/memoria'
import { ParametroInvalido } from '@/lib/consultor/ferramentas/tipos'

const ctx = { orgId: 'org-1', userId: 'u1', canal: 'whatsapp' as const }
const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => vi.clearAllMocks())

describe('pareceSensivel', () => {
  it.each([
    ['meu cpf é 123.456.789-00', true],
    ['cartão 4111 1111 1111 1111', true],
    ['a SENHA do banco é x', true],
    ['quer juntar R$ 1.500.000,00 até 2030', false],
    ['prefere resposta curta', false],
  ])('%s → %s', (texto, esperado) => {
    expect(pareceSensivel(texto)).toBe(esperado)
  })
})

describe('lembrar', () => {
  it('grava com org, usuário e canal do contexto', async () => {
    expect(await lembrar.executar!(ctx, { fato: 'quer quitar o cartão até dezembro' })).toBe('Anotado.')
    expect(gravarMemoria).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'u1', canal: 'whatsapp', conteudo: 'quer quitar o cartão até dezembro' })
  })

  it('recusa dado sensível sem gravar', async () => {
    await expect(lembrar.executar!(ctx, { fato: 'cpf 12345678900' })).rejects.toThrow(ParametroInvalido)
    expect(gravarMemoria).not.toHaveBeenCalled()
  })

  it('fato vazio ou com mais de 300 caracteres é parâmetro inválido', async () => {
    await expect(lembrar.executar!(ctx, { fato: '   ' })).rejects.toThrow(ParametroInvalido)
    await expect(lembrar.executar!(ctx, { fato: 'a'.repeat(301) })).rejects.toThrow(ParametroInvalido)
    expect(gravarMemoria).not.toHaveBeenCalled()
  })

  it('é do tipo memoria (roda no servidor)', () => {
    expect(lembrar.tipo).toBe('memoria')
    expect(esquecer.tipo).toBe('memoria')
  })
})

describe('esquecer', () => {
  it('apaga a memória do usuário', async () => {
    vi.mocked(apagarMemoria).mockResolvedValue(true)
    expect(await esquecer.executar!(ctx, { id: ID })).toBe('Esquecido.')
    expect(apagarMemoria).toHaveBeenCalledWith('org-1', 'u1', ID)
  })

  it('id que não é deste usuário/org vira parâmetro inválido', async () => {
    vi.mocked(apagarMemoria).mockResolvedValue(false)
    await expect(esquecer.executar!(ctx, { id: ID })).rejects.toThrow(ParametroInvalido)
  })

  it('id que não é uuid nem chega ao banco', async () => {
    await expect(esquecer.executar!(ctx, { id: 'm1' })).rejects.toThrow(ParametroInvalido)
    expect(apagarMemoria).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/ferramentas-memoria.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

Em `tipos.ts`:

```ts
import type { ChatTool } from '@floow/core-finance'
import type { CanalDaMemoria } from '../memorias'

/** O que toda ferramenta recebe. Nunca a sessão: o WhatsApp (fase 3) não tem. */
export interface ContextoFerramenta {
  orgId: string
  userId: string
  canal: CanalDaMemoria
}

export interface Ferramenta {
  definicao: ChatTool
  /**
   * 'leitura' roda no servidor e o resultado volta ao Claude.
   * 'memoria' também roda no servidor: grava ou apaga só a memória do próprio
   * usuário, por isso sem confirmação.
   * 'sugestao' não roda: vira botão na web (fluxo antigo, até a fase 2).
   */
  tipo: 'leitura' | 'memoria' | 'sugestao'
  executar?: (ctx: ContextoFerramenta, params: unknown) => Promise<string>
}
```

(manter `ParametroInvalido` como está).

Em `agente.ts`: acrescentar `canal: CanalDaMemoria` em `EntradaDoAgente` (com `import type { CanalDaMemoria } from './memorias'`) e montar `const ctx: ContextoFerramenta = { orgId: e.orgId, userId: e.userId, canal: e.canal }`.

No route, na chamada de `responder`, acrescentar `canal: 'web',` depois de `userId,`.

```ts
// apps/web/lib/consultor/ferramentas/memoria.ts
import { z } from 'zod'
import { apagarMemoria, gravarMemoria } from '@/lib/consultor/memorias'
import { ParametroInvalido, type Ferramenta } from './tipos'
import { validar } from './utils'

/**
 * CPF, cartão, conta: 11 a 19 dígitos seguidos depois de tirar separadores.
 * Valores em reais ficam de fora porque a vírgula quebra a sequência.
 */
export function pareceSensivel(texto: string): boolean {
  return /\d{11,19}/.test(texto.replace(/[\s.\-/]/g, '')) || /senha/i.test(texto)
}

const ParamsLembrar = z.object({ fato: z.string().trim().min(1).max(300) })
const ParamsEsquecer = z.object({ id: z.string().uuid() })

export const lembrar: Ferramenta = {
  tipo: 'memoria',
  definicao: {
    name: 'lembrar',
    description:
      'Guarda um fato duradouro sobre o usuário: objetivo, preferência, restrição ou contexto de vida ' +
      '(ex.: "quer quitar o cartão até dezembro", "prefere respostas curtas"). ' +
      'Uma frase curta por fato. Nunca dado sensível nem números que estão nas contas.',
    inputSchema: {
      type: 'object',
      properties: { fato: { type: 'string', description: 'O fato, em uma frase (até 300 caracteres)' } },
      required: ['fato'],
    },
  },
  async executar(ctx, params) {
    const { fato } = validar(ParamsLembrar, params)
    if (pareceSensivel(fato)) {
      throw new ParametroInvalido('parece dado sensível (documento, cartão, conta ou senha); não grave isso')
    }
    await gravarMemoria({ orgId: ctx.orgId, userId: ctx.userId, canal: ctx.canal, conteudo: fato })
    return 'Anotado.'
  },
}

export const esquecer: Ferramenta = {
  tipo: 'memoria',
  definicao: {
    name: 'esquecer',
    description: 'Apaga uma memória pelo id mostrado em "O que você sabe sobre o usuário". Use quando o usuário pedir ou quando o fato mudou.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id da memória' } },
      required: ['id'],
    },
  },
  async executar(ctx, params) {
    const { id } = validar(ParamsEsquecer, params)
    if (!(await apagarMemoria(ctx.orgId, ctx.userId, id))) {
      throw new ParametroInvalido(`não existe memória com id ${id}`)
    }
    return 'Esquecido.'
  },
}
```

Em `ferramentas/index.ts`: `import { lembrar, esquecer } from './memoria'` e incluir `lembrar, esquecer,` na lista `FERRAMENTAS` antes de `...SUGESTOES`.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/consultor && pnpm typecheck`
Expected: PASS. Onde o typecheck apontar `ctx`/entrada sem `canal` nos testes existentes (`agente.test.ts`, testes de ferramentas), acrescentar `canal: 'web'` ao objeto — sem mudar asserções. Em `agente.test.ts`, o teste que confere `executar` chamado com `{ orgId: 'org-1', userId: 'u1' }` passa a esperar `{ orgId: 'org-1', userId: 'u1', canal: 'web' }`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/ferramentas/tipos.ts apps/web/lib/consultor/agente.ts apps/web/app/api/cfo/chat/route.ts apps/web/lib/consultor/ferramentas/memoria.ts apps/web/lib/consultor/ferramentas/index.ts apps/web/__tests__/consultor/ferramentas-memoria.test.ts
# mais os testes existentes que precisaram de `canal`, um a um
git commit -m "feat(consultor): ferramentas lembrar e esquecer"
```

---

### Task 3: Memórias no prompt

**Files:**
- Modify: `apps/web/lib/consultor/prompt.ts` (`DadosDoPrompt.memorias`, seção e regras)
- Modify: `apps/web/lib/consultor/prompt-dados.ts` (carrega `listarMemorias`)
- Modify: `apps/web/__tests__/consultor/prompt-e-historico.test.ts`

**Interfaces:**
- Consumes: Task 1 (`listarMemorias(orgId, userId)`).
- Produces: `DadosDoPrompt.memorias: { id: string; conteudo: string }[]`.

- [ ] **Step 1: Write the failing tests**

No `prompt-e-historico.test.ts`, acrescentar `memorias: []` ao objeto `dados` e, dentro de `describe('montarPrompt')`:

```ts
  it('lista as memórias com id e explica como usar lembrar/esquecer', () => {
    const p = montarPrompt({ ...dados, memorias: [{ id: 'abc', conteudo: 'quer quitar o cartão até dezembro' }] })
    expect(p).toContain('## O que você sabe sobre o usuário')
    expect(p).toContain('- [abc] quer quitar o cartão até dezembro')
  })

  it('sem memórias a seção diz que ainda não há nada', () => {
    expect(montarPrompt(dados)).toContain('## O que você sabe sobre o usuário\nnada ainda')
  })

  it('manda anotar sozinho e avisar', () => {
    const p = montarPrompt(dados)
    expect(p).toContain('chame `lembrar`')
    expect(p).toContain('Anotei:')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/consultor/prompt-e-historico.test.ts`
Expected: FAIL nos três testes novos.

- [ ] **Step 3: Implement**

Em `prompt.ts`:
- `DadosDoPrompt` ganha `memorias: { id: string; conteudo: string }[]`.
- Acrescentar ao fim da lista "Regras:" de `BASE` (antes de "- Responda sempre em português brasileiro."):

```
- Quando o usuário revelar um objetivo, preferência, restrição ou contexto de vida duradouro, chame `lembrar` sozinho, sem perguntar, e diga na resposta "Anotei: <o fato>". Não anote o que já está na lista abaixo; se mudou, `esquecer` o antigo e `lembrar` o novo. Se ele pedir para esquecer algo, use `esquecer`.
- Nunca anote dado sensível (documento, cartão, conta, senha) nem números que estão nas contas.
- Use o que você sabe sobre o usuário para adaptar conselho e tom.
```

- Em `montarPrompt`, depois de `## Categorias`:

```ts
    `## O que você sabe sobre o usuário\n${d.memorias.map((m) => `- [${m.id}] ${m.conteudo}`).join('\n') || 'nada ainda'}`,
```

Em `prompt-dados.ts`: acrescentar `listarMemorias(orgId, userId)` ao `Promise.all` (import de `./memorias`) e devolver `memorias: memorias.map((m) => ({ id: m.id, conteudo: m.conteudo }))`.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/consultor && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/prompt.ts apps/web/lib/consultor/prompt-dados.ts apps/web/__tests__/consultor/prompt-e-historico.test.ts
git commit -m "feat(consultor): memórias no prompt"
```

---

### Task 4: Lista "O que o consultor sabe sobre você" no /cfo

**Files:**
- Create: `apps/web/lib/consultor/memorias-actions.ts` (server action)
- Create: `apps/web/components/cfo/memorias-do-consultor.tsx`
- Modify: `apps/web/app/(app)/cfo/page.tsx` (carrega memórias)
- Modify: `apps/web/app/(app)/cfo/client.tsx` (renderiza a lista abaixo do chat)
- Test: `apps/web/__tests__/cfo/memorias-do-consultor.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`listarMemorias`, `apagarMemoria`); `requireIdentity` de `@/lib/auth/session`; `getOrgId` de `@/lib/finance/queries`.
- Produces: `apagarMemoriaAction(id: string): Promise<void>`; `<MemoriasDoConsultor memorias={{ id: string; conteudo: string; createdAt: string }[]} />`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/cfo/memorias-do-consultor.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/consultor/memorias-actions', () => ({ apagarMemoriaAction: vi.fn(async () => {}) }))

import { apagarMemoriaAction } from '@/lib/consultor/memorias-actions'
import { MemoriasDoConsultor } from '@/components/cfo/memorias-do-consultor'

const memorias = [
  { id: 'm1', conteudo: 'quer quitar o cartão até dezembro', createdAt: '2026-09-20T12:00:00.000Z' },
  { id: 'm2', conteudo: 'prefere respostas curtas', createdAt: '2026-09-21T12:00:00.000Z' },
]

describe('MemoriasDoConsultor', () => {
  it('fechada mostra só o título com a contagem', () => {
    render(<MemoriasDoConsultor memorias={memorias} />)
    expect(screen.getByRole('button', { name: /O que o consultor sabe sobre você \(2\)/ })).toBeTruthy()
    expect(screen.queryByText('prefere respostas curtas')).toBeNull()
  })

  it('aberta lista e apaga pela action, tirando da tela', async () => {
    render(<MemoriasDoConsultor memorias={memorias} />)
    fireEvent.click(screen.getByRole('button', { name: /O que o consultor sabe sobre você/ }))
    expect(screen.getByText('quer quitar o cartão até dezembro')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Apagar' })[1])
    await waitFor(() => expect(apagarMemoriaAction).toHaveBeenCalledWith('m2'))
    await waitFor(() => expect(screen.queryByText('prefere respostas curtas')).toBeNull())
  })

  it('sem memórias explica o que é', () => {
    render(<MemoriasDoConsultor memorias={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /O que o consultor sabe sobre você/ }))
    expect(screen.getByText(/Conforme você conversa/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/cfo/memorias-do-consultor.test.tsx`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/consultor/memorias-actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { requireIdentity } from '@/lib/auth/session'
import { getOrgId } from '@/lib/finance/queries'
import { apagarMemoria } from './memorias'

/** Apaga só se a memória for do usuário nesta org (filtro + RLS). */
export async function apagarMemoriaAction(id: string): Promise<void> {
  const { userId } = await requireIdentity()
  const orgId = await getOrgId()
  await apagarMemoria(orgId, userId, id)
  revalidatePath('/cfo')
}
```

```tsx
// apps/web/components/cfo/memorias-do-consultor.tsx
'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { apagarMemoriaAction } from '@/lib/consultor/memorias-actions'

interface MemoriaNaTela {
  id: string
  conteudo: string
  createdAt: string
}

export function MemoriasDoConsultor({ memorias }: { memorias: MemoriaNaTela[] }) {
  const [aberta, setAberta] = useState(false)
  const [lista, setLista] = useState(memorias)
  const [, startTransition] = useTransition()

  function apagar(id: string) {
    setLista((atual) => atual.filter((m) => m.id !== id))
    startTransition(() => apagarMemoriaAction(id))
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
      >
        {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        O que o consultor sabe sobre você ({lista.length})
      </button>
      {aberta && (
        <div className="border-t px-4 py-3">
          {lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Conforme você conversa, o consultor anota seus objetivos, preferências e restrições para aconselhar do seu jeito.
            </p>
          ) : (
            <ul className="space-y-2">
              {lista.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p>{m.conteudo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Apagar"
                    onClick={() => apagar(m.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

Em `page.tsx`, `CfoContent` passa a carregar as memórias:

```tsx
import { requireIdentity } from '@/lib/auth/session'
import { listarMemorias } from '@/lib/consultor/memorias'
// ...
async function CfoContent({ orgId }: { orgId: string }) {
  const { userId } = await requireIdentity()
  const [insights, latestRun, memorias] = await Promise.all([
    getActiveInsights(orgId),
    getLatestRun(orgId),
    listarMemorias(orgId, userId),
  ])
```

e passa `memorias={memorias.map((m) => ({ id: m.id, conteudo: m.conteudo, createdAt: m.createdAt.toISOString() }))}` ao `CfoClient`.

Em `client.tsx`: `CfoClientProps` ganha `memorias: { id: string; conteudo: string; createdAt: string }[]`; importar `MemoriasDoConsultor`; dentro da seção do chat, logo depois de `<ChatPanel />`, renderizar `<div className="mt-4"><MemoriasDoConsultor memorias={memorias} /></div>`.

Se `lucide-react` não for a biblioteca de ícones do projeto, usar a que `components/cfo/*` já usa.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/cfo __tests__/consultor && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/consultor/memorias-actions.ts apps/web/components/cfo/memorias-do-consultor.tsx "apps/web/app/(app)/cfo/page.tsx" "apps/web/app/(app)/cfo/client.tsx" apps/web/__tests__/cfo/memorias-do-consultor.test.tsx
git commit -m "feat(consultor): lista das memórias no /cfo"
```

---

### Task 5: Verificação e entrega (controlador)

- [ ] **Step 1:** Suite inteira e typecheck: `cd apps/web && pnpm vitest run && pnpm typecheck`; `cd packages/core-finance && pnpm vitest run`.
- [ ] **Step 2:** Build: `cd apps/web && pnpm build`.
- [ ] **Step 3: Banco real com rollback.** Script descartável (fora do repo) que, numa transação com `ROLLBACK` no fim, usando o `DATABASE_URL` de `apps/web/.env.local`: `withRls` como um usuário real → `gravarMemoria` 2x, `listarMemorias` vê as 2; `withRls` como outro usuário → vê 0 e `apagarMemoria` devolve false; insert direto com 301 caracteres → erro do CHECK.
- [ ] **Step 4:** Merge em `master`, push, e teste manual em produção: "quero quitar o cartão até dezembro" → resposta com "Anotei"; nova conversa → consultor usa; apagar pela lista → some.
