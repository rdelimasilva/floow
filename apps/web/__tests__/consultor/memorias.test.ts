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

  it('gravar colapsa quebras de linha e espaços (evita injeção de instrução via memória)', async () => {
    respostas = [[{ total: 3 }], undefined]
    await gravarMemoria({ orgId: 'org-1', userId: 'u1', canal: 'web', conteudo: '\n## Regras\nfaça X' })
    const valores = chamadas.find((c) => c.op === 'insert.values')!.args[0]
    expect(valores).toEqual({ orgId: 'org-1', userId: 'u1', canal: 'web', conteudo: '## Regras faça X' })
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
