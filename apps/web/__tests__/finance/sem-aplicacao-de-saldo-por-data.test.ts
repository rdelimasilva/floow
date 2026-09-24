import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Nada aplica PREVISÃO DE TEMPLATE no saldo por data.
 *
 * `reconcileRecurringBalances` era o passo que, ao chegar a data, somava
 * qualquer linha pendente em `accounts.balance_cents` e virava
 * `balance_applied = true` — sem distinguir previsão de template de
 * lançamento do banco. Esse `true` era também o que tirava a previsão da fila
 * de casamento, e por isso a conciliação só funcionava quando o extrato vinha
 * adiantado.
 *
 * O caso legítimo sobreviveu como `applyDueBankTransactions`, restrito a
 * `external_id IS NOT NULL AND recurring_template_id IS NULL` — ver
 * `aplicacao-por-data-so-do-banco.test.ts`, que prende esse filtro.
 *
 * Este teste guarda a outra metade: a função indiscriminada não voltou. Lê o
 * fonte em vez de invocar porque a garantia é a AUSÊNCIA do caminho — não há
 * função para chamar, e um `import` de algo inexistente quebraria a suíte
 * inteira em vez de falhar este caso.
 */

const raiz = join(__dirname, '..', '..')
const ler = (caminho: string) => {
  try {
    return readFileSync(join(raiz, caminho), 'utf8')
  } catch {
    return null
  }
}

describe('aplicação de saldo por data', () => {
  it('não existe mais reconcileRecurringBalances', () => {
    // A declaração, não a palavra: o comentário que ficou no lugar dela
    // explica por que o caminho foi removido, e precisa continuar lá.
    // Migrou de `lib/finance/actions.ts` para `transaction-actions.ts` quando
    // aquele arquivo foi dividido (500 linhas por arquivo, CLAUDE.md).
    expect(ler('lib/finance/transaction-actions.ts')).not.toContain(
      'function reconcileRecurringBalances',
    )
  })

  it('a rota e o provider indiscriminados sumiram', () => {
    expect(ler('app/api/reconcile/route.ts')).toBeNull()
    expect(ler('components/providers/reconcile-provider.tsx')).toBeNull()
    expect(ler('app/(app)/layout.tsx')).not.toContain('ReconcileProvider')
  })

  it('o gatilho que sobrou aponta para a aplicação restrita ao banco', () => {
    expect(ler('components/providers/apply-due-provider.tsx')).toContain('/api/apply-due')
    expect(ler('app/api/apply-due/route.ts')).toContain('applyDueBankTransactions')
    expect(ler('lib/finance/apply-due.ts')).toContain('recurringTemplateId')
    expect(ler('app/(app)/layout.tsx')).toContain('ApplyDueProvider')
  })
})
