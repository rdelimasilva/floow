import { describe, it, expect, vi } from 'vitest'
import { zipSync } from 'fflate'
import { rodarCvmCotas } from '@/lib/mercado/jobs/cvm-cotas'
import { rodarCvmExtrato } from '@/lib/mercado/jobs/cvm-extrato'
import { repoMemoria } from './repo-memoria'

const latin1 = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))

const CAB = 'TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST'
const linha = (cnpj: string, data: string) => `CLASSES - FIF;${cnpj};;${data};1;45.36;1228659.83;0;0;1`
const zipInforme = (...ls: string[]) => zipSync({ 'inf.csv': latin1([CAB, ...ls].join('\n')) })

const DO_UNIVERSO = '00.017.024/0001-53'
const OUTRO = '99.999.999/0001-99'
const CNPJS = new Set(['00017024000153'])

function fetchDe(rotas: Record<string, Uint8Array | string>) {
  return vi.fn(async (url: string) => {
    const chave = Object.keys(rotas).find((k) => url.endsWith(k))
    if (!chave) return new Response('não achou', { status: 404 })
    const corpo = rotas[chave]
    return new Response((typeof corpo === "string" ? latin1(corpo) : corpo) as BodyInit, { status: 200 })
  })
}

describe('rodarCvmCotas', () => {
  it('no começo do mês baixa também o mês anterior', async () => {
    const { repo } = repoMemoria()
    const fetch = fetchDe({ '202611.zip': zipInforme(), '202610.zip': zipInforme() })
    await rodarCvmCotas({ fetch: fetch as never, repo, hoje: new Date('2026-11-03T12:00:00Z'), cnpjs: CNPJS })
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202611.zip',
      'https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202610.zip',
    ])
  })

  it('no meio do mês, só o mês corrente', async () => {
    const { repo } = repoMemoria()
    const fetch = fetchDe({ '202611.zip': zipInforme() })
    await rodarCvmCotas({ fetch: fetch as never, repo, hoje: new Date('2026-11-20T12:00:00Z'), cnpjs: CNPJS })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('carga inicial escolhe os meses', async () => {
    const { repo } = repoMemoria()
    const fetch = fetchDe({ '202601.zip': zipInforme() })
    await rodarCvmCotas({ fetch: fetch as never, repo, hoje: new Date('2026-11-03T12:00:00Z'), cnpjs: CNPJS, meses: ['202601'] })
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202601.zip'])
  })

  it('universo vazio não baixa nada', async () => {
    const { repo } = repoMemoria()
    const fetch = fetchDe({})
    expect(await rodarCvmCotas({ fetch: fetch as never, repo, hoje: new Date('2026-11-20T12:00:00Z'), cnpjs: new Set() })).toEqual({
      linhas: 0, invalidas: 0, total: 0, naoEncontrados: 0,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('grava só os fundos do universo e conta quem não apareceu', async () => {
    const { repo, tabelas } = repoMemoria()
    const fetch = fetchDe({ '202611.zip': zipInforme(linha(DO_UNIVERSO, '2026-11-18'), linha(OUTRO, '2026-11-18')) })
    const r = await rodarCvmCotas({
      fetch: fetch as never, repo, hoje: new Date('2026-11-20T12:00:00Z'), cnpjs: new Set(['00017024000153', '11111111000111']),
    })
    expect(r).toEqual({ linhas: 1, invalidas: 0, total: 1, naoEncontrados: 1 })
    expect([...tabelas.cotas.keys()]).toEqual(['00017024000153|2026-11-18'])
  })

  it('cota publicada sob o CNPJ da classe é gravada sob o CNPJ da carteira', async () => {
    const { repo, tabelas } = repoMemoria()
    await repo.gravarFundos([{ cnpj: '11111111000111', cnpjClasse: '00017024000153', nome: 'F', classeAnbima: null, taxaAdm: null, taxaPerformance: null, diasConversaoResgate: null, diasPagamentoResgate: null, dataReferencia: '2026-01-01' }])
    const fetch = fetchDe({ '202611.zip': zipInforme(linha(DO_UNIVERSO, '2026-11-18')) })
    await rodarCvmCotas({ fetch: fetch as never, repo, hoje: new Date('2026-11-20T12:00:00Z'), cnpjs: new Set(['11111111000111']) })
    expect([...tabelas.cotas.keys()]).toEqual(['11111111000111|2026-11-18'])
  })

  it('a subclasse escolhida é a mesma em todos os dias do fundo', async () => {
    const { repo, tabelas } = repoMemoria()
    const fetch = fetchDe({
      '202611.zip': zipInforme(
        // Dia 17 a RBMFN1 tem mais patrimônio; no dia 18 (último), a MZMRC1.
        `CLASSES - FIF;${DO_UNIVERSO};RBMFN1;2026-11-17;1;1.13;900;0;0;1`,
        `CLASSES - FIF;${DO_UNIVERSO};MZMRC1;2026-11-17;1;0.81;800;0;0;1`,
        `CLASSES - FIF;${DO_UNIVERSO};RBMFN1;2026-11-18;1;1.14;700;0;0;1`,
        `CLASSES - FIF;${DO_UNIVERSO};MZMRC1;2026-11-18;1;0.82;850;0;0;1`,
      ),
    })
    await rodarCvmCotas({ fetch: fetch as never, repo, hoje: new Date('2026-11-20T12:00:00Z'), cnpjs: CNPJS })
    const gravadas = [...tabelas.cotas.values()] as { subclasse: string; cota: number }[]
    expect(gravadas.map((c) => c.subclasse)).toEqual(['MZMRC1', 'MZMRC1'])
    expect(gravadas.map((c) => c.cota)).toEqual([0.81, 0.82])
  })

  it('com várias subclasses no mesmo dia, fica a de maior patrimônio (uma linha por chave)', async () => {
    const { repo, tabelas } = repoMemoria()
    const gravadas: unknown[][] = []
    const gravar = repo.gravarCotas
    repo.gravarCotas = async (l) => (gravadas.push(l), gravar(l))
    const fetch = fetchDe({
      '202611.zip': zipInforme(
        `CLASSES - FIF;${DO_UNIVERSO};RBMFN1;2026-11-18;1;74.38;47091275.92;0;0;1`,
        `CLASSES - FIF;${DO_UNIVERSO};MZMRC1;2026-11-18;1;74.04;700168039.98;0;0;1`,
      ),
    })
    await rodarCvmCotas({ fetch: fetch as never, repo, hoje: new Date('2026-11-20T12:00:00Z'), cnpjs: CNPJS })
    expect(gravadas[0]).toHaveLength(1)
    expect(tabelas.cotas.get('00017024000153|2026-11-18')).toMatchObject({ cota: 74.04 })
  })

  it('zip do mês que ainda não existe (404) não derruba quando o outro mês veio', async () => {
    const { repo } = repoMemoria()
    const fetch = fetchDe({ '202610.zip': zipInforme(linha(DO_UNIVERSO, '2026-10-31')) })
    const r = await rodarCvmCotas({ fetch: fetch as never, repo, hoje: new Date('2026-11-01T12:00:00Z'), cnpjs: CNPJS })
    expect(r.linhas).toBe(1)
  })
})

const CAB_EXT = 'TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;DENOM_SOCIAL;DT_COMPTC;CLASSE_ANBIMA;TAXA_ADM;TAXA_PERFM;QT_DIA_CONVERSAO_COTA;QT_DIA_PAGTO_RESGATE'
const CAB_CAD = 'TP_FUNDO;CNPJ_FUNDO;DENOM_SOCIAL;SIT;DT_INI_SIT;CLASSE_ANBIMA;TAXA_PERFM;TAXA_ADM'

describe('rodarCvmExtrato', () => {
  it('quem não está no extrato vem do cadastro; quem não está em nenhum é contado', async () => {
    const { repo, tabelas } = repoMemoria()
    const fetch = fetchDe({
      'extrato_fi_2026.csv': [CAB_EXT, `CLASSES - FIF;${DO_UNIVERSO};FUNDO DI;2026-07-07;Renda Fixa;0.3;;0;1`].join('\n'),
      'cad_fi.csv': [CAB_CAD, 'FI;11.111.111/0001-11;FUNDO VELHO;EM FUNCIONAMENTO NORMAL;2020-01-02;Renda Fixa;;1.5'].join('\n'),
    })
    const r = await rodarCvmExtrato({
      fetch: fetch as never, repo, hoje: new Date('2026-11-09T12:00:00Z'),
      cnpjs: new Set(['00017024000153', '11111111000111', '22222222000122']),
    })
    expect(r).toEqual({ linhas: 2, invalidas: 0, total: 2, naoEncontrados: 1 })
    expect([...tabelas.fundos.keys()].sort()).toEqual(['00017024000153', '11111111000111'])
  })

  it('todos no extrato: nem baixa o cadastro', async () => {
    const { repo } = repoMemoria()
    const fetch = fetchDe({ 'extrato_fi_2026.csv': [CAB_EXT, `CLASSES - FIF;${DO_UNIVERSO};FUNDO DI;2026-07-07;Renda Fixa;0.3;;0;1`].join('\n') })
    await rodarCvmExtrato({ fetch: fetch as never, repo, hoje: new Date('2026-11-09T12:00:00Z'), cnpjs: CNPJS })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
