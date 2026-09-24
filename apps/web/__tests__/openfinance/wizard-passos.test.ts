import { describe, it, expect } from 'vitest'
import {
  NOVA,
  contasCompativeis,
  erroDoPasso,
  escolhaInicial,
  montarDestinos,
  resumoDaConclusao,
  type EstadoDoWizard,
} from '@/app/(app)/accounts/connect/wizard-passos'

const CONTAS = [
  { id: 'cc', name: 'Corrente', type: 'checking' },
  { id: 'pp', name: 'Poupança', type: 'savings' },
  { id: 'cx', name: 'Carteira', type: 'cash' },
  { id: 'ca', name: 'Nubank', type: 'credit_card' },
  { id: 'br', name: 'Corretora', type: 'brokerage' },
]

const ESTADO: EstadoDoWizard = {
  products: ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'],
  destinoConta: 'cc',
  nomeConta: '',
  destinoCartao: NOVA,
  nomeCartao: '',
  institutionId: 'itau',
  cpf: '529.982.247-25',
}

describe('contasCompativeis', () => {
  it('conta corrente: corrente, poupança e dinheiro — nunca corretora nem cartão', () => {
    expect(contasCompativeis(CONTAS, 'ACCOUNT').map((c) => c.id)).toEqual(['cc', 'pp', 'cx'])
  })
  it('cartão: só cartão', () => {
    expect(contasCompativeis(CONTAS, 'CREDIT_CARD_ACCOUNT').map((c) => c.id)).toEqual(['ca'])
  })
})

describe('escolhaInicial', () => {
  it('sem conta compatível: já começa em criar nova', () => {
    expect(escolhaInicial([])).toBe(NOVA)
  })
  it('com contas: obriga a escolher (não chuta)', () => {
    expect(escolhaInicial([{ id: 'x' }])).toBe('')
  })
})

describe('erroDoPasso', () => {
  it('passo 1 pede ao menos um produto', () => {
    expect(erroDoPasso(1, { ...ESTADO, products: [] })).toMatch(/ao menos/i)
  })
  it('passo 1 pede destino da conta marcada', () => {
    expect(erroDoPasso(1, { ...ESTADO, destinoConta: '' })).toMatch(/conta corrente/i)
    expect(erroDoPasso(1, { ...ESTADO, destinoCartao: '' })).toMatch(/cartão/i)
  })
  it('passo 1 ignora destino de produto desmarcado', () => {
    expect(erroDoPasso(1, { ...ESTADO, products: ['INVESTMENTS'], destinoConta: '', destinoCartao: '' })).toBeNull()
  })
  it('passo 1 completo', () => {
    expect(erroDoPasso(1, ESTADO)).toBeNull()
  })
  it('passo 2 pede banco e CPF com 11 dígitos', () => {
    expect(erroDoPasso(2, { ...ESTADO, institutionId: '' })).toMatch(/banco/i)
    expect(erroDoPasso(2, { ...ESTADO, cpf: '123' })).toMatch(/CPF/)
    expect(erroDoPasso(2, ESTADO)).toBeNull()
  })
})

describe('montarDestinos', () => {
  it('existente vira id; nova vira nome (vazio = padrão no servidor)', () => {
    expect(montarDestinos({ ...ESTADO, nomeCartao: ' Meu cartão ' })).toEqual({
      conta: { kind: 'existing', accountId: 'cc' },
      cartao: { kind: 'new', name: 'Meu cartão' },
    })
  })
  it('produto desmarcado não leva destino', () => {
    expect(montarDestinos({ ...ESTADO, products: ['CREDIT_CARD_ACCOUNT'] })).toEqual({
      conta: null,
      cartao: { kind: 'new', name: '' },
    })
  })
})

const r = (extra: Record<string, unknown>) =>
  ({ etapa: 'concluida', vinculados: 0, ambiguos: [], faltando: [], importadas: null, erro: null, ...extra }) as never

describe('resumoDaConclusao', () => {
  it('tudo certo: diz quantas contas e quantos lançamentos', () => {
    const s = resumoDaConclusao(r({ vinculados: 2, importadas: 31 }))
    expect(s.texto).toBe('Pronto: 2 contas vinculadas e 31 lançamentos importados.')
    expect(s.pendencia).toBeNull()
  })
  it('singular', () => {
    expect(resumoDaConclusao(r({ vinculados: 1, importadas: 1 })).texto).toBe(
      'Pronto: 1 conta vinculada e 1 lançamento importado.',
    )
  })
  it('ambíguo manda escolher na tela da conexão', () => {
    expect(resumoDaConclusao(r({ ambiguos: ['ACCOUNT'] })).pendencia).toBe(
      'O banco trouxe mais de uma conta/cartão — escolha qual vai para onde.',
    )
  })
  it('faltando também aponta a tela', () => {
    expect(resumoDaConclusao(r({ faltando: ['CREDIT_CARD_ACCOUNT'] })).pendencia).toMatch(/cartão/)
  })
  it('aguardando contas: avisa que aplica sozinho quando chegarem', () => {
    expect(resumoDaConclusao(r({ etapa: 'aguardando-contas' })).texto).toMatch(/assim que chegarem/)
  })
  it('erro vai junto', () => {
    expect(resumoDaConclusao(r({ vinculados: 1, erro: 'Polp fora do ar' })).erro).toBe('Polp fora do ar')
  })
})
