import { describe, it, expect, vi } from 'vitest'
import { rodarBcb } from '@/lib/mercado/jobs/bcb'
import { repoMemoria } from './repo-memoria'

const SGS = [
  { data: '04/11/2026', valor: '0.050788' },
  { data: '05/11/2026', valor: '0.050788' },
]

const fetchFalso = () => vi.fn(async () => new Response(JSON.stringify(SGS), { status: 200 }))

describe('rodarBcb', () => {
  const hoje = new Date('2026-11-06T12:00:00Z')

  it('busca as três séries com a janela até hoje e grava', async () => {
    const { repo, tabelas } = repoMemoria()
    const fetch = fetchFalso()
    const r = await rodarBcb({ fetch: fetch as unknown as typeof globalThis.fetch, repo, hoje })
    expect(r).toEqual({ linhas: 6, invalidas: 0, total: 6 })
    expect(tabelas.indicadores.size).toBe(6)
    const urls = fetch.mock.calls.map((c) => String((c as unknown[])[0]))
    expect(urls.some((u) => u.includes('bcdata.sgs.12/'))).toBe(true)
    expect(urls.some((u) => u.includes('bcdata.sgs.11/'))).toBe(true)
    expect(urls.some((u) => u.includes('bcdata.sgs.433/'))).toBe(true)
    expect(urls.every((u) => u.includes('dataFinal=06/11/2026'))).toBe(true)
    expect(urls.find((u) => u.includes('sgs.12/'))).toContain('dataInicial=27/10/2026')
    expect(urls.find((u) => u.includes('sgs.433/'))).toContain('dataInicial=28/08/2026')
  })

  it('carga inicial pede uma janela maior', async () => {
    const { repo } = repoMemoria()
    const fetch = fetchFalso()
    await rodarBcb({ fetch: fetch as unknown as typeof globalThis.fetch, repo, hoje, janelaDias: 365 })
    expect(fetch.mock.calls.every((c) => String((c as unknown[])[0]).includes('dataInicial=06/11/2025'))).toBe(true)
  })

  it('rodar duas vezes não duplica', async () => {
    const { repo, tabelas } = repoMemoria()
    const fetch = fetchFalso() as unknown as typeof globalThis.fetch
    await rodarBcb({ fetch, repo, hoje })
    await rodarBcb({ fetch, repo, hoje })
    expect(tabelas.indicadores.size).toBe(6)
  })

  it('erro HTTP do BCB derruba o job', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => new Response('fora', { status: 503 })) as unknown as typeof globalThis.fetch
    await expect(rodarBcb({ fetch, repo, hoje })).rejects.toThrow(/503/)
  })
})
