import { describe, it, expect, vi, beforeEach } from 'vitest'

const capturar = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => capturar(...a) }))

const { executarJob } = await import('@/lib/mercado/execucao')
const { repoMemoria } = await import('./repo-memoria')

beforeEach(() => capturar.mockClear())

describe('executarJob', () => {
  it('registra a execução que deu certo', async () => {
    const { repo, execucoes } = repoMemoria()
    const r = await executarJob('bcb', repo, async () => ({ linhas: 6, invalidas: 0, total: 6 }))
    expect(r).toEqual({ ok: true, linhas: 6 })
    expect(execucoes).toEqual([expect.objectContaining({ job: 'bcb', ok: true, linhas: 6, erro: null })])
    expect(capturar).not.toHaveBeenCalled()
  })

  it('falha da fonte vira ok=false, vai ao Sentry e não lança', async () => {
    const { repo, execucoes } = repoMemoria()
    const r = await executarJob('cvm_cotas', repo, async () => {
      throw new Error('CVM fora do ar')
    })
    expect(r).toEqual({ ok: false, linhas: 0 })
    expect(execucoes[0]).toMatchObject({ job: 'cvm_cotas', ok: false, erro: 'CVM fora do ar' })
    expect(capturar).toHaveBeenCalledWith(
      'mercado: job cvm_cotas falhou',
      expect.objectContaining({ tags: { mercado: 'cvm_cotas' } }),
    )
  })

  it('mais de 5% de linhas inválidas é falha (o formato mudou)', async () => {
    const { repo, execucoes } = repoMemoria()
    const r = await executarJob('tesouro', repo, async () => ({ linhas: 94, invalidas: 6, total: 100 }))
    expect(r.ok).toBe(false)
    expect(execucoes[0].erro).toMatch(/6 de 100/)
  })

  it('5% exatos ainda passa', async () => {
    const { repo } = repoMemoria()
    expect((await executarJob('tesouro', repo, async () => ({ linhas: 95, invalidas: 5, total: 100 }))).ok).toBe(true)
  })

  it('universo vazio termina bem, com zero linhas', async () => {
    const { repo, execucoes } = repoMemoria()
    expect(await executarJob('b3', repo, async () => ({ linhas: 0, invalidas: 0, total: 0 }))).toEqual({ ok: true, linhas: 0 })
    expect(execucoes[0].ok).toBe(true)
  })
})
