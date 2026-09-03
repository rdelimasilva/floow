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

function escapeRef(ref: string): string {
  return ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Linhas `('REF', ...` de VALUES — o seed que garante que o ref existe. */
function insertsOf(ref: string): number {
  return migrationsSql.match(new RegExp(`\\('${escapeRef(ref)}',`, 'g'))?.length ?? 0
}

/**
 * `SET polp_ref = 'REF'` — o alias que reaproveita uma categoria existente.
 * O `SET` importa: sem ele, o `polp_ref = 'INCOME'` que resolve o pai numa
 * subconsulta contaria como se fosse mais um seed da raiz.
 */
function aliasesOf(ref: string): number {
  return migrationsSql.match(new RegExp(`SET polp_ref = '${escapeRef(ref)}'`, 'g'))?.length ?? 0
}

const aliasedNodes = [
  ...POLP_TAXONOMY.filter((r) => r.floowAlias).map((r) => ({ ref: r.ref, name: r.floowAlias! })),
  ...POLP_TAXONOMY.flatMap((r) =>
    r.children.filter((c) => c.floowAlias).map((c) => ({ ref: c.ref, name: c.floowAlias! })),
  ),
]

describe('seed da taxonomia da Polp', () => {
  it('garante uma linha de criação para cada ref da taxonomia', () => {
    // O INSERT é a rede: mesmo que o alias não case — porque a categoria foi
    // renomeada ou excluída pela interface —, o ref passa a existir.
    const errados = allRefs()
      .map((ref) => ({ ref, n: insertsOf(ref) }))
      .filter(({ n }) => n !== 1)

    expect(errados, 'refs sem seed ou semeados duas vezes').toEqual([])
  })

  it('só tenta reaproveitar as categorias que o floow já tinha', () => {
    const comAlias = new Set(aliasedNodes.map((n) => n.ref))

    const inesperados = allRefs()
      .filter((ref) => !comAlias.has(ref))
      .map((ref) => ({ ref, n: aliasesOf(ref) }))
      .filter(({ n }) => n !== 0)

    expect(inesperados, 'ref sem floowAlias não deveria ter UPDATE de alias').toEqual([])

    for (const { ref } of aliasedNodes) {
      expect(aliasesOf(ref), `${ref} deveria ter exatamente um alias`).toBe(1)
    }
  })

  it('casa o alias pelo nome da categoria de sistema correspondente', () => {
    // O alias é um UPDATE na linha que já existe. Um INSERT com o mesmo nome
    // criaria a segunda "Salário" que este mecanismo existe para evitar.
    for (const { ref, name } of aliasedNodes) {
      const stmt = migrationsSql.match(new RegExp(`UPDATE[^;]*?SET polp_ref = '${escapeRef(ref)}'[^;]*;`))
      expect(stmt, `alias de ${ref} não encontrado como UPDATE nas migrations`).not.toBeNull()
      expect(stmt![0], `${ref} deveria reaproveitar a categoria "${name}"`).toContain(`'${name}'`)
      expect(stmt![0], `${ref} deveria casar por nome`).toMatch(/name (=|IN)/)
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
