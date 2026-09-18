import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Registro da conversão para withUserDb().
 *
 * `getDb()` conecta como dono das tabelas e ignora todas as policies: o
 * isolamento entre orgs passa a depender de cada query lembrar do filtro
 * `org_id`. A conversão para `withUserDb()` põe o banco para barrar sozinho.
 *
 * São ~36 arquivos, convertidos aos poucos. Este teste é a catraca: PENDENTES
 * encolhe a cada commit, e um arquivo novo com getDb() que não esteja listado
 * quebra o CI. Sem isso a conversão andaria para trás sem ninguém notar.
 */

const WEB = join(__dirname, '..', '..')
const rel = (f: string) => relative(WEB, f).split(sep).join('/')

/**
 * Caminhos de serviço: rodam sem usuário na requisição, e acesso amplo é o
 * objetivo. Cada entrada precisa de um motivo — a lista aparece no diff.
 */
const SERVICO: Record<string, string> = {
  'app/api/cfo/run-daily/route.ts': 'cron: varre todas as orgs, sem usuário na requisição',
  'lib/cfo/engine.ts': 'só é chamado por run-daily e run-event, ambas autenticadas por segredo',
  'lib/audit/record.ts': 'audit_log não tem policy de INSERT por desenho — só o backend escreve',
}

/** Ainda não convertidos. Esta lista só pode encolher. */
const PENDENTES = [
  'app/api/cfo/chat/route.ts',
  'lib/auth/session.ts',
  'lib/cfo/actions.ts',
  'lib/cfo/budget-pacing-input.ts',
  'lib/cfo/chat-actions.ts',
  'lib/cfo/chat-context.ts',
  'lib/cfo/queries.ts',
  'lib/finance/actions.ts',
  'lib/finance/budget-actions.ts',
  'lib/finance/budget-daily-queries.ts',
  'lib/finance/budget-queries.ts',
  'lib/finance/cash-flow-actions.ts',
  'lib/finance/category-actions.ts',
  'lib/finance/debt-actions.ts',
  'lib/finance/import-actions.ts',
  'lib/finance/queries.ts',
  'lib/finance/recurring-actions.ts',
  'lib/fixed-assets/actions.ts',
  'lib/fixed-assets/queries.ts',
  'lib/investments/actions.ts',
  'lib/investments/position-snapshots.ts',
  'lib/investments/queries.ts',
  'lib/openfinance/backfill.ts',
  'lib/openfinance/connection-actions.ts',
  'lib/openfinance/counterparty-actions.ts',
  'lib/openfinance/resource-actions.ts',
  'lib/planning/actions.ts',
  'lib/planning/queries.ts',
]

function walk(dir: string): string[] {
  let out: string[] = []
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    if (statSync(full).isDirectory()) {
      if (e === 'node_modules' || e === '.next' || e === '__tests__') continue
      out = out.concat(walk(full))
    } else if (/\.tsx?$/.test(e)) out.push(full)
  }
  return out
}

/** Só chamadas de verdade — menção em comentário ou crase não conta. */
function chamaGetDb(src: string): boolean {
  return src.split('\n').some((linha) => {
    const t = linha.trim()
    if (t.startsWith('*') || t.startsWith('//') || t.includes('`')) return false
    return /\bgetDb\s*\(\s*\)/.test(linha)
  })
}

const usamGetDb = ['lib', 'app']
  .flatMap((d) => walk(join(WEB, d)))
  .filter((f) => chamaGetDb(readFileSync(f, 'utf8')))
  .map(rel)
  .sort()

describe('conversão para withUserDb', () => {
  it('nenhum arquivo fora do registro chama getDb()', () => {
    const permitidos = new Set([...Object.keys(SERVICO), ...PENDENTES])
    const foraDoRegistro = usamGetDb.filter((f) => !permitidos.has(f))

    expect(foraDoRegistro).toEqual([])
  })

  it('a lista de pendentes não guarda arquivo já convertido', () => {
    const aindaUsam = new Set(usamGetDb)
    const jaConvertidos = PENDENTES.filter((f) => !aindaUsam.has(f))

    expect(jaConvertidos).toEqual([])
  })

  it('a lista de serviço não guarda arquivo que já não usa getDb()', () => {
    const aindaUsam = new Set(usamGetDb)
    const obsoletos = Object.keys(SERVICO).filter((f) => !aindaUsam.has(f))

    expect(obsoletos).toEqual([])
  })
})
