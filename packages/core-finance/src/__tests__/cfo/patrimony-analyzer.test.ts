import { describe, it, expect } from 'vitest'
import { analyzePatrimony } from '../../cfo/analyzers/patrimony'
import type { PatrimonyAnalyzerInput } from '../../cfo/types'

describe('analyzePatrimony', () => {
  it('returns empty when no snapshots', () => {
    expect(analyzePatrimony({ snapshots: [], fixedAssets: [] })).toEqual([])
  })

  it('returns positive when milestone is reached (R$100k)', () => {
    const input: PatrimonyAnalyzerInput = {
      snapshots: [
        { month: '2026-03', netWorth: 10500000, liquidAssets: 8000000 },
        { month: '2026-02', netWorth: 9800000, liquidAssets: 7500000 },
      ],
      fixedAssets: [],
    }
    const found = analyzePatrimony(input).find((r) => r.type === 'patrimony_milestone')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('positive')
  })

  it('detects net worth decrease', () => {
    const input: PatrimonyAnalyzerInput = {
      snapshots: [
        { month: '2026-03', netWorth: 8000000, liquidAssets: 6000000 },
        { month: '2026-02', netWorth: 9000000, liquidAssets: 7000000 },
      ],
      fixedAssets: [],
    }
    expect(analyzePatrimony(input).find((r) => r.type === 'patrimony_decreased')).toBeDefined()
  })
})
