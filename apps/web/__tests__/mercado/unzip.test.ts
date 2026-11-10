import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { linhasDoZip } from '@/lib/mercado/unzip'

const latin1 = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))

function emPedacos(bytes: Uint8Array, tamanho: number): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close()
      c.enqueue(bytes.slice(i, i + tamanho))
      i += tamanho
    },
  })
}

describe('linhasDoZip', () => {
  it('entrega linha a linha, em latin-1, mesmo com o zip chegando em pedaços', async () => {
    const zip = zipSync({ 'inf.csv': latin1('CAB;X\r\nAÇÕES;1\nRENDA FIXA;2\n') })
    const linhas: string[] = []
    await linhasDoZip(emPedacos(zip, 7), (l) => linhas.push(l))
    expect(linhas).toEqual(['CAB;X', 'AÇÕES;1', 'RENDA FIXA;2'])
  })

  it('última linha sem quebra no fim também chega', async () => {
    const linhas: string[] = []
    await linhasDoZip(emPedacos(zipSync({ 'a.csv': latin1('A\nB') }), 3), (l) => linhas.push(l))
    expect(linhas).toEqual(['A', 'B'])
  })
})
