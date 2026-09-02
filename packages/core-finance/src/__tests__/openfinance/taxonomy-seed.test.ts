import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { POLP_TAXONOMY, allRefs } from '../../openfinance/taxonomy'

/**
 * A taxonomia vive em dois lugares: `taxonomy.ts`, que a ingestão usa para
 * resolver `category_ref`, e as migrations, que materializam as categorias no
 * banco. Se os dois divergirem, a falha é silenciosa e cara: a transação chega
 * com um ref que não existe em `categories`, fica sem categoria, e some do
 * orçamento sem nenhum erro em lugar nenhum.
 *
 * Estes testes leem as migrations como texto e travam a correspondência. Não
 * olham só a 00028: qualquer migration futura que adicione refs novos serve,
 * porque migration aplicada não se edita.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../../supabase/migrations')

const migrationsSql = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  .join('\n')

/**
 * Uma linha `('REF', ...` de VALUES, ou um `SET polp_ref = 'REF'` de alias.
 * O `SET` importa: sem ele, o `polp_ref = 'INCOME'` que resolve o pai numa
 * subconsulta contaria como se fosse mais um seed da raiz.
 */
function assignmentsOf(ref: string): number {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const inserts = migrationsSql.match(new RegExp(`\\('${escaped}',`, 'g'))?.length ?? 0
  const aliases = migrationsSql.match(new RegExp(`SET polp_ref = '${escaped}'`, 'g'))?.length ?? 0
  return inserts + aliases
}

describe('seed da taxonomia da Polp', () => {
  it('atribui cada ref da taxonomia exatamente uma vez', () => {
    const errados = allRefs()
      .map((ref) => ({ ref, n: assignmentsOf(ref) }))
      .filter(({ n }) => n !== 1)

    expect(errados, 'refs sem seed ou semeados duas vezes').toEqual([])
  })

  it('mantém as categorias de sistema existentes, em vez de duplicá-las', () => {
    // O alias é um UPDATE na linha que já existe. Um INSERT com o mesmo nome
    // criaria a segunda "Salário" que este mecanismo existe para evitar.
    const aliases = [
      ...POLP_TAXONOMY.filter((r) => r.floowAlias).map((r) => ({ ref: r.ref, name: r.floowAlias! })),
      ...POLP_TAXONOMY.flatMap((r) =>
        r.children.filter((c) => c.floowAlias).map((c) => ({ ref: c.ref, name: c.floowAlias! })),
      ),
    ]

    expect(aliases.length).toBeGreaterThan(0)

    for (const { ref, name } of aliases) {
      // O statement inteiro, do UPDATE ao ponto e vírgula: é o `UPDATE` que
      // distingue reaproveitar a linha existente de inserir outra.
      const stmt = migrationsSql.match(new RegExp(`UPDATE[^;]*?SET polp_ref = '${ref}'[^;]*;`))
      expect(stmt, `alias de ${ref} não encontrado como UPDATE nas migrations`).not.toBeNull()
      expect(stmt![0], `${ref} deveria reaproveitar a categoria "${name}"`).toContain(`name = '${name}'`)
    }
  })

  it('trava a contagem que a migration confere no banco', () => {
    // A migration termina checando o total; se a taxonomia crescer e o seed não
    // acompanhar, é aqui que aparece — antes de rodar contra o banco.
    const total = allRefs().length
    const raizes = POLP_TAXONOMY.length

    expect(migrationsSql).toContain(`esperadas ${total} categorias com polp_ref`)
    expect(migrationsSql).toContain(`esperadas ${raizes} raizes sem parent_id`)
  })
})
