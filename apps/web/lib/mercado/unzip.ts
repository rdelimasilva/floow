import { Unzip, UnzipInflate } from 'fflate'

/**
 * Lê o primeiro arquivo de um zip e entrega linha a linha, sem juntar o
 * arquivo na memória. O informe diário da CVM tem centenas de milhares de
 * linhas e vem em latin-1.
 */
export async function linhasDoZip(corpo: ReadableStream<Uint8Array>, aoLer: (linha: string) => void): Promise<void> {
  const decoder = new TextDecoder('latin1')
  let resto = ''
  let erro: Error | null = null
  let fim = false
  let jaAbriu = false

  const entregar = (texto: string, final: boolean) => {
    const partes = (resto + texto).split('\n')
    resto = final ? '' : (partes.pop() ?? '')
    for (const p of partes) {
      const l = p.endsWith('\r') ? p.slice(0, -1) : p
      if (l) aoLer(l)
    }
  }

  const unzip = new Unzip((arquivo) => {
    if (jaAbriu) return
    jaAbriu = true
    arquivo.ondata = (e, dados, final) => {
      if (e) {
        erro = e
        return
      }
      entregar(decoder.decode(dados, { stream: !final }), final)
      if (final) fim = true
    }
    arquivo.start()
  })
  unzip.register(UnzipInflate)

  const leitor = corpo.getReader()
  for (;;) {
    const { done, value } = await leitor.read()
    if (erro) throw erro
    if (done) {
      unzip.push(new Uint8Array(0), true)
      break
    }
    unzip.push(value)
  }
  if (erro) throw erro
  if (!jaAbriu) throw new Error('zip vazio')
  if (!fim) throw new Error('zip terminou antes do fim do arquivo')
}
