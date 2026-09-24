import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: h.revalidateTag }))

import { invalidateTag } from '@/lib/cache-tags'

describe('invalidateTag', () => {
  it('expira a tag na hora, sem stale-while-revalidate', () => {
    invalidateTag('transactions:org-1')

    // Com perfil SWR ('default', 'max') o Next serve o dado velho na próxima
    // leitura e não devolve o RSC novo na resposta da Server Action — a tela
    // precisava de um router.refresh() extra para ver a própria edição.
    expect(h.revalidateTag).toHaveBeenCalledWith('transactions:org-1', { expire: 0 })
  })
})
