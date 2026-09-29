import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Cinco rotinas casavam lançamentos, cada uma com sua regra, e o terceiro
 * caminho de duplicata em duas semanas nasceu disso. Agora quem grava chama
 * o motor (`conciliacao/conciliar-conta.ts`); só ele chama as regras.
 * Uma revisão humana não pega o sexto caminho; o CI pega.
 */
const LIB = join(__dirname, '..', '..', 'lib')
const PERMITIDOS = new Set([
  'finance/forecast-match-db.ts',
  'finance/duplicata-db.ts',
  'finance/conciliacao/conciliar-conta.ts',
])

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e)
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(e) ? [full] : []
  })
}

describe('um lugar só decide', () => {
  it('ninguém fora do motor chama criarPropostasDeConciliacao/criarPropostasDeDuplicata', () => {
    const infratores = walk(LIB)
      .map((f) => relative(LIB, f).split(sep).join('/'))
      .filter((rel) => !PERMITIDOS.has(rel))
      .filter((rel) => /criarPropostasDe(Conciliacao|Duplicata)\s*\(/.test(readFileSync(join(LIB, rel), 'utf8')))
    expect(infratores).toEqual([])
  })
})
