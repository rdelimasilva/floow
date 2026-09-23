import { describe, it, expect } from 'vitest'
import { planejarHierarquia } from '@/lib/finance/category-hierarchy'

/**
 * Renomear uma categoria-mãe de sistema não pode soltar as filhas dela.
 *
 * Renomear categoria de sistema faz copy-on-write: a org ganha uma cópia e a
 * original fica escondida para ela. As filhas, porém, continuavam com
 * `parentId` na original escondida — a árvore não achava a mãe, tratava cada
 * filha como raiz e, na ordem alfabética, ela caía recuada debaixo de OUTRA
 * mãe. Para o usuário, "mudou a categoria mãe sozinho". O rollup de orçamento
 * por raiz perdia as filhas do mesmo jeito.
 *
 * O plano diz o que fazer com cada filha órfã: a da org é reapontada para a
 * cópia; a de sistema ganha a sua cópia da org, já pendurada na mãe nova (não
 * dá para mexer na linha de sistema — é de todas as orgs).
 */

const ORG = 'org-1'

const alimentacaoSistema = { id: 'sys-food', orgId: null, parentId: null, polpRef: 'FOOD_AND_DRINK' }
const mercadoSistema = { id: 'sys-groceries', orgId: null, parentId: 'sys-food', polpRef: 'FOOD_AND_DRINK_GROCERIES' }
const restauranteSistema = { id: 'sys-rest', orgId: null, parentId: 'sys-food', polpRef: 'FOOD_AND_DRINK_RESTAURANT' }
const copiaDaMae = { id: 'org-comida', orgId: ORG, parentId: null, polpRef: 'FOOD_AND_DRINK' }

describe('filhas da mãe renomeada', () => {
  it('filha de sistema ganha cópia da org pendurada na mãe nova', () => {
    const plano = planejarHierarquia({
      orgId: ORG,
      visiveis: [copiaDaMae, mercadoSistema, restauranteSistema],
      escondidas: [alimentacaoSistema],
    })
    expect(plano.reapontar).toEqual([])
    expect(plano.copiar).toEqual([
      { categoriaId: 'sys-groceries', parentId: 'org-comida' },
      { categoriaId: 'sys-rest', parentId: 'org-comida' },
    ])
  })

  it('filha que já é da org só é reapontada', () => {
    const mercadoDaOrg = { ...mercadoSistema, id: 'org-mercado', orgId: ORG }
    const plano = planejarHierarquia({
      orgId: ORG,
      visiveis: [copiaDaMae, mercadoDaOrg],
      escondidas: [alimentacaoSistema, mercadoSistema],
    })
    expect(plano.reapontar).toEqual([{ categoriaId: 'org-mercado', parentId: 'org-comida' }])
    expect(plano.copiar).toEqual([])
  })

  it('na hora do rename, a cópia recém-criada é informada direto, mesmo sem polpRef', () => {
    const maeSemPolp = { ...alimentacaoSistema, polpRef: null }
    const copiaSemPolp = { ...copiaDaMae, polpRef: null }
    const plano = planejarHierarquia({
      orgId: ORG,
      visiveis: [copiaSemPolp, mercadoSistema],
      escondidas: [maeSemPolp],
      copiasConhecidas: new Map([['sys-food', 'org-comida']]),
    })
    expect(plano.copiar).toEqual([{ categoriaId: 'sys-groceries', parentId: 'org-comida' }])
  })

  it('mãe apenas excluída (escondida sem cópia) não inventa mãe nova', () => {
    const plano = planejarHierarquia({
      orgId: ORG,
      visiveis: [mercadoSistema],
      escondidas: [alimentacaoSistema],
    })
    expect(plano).toEqual({ reapontar: [], copiar: [] })
  })

  it('árvore sã não gera nada', () => {
    const plano = planejarHierarquia({
      orgId: ORG,
      visiveis: [alimentacaoSistema, mercadoSistema],
      escondidas: [],
    })
    expect(plano).toEqual({ reapontar: [], copiar: [] })
  })

  it('cópia de outra org com o mesmo polpRef não conta', () => {
    const copiaDeOutraOrg = { ...copiaDaMae, orgId: 'org-2' }
    const plano = planejarHierarquia({
      orgId: ORG,
      visiveis: [copiaDeOutraOrg, mercadoSistema],
      escondidas: [alimentacaoSistema],
    })
    expect(plano).toEqual({ reapontar: [], copiar: [] })
  })
})
