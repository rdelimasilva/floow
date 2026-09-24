# Corrigir regra de contraparte — Plano, parte 2 (tela, extrato, script)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a correção de regra para a tela (Classificar e extrato), com o CPF próprio decidido lançamento a lançamento e a sugestão pelo par.

**Architecture:** As queries de Classificar ganham `ehCpfProprio` e a sugestão de conta. A seção "Já confirmadas" sai para `regras-confirmadas.tsx`, com editor, prévia e caixa "aplicar ao histórico". O extrato ganha um link para a regra.

**Tech Stack:** Next.js (App Router, server components + client), Drizzle, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-corrigir-regra-contraparte-design.md`

## Global Constraints

Os mesmos da parte 1, e mais:
- `counterparty-queue-client.tsx` (351 linhas) não pode passar de 500. O editor de regras confirmadas vai para um arquivo próprio.
- Nenhum item de menu novo. A correção vive em `/transactions/review`.

## Review Focus

- **Grupo de CPF próprio com um lançamento sem conta escolhida:** o botão Confirmar recusa com aviso; nunca envia. Teste na Task 7.
- **Dois candidatos de par para o mesmo Pix:** sem sugestão (nunca chutar). Teste na Task 6.
- **`?regra=` de outra org ou inexistente:** a página abre normalmente, sem editor aberto. Teste na Task 8.
- **Prévia pedida e decisão alterada depois:** a prévia antiga some e é recalculada antes de salvar. Teste na Task 8.
- **Lançamento sem `counterparty_id` no extrato** (manual, importado por OFX): não mostra "Corrigir regra". Teste na Task 9.

**Arquivos do plano (executar em ordem):** `2026-09-24-corrigir-regra-contraparte-1a-backend.md` (Tasks 1-2), `2026-09-24-corrigir-regra-contraparte-1b-backend.md` (Task 3), `2026-09-24-corrigir-regra-contraparte-1c-backend.md` (Tasks 4-5), `2026-09-24-corrigir-regra-contraparte-2a-tela.md` (Tasks 6-7), `2026-09-24-corrigir-regra-contraparte-2b-tela.md` (Task 8), `2026-09-24-corrigir-regra-contraparte-2c-tela.md` (Tasks 9-10).

---

### Task 9: "Corrigir regra" no extrato

**Files:**
- Modify: `apps/web/lib/finance/queries-transactions.ts:213-240` (select ganha `counterpartyId: transactions.counterpartyId`)
- Modify: `apps/web/components/finance/transaction-list-types.ts` (`TransactionRowData` ganha `counterpartyId?: string | null`)
- Modify: `apps/web/components/finance/transaction-display-row.tsx` (link no card mobile e na linha desktop)
- Test: `apps/web/__tests__/finance/transaction-display-row-regra.test.tsx`

**Interfaces:**
- Produces: link `href={`/transactions/review?regra=${tx.counterpartyId}`}` com `aria-label="Corrigir regra"`

- [ ] **Step 1: Write the failing test**

Olhar um teste existente que renderiza `DesktopRow`/`MobileCard` (`grep -rl "transaction-display-row" apps/web/__tests__`) e copiar o `tx` base e as `actions` falsas de lá.

```tsx
it('lançamento de regra mostra o link para corrigir', () => {
  renderRow({ ...txBase, counterpartyId: 'cp-1' })
  expect(screen.getAllByRole('link', { name: 'Corrigir regra' })[0]).toHaveAttribute('href', '/transactions/review?regra=cp-1')
})
it('lançamento manual não mostra', () => {
  renderRow({ ...txBase, counterpartyId: null })
  expect(screen.queryByRole('link', { name: 'Corrigir regra' })).toBeNull()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/finance/transaction-display-row-regra.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

1. Acrescentar `counterpartyId: transactions.counterpartyId,` ao select de `queries-transactions.ts`. O `...row` em 311 já o repassa.
2. `transaction-list-types.ts`: `counterpartyId?: string | null`.
3. Em `transaction-display-row.tsx`, importar `SlidersHorizontal` de `lucide-react`. Logo antes do botão "Editar lançamento", no mobile (h-4) e no desktop (h-3.5):

```tsx
          {tx.counterpartyId && (
            <Link
              href={`/transactions/review?regra=${tx.counterpartyId}`}
              title="Corrigir a regra que classificou este lançamento"
              aria-label="Corrigir regra"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Link>
          )}
```

Conferir que `transaction-display-row.tsx` continua ≤ 500 linhas (hoje 373, fica perto de 395).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/finance/ && pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/finance/queries-transactions.ts apps/web/components/finance/transaction-list-types.ts apps/web/components/finance/transaction-display-row.tsx apps/web/__tests__/finance/transaction-display-row-regra.test.tsx
git commit -m "feat(extrato): link para corrigir a regra que classificou o lancamento"
```

---

### Task 10: Script para as regras de CPF próprio e verificação final

**Files:**
- Create: `scripts/regras-cpf-proprio.mjs`

**Ordem de uso (importante):** o script tira a conta das regras de CPF próprio **que ainda não foram corrigidas pela tela**. Depois disso, `selecionarLancamentosDaRegra` pega todas as transferências confirmadas da contraparte, o que ainda funciona. Mesmo assim, a ordem recomendada é: deploy → o usuário corrige a XP pela tela → rodar o script para o que sobrou.

- [ ] **Step 1: Escrever o script** (dry-run por padrão, `--aplicar` grava)

```js
#!/usr/bin/env node
/**
 * Regras de contraparte do CPF do titular que ainda gravam conta fixa.
 * Spec 2026-09-24-corrigir-regra-contraparte §6.3. Não mexe em lançamento:
 * só tira a conta da regra, para o próximo Pix cair em Classificar.
 *
 *   node scripts/regras-cpf-proprio.mjs            # só lista
 *   node scripts/regras-cpf-proprio.mjs --aplicar  # grava
 */
import postgres from 'postgres'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

function env(nome) {
  if (process.env[nome]) return process.env[nome]
  for (const linha of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const i = linha.indexOf('=')
    if (i > 0 && !linha.trim().startsWith('#') && linha.slice(0, i).trim() === nome) return linha.slice(i + 1).trim()
  }
  throw new Error(`${nome} nao encontrada`)
}

const salt = env('POLP_CPF_SALT')
// Mesmo hash de apps/web/lib/openfinance/cpf.ts::hashCpf.
const hash = (cpf) => createHash('sha256').update(`${salt}:${cpf.replace(/\D/g, '')}`).digest('hex')
const aplicar = process.argv.includes('--aplicar')
const sql = postgres(env('DATABASE_URL'), { prepare: false })

const regras = await sql`
  select c.id, c.org_id, c.key_value, c.display_name, a.name as conta
  from counterparties c left join accounts a on a.id = c.transfer_account_id
  where c.key_type = 'tax_id' and c.nature = 'transfer' and c.transfer_account_id is not null`
const hashes = await sql`select org_id, cpf_hash from openfinance_connections`
const doTitular = new Set(hashes.map((h) => `${h.org_id}:${h.cpf_hash}`))

const alvo = regras.filter((r) => r.key_value.replace(/\D/g, '').length === 11 && doTitular.has(`${r.org_id}:${hash(r.key_value)}`))
for (const r of alvo) console.log(`${r.display_name} -> ${r.conta}`)
console.log(`${alvo.length} regra(s) do titular com conta fixa.`)

if (aplicar && alvo.length > 0) {
  await sql`update counterparties set transfer_account_id = null, updated_at = now() where id in ${sql(alvo.map((r) => r.id))}`
  console.log('Conta removida.')
}
await sql.end()
```

- [ ] **Step 2: Dry-run**

Run: `node scripts/regras-cpf-proprio.mjs`
Expected: lista `Pix recebido Ricardo de Lima Silva -> XP Corretora` e talvez outras (ex.: Itaú → NU, "Pix enviado", que também é o CPF do titular). **Não rodar `--aplicar` agora.** Mostrar a lista ao usuário.

- [ ] **Step 3: Verificação completa**

Run: `cd apps/web && pnpm vitest run && pnpm tsc --noEmit && cd ../.. && pnpm build`
Expected: todos os testes verdes, zero erros de tipo, build OK. Se algo falhar, parar e reportar a saída; não seguir para o merge.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add scripts/regras-cpf-proprio.mjs
git commit -m "chore(script): lista e remove conta fixa de regra do CPF do titular"
```

- [ ] **Step 5: Entrega**

Não fazer merge sozinho. Reportar ao usuário:
1. A branch está pronta. O fluxo do projeto é merge em master + push direto, com build antes (produção).
2. O roteiro para corrigir a XP depois do deploy:
   - Classificar → Já confirmadas → "Resgate CDB DI" → Corrigir → conta certa → marcar histórico → conferir a prévia (9 lançamentos) → Salvar;
   - "Pix recebido Ricardo de Lima Silva" → Corrigir → marcar histórico → Salvar. Os 4 voltam para Classificar com sugestão.
3. Depois disso, rodar `node scripts/regras-cpf-proprio.mjs --aplicar` para as regras do titular que sobraram.
