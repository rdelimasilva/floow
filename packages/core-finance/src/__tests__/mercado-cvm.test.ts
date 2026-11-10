import { describe, it, expect } from 'vitest'
import { linhaDoInforme, parseExtrato, parseCadastro, taxaPlausivel } from '../mercado/cvm'

const CAB_INFORME = 'TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST'.split(';')
const LINHA = 'CLASSES - FIF;00.017.024/0001-53;;2026-11-03;1131424.27;45.360755300000;1228659.83;0.00;0.00;1'

const CAB_EXTRATO = 'TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;DENOM_SOCIAL;DT_COMPTC;CLASSE_ANBIMA;TAXA_ADM;TAXA_PERFM;QT_DIA_CONVERSAO_COTA;QT_DIA_PAGTO_RESGATE'
const ext = (dt: string, taxa: string) => `CLASSES - FIF;00.083.181/0001-67;OPP I FIF EM AÇÕES;${dt};AÇÕES - INVESTIMENTO NO EXTERIOR;${taxa};;0;2`

const CAB_CAD = 'TP_FUNDO;CNPJ_FUNDO;DENOM_SOCIAL;SIT;DT_INI_SIT;CLASSE_ANBIMA;TAXA_PERFM;TAXA_ADM'

describe('linhaDoInforme', () => {
  const cnpjs = new Set(['00017024000153'])

  it('lê a cota de um fundo do universo', () => {
    expect(linhaDoInforme(CAB_INFORME, LINHA, cnpjs)).toEqual({
      cnpj: '00017024000153', data: '2026-11-03', cota: 45.3607553, patrimonio: 1228659.83, subclasse: '',
    })
  })

  it('guarda a subclasse da linha', () => {
    const c = linhaDoInforme(CAB_INFORME, LINHA.replace(';;2026-11-03', ';RBMFN1;2026-11-03'), cnpjs)
    expect(c).toMatchObject({ subclasse: 'RBMFN1' })
  })

  it('fundo fora do universo nem é validado', () => {
    expect(linhaDoInforme(CAB_INFORME, LINHA, new Set(['11111111111111']))).toBe('fora')
  })

  it('cota vazia é linha inválida', () => {
    expect(linhaDoInforme(CAB_INFORME, LINHA.replace('45.360755300000', ''), cnpjs)).toBe('invalida')
  })
})

describe('parseExtrato', () => {
  const cnpjs = new Set(['00083181000167'])

  it('fica com o extrato mais recente do fundo', () => {
    const csv = [CAB_EXTRATO, ext('2026-02-26', '262600.000000'), ext('2026-07-07', '2.000000')].join('\n')
    const r = parseExtrato(csv, cnpjs)
    expect(r.fundos).toHaveLength(1)
    expect(r.fundos[0]).toMatchObject({
      cnpj: '00083181000167', dataReferencia: '2026-07-07', taxaAdm: 2,
      diasConversaoResgate: 0, diasPagamentoResgate: 2, classeAnbima: 'AÇÕES - INVESTIMENTO NO EXTERIOR', taxaPerformance: null,
    })
  })

  it('taxa absurda vira null', () => {
    const r = parseExtrato([CAB_EXTRATO, ext('2026-02-26', '262600.000000')].join('\n'), cnpjs)
    expect(r.fundos[0].taxaAdm).toBeNull()
  })

  it('taxa de performance de 20% é comum e fica', () => {
    const linha = ext('2026-07-07', '2').replace(';;0;2', ';20.000000;0;2')
    expect(parseExtrato([CAB_EXTRATO, linha].join('\n'), cnpjs).fundos[0].taxaPerformance).toBe(20)
  })

  it('ignora fundo fora do universo', () => {
    expect(parseExtrato([CAB_EXTRATO, ext('2026-07-07', '2')].join('\n'), new Set()).fundos).toEqual([])
  })
})

describe('parseCadastro', () => {
  it('pula fundo cancelado e lê a taxa do ativo', () => {
    const csv = [
      CAB_CAD,
      'FI;00.083.181/0001-67;FUNDO VIVO;EM FUNCIONAMENTO NORMAL;2020-01-02;Renda Fixa;;0.5',
      'FI;11.111.111/0001-11;FUNDO MORTO;CANCELADA;2019-05-05;Renda Fixa;;1',
    ].join('\n')
    const r = parseCadastro(csv, new Set(['00083181000167', '11111111000111']))
    expect(r.fundos).toEqual([
      expect.objectContaining({ cnpj: '00083181000167', nome: 'FUNDO VIVO', taxaAdm: 0.5, dataReferencia: '2020-01-02', diasConversaoResgate: null, diasPagamentoResgate: null }),
    ])
  })
})

describe('taxaPlausivel', () => {
  it('aceita 0 a 10% e recusa o resto', () => {
    expect(taxaPlausivel(0)).toBe(0)
    expect(taxaPlausivel(10)).toBe(10)
    expect(taxaPlausivel(10.01)).toBeNull()
    expect(taxaPlausivel(-1)).toBeNull()
    expect(taxaPlausivel(null)).toBeNull()
  })
})
