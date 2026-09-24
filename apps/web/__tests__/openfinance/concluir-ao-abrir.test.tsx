import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useConcluirAoAbrir } from '@/app/(app)/accounts/connect/concluir-ao-abrir'

describe('useConcluirAoAbrir', () => {
  it('conclui cada conexão pendente uma vez, ao abrir a tela', () => {
    const concluir = vi.fn()
    const { rerender } = renderHook(({ ids }) => useConcluirAoAbrir(ids, concluir), {
      initialProps: { ids: ['c1', 'c2'] },
    })
    expect(concluir.mock.calls).toEqual([['c1'], ['c2']])
    rerender({ ids: ['c1', 'c2'] })
    expect(concluir).toHaveBeenCalledTimes(2)
  })

  it('conexão que aparece depois (criada pelo wizard nesta tela) fica com o wizard', () => {
    const concluir = vi.fn()
    const { rerender } = renderHook(({ ids }) => useConcluirAoAbrir(ids, concluir), {
      initialProps: { ids: [] as string[] },
    })
    rerender({ ids: ['nova'] })
    expect(concluir).not.toHaveBeenCalled()
  })
})
