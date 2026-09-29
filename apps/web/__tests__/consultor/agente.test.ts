import { describe, it, expect, vi } from 'vitest'
import type { ChatMessage, ToolCall } from '@floow/core-finance'
import { responder, MAX_RODADAS, PRAZO_MS, TEXTO_SEM_CONCLUSAO, type DepsDoAgente } from '@/lib/consultor/agente'
import { ParametroInvalido, type Ferramenta } from '@/lib/consultor/ferramentas/tipos'

type Rodada = { texto?: string; calls?: ToolCall[] }

function providerFalso(rodadas: Rodada[]) {
  const recebidas: ChatMessage[][] = []
  const streamChat = vi.fn(async (msgs: ChatMessage[], opts: { onChunk: (c: { type: 'text'; text: string }) => void }) => {
    recebidas.push(structuredClone(msgs))
    const r = rodadas.shift() ?? { texto: 'fim' }
    if (r.texto) opts.onChunk({ type: 'text', text: r.texto })
    return { content: r.texto ?? '', toolCalls: r.calls ?? [] }
  })
  return { streamChat, recebidas }
}

const leitura = (executar: Ferramenta['executar']): Ferramenta => ({
  tipo: 'leitura', executar,
  definicao: { name: 'saldos_das_contas', description: 'x', inputSchema: { type: 'object', properties: {} } },
})
const sugestao: Ferramenta = { tipo: 'sugestao', definicao: { name: 'create_budget', description: 'x', inputSchema: { type: 'object' } } }
const memoria = (executar: Ferramenta['executar']): Ferramenta => ({
  tipo: 'memoria', executar,
  definicao: { name: 'lembrar', description: 'x', inputSchema: { type: 'object', properties: {} } },
})

function deps(provider: ReturnType<typeof providerFalso>, ferramentas: Ferramenta[] = [], over: Partial<DepsDoAgente> = {}): DepsDoAgente {
  return { provider, ferramentas, consumirLimite: vi.fn(async () => ({ allowed: true as const })), log: vi.fn(), ...over }
}
const entrada = { orgId: 'org-1', userId: 'u1', canal: 'web' as const, historico: [] as ChatMessage[], mensagem: 'quanto tenho?', system: 'sys' }
const call = (name = 'saldos_das_contas', id = 't1'): ToolCall => ({ id, name, params: {} })

