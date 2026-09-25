import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { consultaDaPagina } from '@/lib/finance/queries-transactions'

/**
 * A listagem pede 50 linhas, mas o `count(*) over ()` obriga o Postgres a
 * montar o resultado inteiro antes do LIMIT. Com as subconsultas por linha
 * (saldo corrido, bem vinculado, proposta de conciliacao) no mesmo SELECT,
 * elas rodavam para TODOS os lancamentos da org — e o saldo corrido soma
 * todos os anteriores, entao o custo crescia com o quadrado do historico.
 * Em producao: 150–470ms de media, pico de 1,2s.
 *
 * O desenho que este teste prende: a pagina (filtro, ordem, contagem, corte)
 * sai numa subconsulta barata, e as subconsultas caras ficam do lado de fora,
 * rodando so para as linhas que sobraram.
 */

const db = drizzle.mock()

function sqlDa(opts: Parameters<typeof consultaDaPagina>[2] = {}) {
  return consultaDaPagina(db, 'org-1', { limit: 50, offset: 100, ...opts }).toSQL().sql.toLowerCase()
}

/** O trecho da subconsulta da pagina: de `(select` ate `) "pagina"`. */
function subconsultaDaPagina(gerado: string): string {
  const fim = gerado.indexOf(') "pagina"')
  expect(fim).toBeGreaterThan(-1)
  const inicio = gerado.lastIndexOf('(select', gerado.lastIndexOf('count(*) over ()', fim))
  return gerado.slice(inicio, fim)
}

describe('consulta da pagina de lancamentos', () => {
  it('conta e corta a pagina dentro da subconsulta', () => {
    const pagina = subconsultaDaPagina(sqlDa())
    expect(pagina).toContain('count(*) over ()')
    expect(pagina).toContain('limit')
    expect(pagina).toContain('offset')
  })

  it('deixa as subconsultas por linha fora da pagina', () => {
    const gerado = sqlDa()
    const pagina = subconsultaDaPagina(gerado)
    expect(pagina).not.toContain('tx_saldo')
    expect(pagina).not.toContain('fixed_assets')
    expect(pagina).not.toContain('forecast_match_proposals')
    // ...mas elas continuam na consulta
    expect(gerado).toContain('tx_saldo')
    expect(gerado).toContain('fixed_assets')
    expect(gerado).toContain('forecast_match_proposals')
  })

  it('nao corta de novo do lado de fora', () => {
    const gerado = sqlDa()
    const fora = gerado.slice(gerado.indexOf(') "pagina"'))
    expect(fora).not.toMatch(/\blimit\b/)
    expect(fora).not.toMatch(/\boffset\b/)
  })

  it('ordena por categoria dentro da pagina quando pedido', () => {
    const pagina = subconsultaDaPagina(sqlDa({ sortBy: 'categoryName', sortDir: 'desc' }))
    expect(pagina).toContain('order by "categories"."name" desc')
  })
})
