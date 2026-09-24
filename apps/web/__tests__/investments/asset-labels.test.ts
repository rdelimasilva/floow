import { describe, it, expect } from 'vitest'
import { assetClassEnum, eventTypeEnum } from '@floow/db'
import { ASSET_CLASS_LABEL, EVENT_TYPE_LABEL, assetDisplayName } from '@/lib/investments/asset-labels'

describe('rótulos de investimento', () => {
  it('toda classe do enum tem rótulo', () => {
    for (const v of assetClassEnum.enumValues) expect(ASSET_CLASS_LABEL[v]).toBeTruthy()
  })
  it('todo tipo de evento do enum tem rótulo', () => {
    for (const v of eventTypeEnum.enumValues) expect(EVENT_TYPE_LABEL[v]).toBeTruthy()
  })
  it('sem ticker, exibe o nome', () => {
    expect(assetDisplayName({ ticker: null, name: 'CDB Banco X 2027' })).toBe('CDB Banco X 2027')
    expect(assetDisplayName({ ticker: 'PETR4', name: 'Petrobras' })).toBe('PETR4')
  })
})