describe('responder', () => {
  it('sem ferramenta: uma chamada e devolve o texto', async () => {
    const p = providerFalso([{ texto: 'Oi!' }])
    const r = await responder(entrada, deps(p))
    expect(r).toEqual({ tipo: 'ok', texto: 'Oi!', sugestoes: [] })
    expect(p.streamChat).toHaveBeenCalledTimes(1)
    expect(p.recebidas[0].at(-1)).toMatchObject({ role: 'user', content: 'quanto tenho?' })
  })

  it('ferramenta de leitura: executa com a org do contexto e devolve o resultado ao Claude', async () => {
    const executar = vi.fn(async () => 'Total: R$ 10')
    const p = providerFalso([{ calls: [call()] }, { texto: 'Você tem R$ 10.' }])
    const r = await responder(entrada, deps(p, [leitura(executar)]))
    expect(executar).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'u1', canal: 'web' }, {})
    const segunda = p.recebidas[1]
    expect(segunda.at(-2)).toMatchObject({ role: 'assistant', toolCalls: [call()] })
    expect(segunda.at(-1)).toMatchObject({ role: 'tool_result', toolResults: [{ toolUseId: 't1', content: 'Total: R$ 10' }] })
    expect(r).toMatchObject({ tipo: 'ok', texto: 'Você tem R$ 10.' })
  })

  it('ferramenta que quebra: tool_result com erro genérico, log, e o laço segue', async () => {
    const log = vi.fn()
    const p = providerFalso([{ calls: [call()] }, { texto: 'Não consegui ver agora.' }])
    await responder(entrada, deps(p, [leitura(async () => { throw new Error('db caiu') })], { log }))
    const bloco = p.recebidas[1].at(-1)!.toolResults![0]
    expect(bloco.isError).toBe(true)
    expect(bloco.content).not.toContain('db caiu')
    expect(log).toHaveBeenCalled()
  })

  it('parâmetro inválido volta ao Claude com a explicação', async () => {
    const p = providerFalso([{ calls: [call()] }, { texto: 'ok' }])
    await responder(entrada, deps(p, [leitura(async () => { throw new ParametroInvalido('mes: use o formato YYYY-MM') })]))
    const bloco = p.recebidas[1].at(-1)!.toolResults![0]
    expect(bloco).toMatchObject({ isError: true })
    expect(bloco.content).toContain('mes: use o formato YYYY-MM')
  })

  it('ferramenta desconhecida vira erro para o Claude', async () => {
    const p = providerFalso([{ calls: [call('apagar_tudo')] }, { texto: 'ok' }])
    await responder(entrada, deps(p))
    expect(p.recebidas[1].at(-1)!.toolResults![0]).toMatchObject({ isError: true })
  })

  it('sugestão não executa: vai para o cliente e o Claude sabe que não foi feita', async () => {
    const onSugestao = vi.fn()
    const c = call('create_budget')
    const p = providerFalso([{ texto: 'Sugiro um teto.', calls: [c] }, { texto: 'Clique para criar.' }])
    const r = await responder({ ...entrada, onSugestao }, deps(p, [sugestao]))
    expect(onSugestao).toHaveBeenCalledWith(c)
    expect(r).toMatchObject({ tipo: 'ok', sugestoes: [c] })
    expect(p.recebidas[1].at(-1)!.toolResults![0].content).toContain('Não diga que já foi feito')
  })

  it('ferramenta de memória: executa direto (não vira sugestão)', async () => {
    const executar = vi.fn(async () => 'Anotado.')
    const onSugestao = vi.fn()
    const c = call('lembrar')
    const p = providerFalso([{ calls: [c] }, { texto: 'Anotei: prefere respostas curtas.' }])
    const r = await responder({ ...entrada, onSugestao }, deps(p, [memoria(executar)]))
    expect(executar).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'u1', canal: 'web' }, {})
    expect(onSugestao).not.toHaveBeenCalled()
    expect(p.recebidas[1].at(-1)!.toolResults![0]).toMatchObject({ toolUseId: 't1', content: 'Anotado.' })
    expect(r).toMatchObject({ tipo: 'ok', sugestoes: [] })
  })

  it('texto de rodadas diferentes sai separado por linha em branco, também no streaming', async () => {
    const pedacos: string[] = []
    const p = providerFalso([{ texto: 'Vou olhar.', calls: [call()] }, { texto: 'Pronto.' }])
    const r = await responder({ ...entrada, onTexto: (t) => pedacos.push(t) }, deps(p, [leitura(async () => 'x')]))
    expect(r).toMatchObject({ texto: 'Vou olhar.\n\nPronto.' })
    expect(pedacos.join('')).toBe('Vou olhar.\n\nPronto.')
  })

  it('estouro de rodadas: para em MAX_RODADAS e avisa, mantendo o texto já escrito', async () => {
    const pedacos: string[] = []
    const rodadas = Array.from({ length: 10 }, (_, i) => ({ texto: i === 0 ? 'Analisando.' : undefined, calls: [call('saldos_das_contas', `t${i}`)] }))
    const p = providerFalso(rodadas)
    const r = await responder({ ...entrada, onTexto: (t) => pedacos.push(t) }, deps(p, [leitura(async () => 'x')]))
    expect(p.streamChat).toHaveBeenCalledTimes(MAX_RODADAS)
    expect(r).toMatchObject({ tipo: 'ok', texto: `Analisando.\n\n${TEXTO_SEM_CONCLUSAO}` })
    expect(pedacos.join('')).toBe(`Analisando.\n\n${TEXTO_SEM_CONCLUSAO}`)
  })

  it('prazo total: se já estourou o tempo, para antes da próxima rodada e avisa', async () => {
    const pedacos: string[] = []
    const rodadas = Array.from({ length: 10 }, (_, i) => ({ calls: [call('saldos_das_contas', `t${i}`)] }))
    const p = providerFalso(rodadas)
    let leituras = 0
    const agoraFalso = () => (leituras++ === 0 ? 0 : PRAZO_MS)
    const r = await responder(
      { ...entrada, onTexto: (t) => pedacos.push(t) },
      deps(p, [leitura(async () => 'x')], { agora: agoraFalso }),
    )
    expect(p.streamChat).toHaveBeenCalledTimes(1)
    expect(r.texto.endsWith(TEXTO_SEM_CONCLUSAO)).toBe(true)
  })

  it('resposta final vazia: emite o aviso em vez de devolver bolha vazia', async () => {
    const p = providerFalso([{ texto: '', calls: [] }])
    const onTexto = vi.fn()
    const r = await responder({ ...entrada, onTexto }, deps(p))
    expect(r).toMatchObject({ tipo: 'ok', texto: TEXTO_SEM_CONCLUSAO })
    expect(onTexto).toHaveBeenCalledWith(TEXTO_SEM_CONCLUSAO)
  })

  it('prazoMs customizado (WhatsApp): usa o valor de deps em vez do padrão', async () => {
    const rodadas = Array.from({ length: 10 }, (_, i) => ({ calls: [call('saldos_das_contas', `t${i}`)] }))
    const p = providerFalso(rodadas)
    let leituras = 0
    const agoraFalso = () => (leituras++ === 0 ? 0 : 1000)
    const r = await responder(
      entrada,
      deps(p, [leitura(async () => 'x')], { agora: agoraFalso, prazoMs: 1000 }),
    )
    expect(p.streamChat).toHaveBeenCalledTimes(1)
    expect(r.texto.endsWith(TEXTO_SEM_CONCLUSAO)).toBe(true)
  })

  it('limite estourado: não chama o Claude', async () => {
    const p = providerFalso([])
    const r = await responder(entrada, deps(p, [], { consumirLimite: vi.fn(async () => ({ allowed: false as const, retryAfterSeconds: 42 })) }))
    expect(r).toEqual({ tipo: 'limite', retryAfterSeconds: 42, texto: 'Limite de uso do consultor atingido. Tente de novo em 42s.' })
    expect(p.streamChat).not.toHaveBeenCalled()
  })
})
