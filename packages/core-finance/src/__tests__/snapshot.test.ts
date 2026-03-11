import { describe, it, expect } from 'vitest'
import { computeSnapshot } from '../snapshot'
import type { Account } from '@floow/db'

// Helper to create a minimal Account object for testing
function makeAccount(overrides: Partial<Account>): Account {
  return {
    id: 'acct-' + Math.random().toString(36).slice(2),
    orgId: 'org-test-123',
    name: 'Test Account',
    type: 'checking',
    balanceCents: 0,
    currency: 'BRL',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Account
}

const ORG_ID = 'org-test-123'

describe('computeSnapshot', () => {
  it('computes netWorthCents and liquidAssetsCents from two checking accounts', () => {
    const accts: Account[] = [
      makeAccount({ type: 'checking', balanceCents: 10000 }),
      makeAccount({ type: 'checking', balanceCents: 5000 }),
    ]

    const result = computeSnapshot(accts, ORG_ID)

    expect(result.netWorthCents).toBe(15000)
    expect(result.liquidAssetsCents).toBe(15000)
    expect(result.liabilitiesCents).toBe(0)
  })

  it('treats credit_card account as liability and reduces net worth', () => {
    const accts: Account[] = [
      makeAccount({ type: 'credit_card', balanceCents: -3000 }),
    ]

    const result = computeSnapshot(accts, ORG_ID)

    // credit_card is a liability — liabilities = 3000 (absolute), netWorth = 0 - 3000 = -3000
    expect(result.liabilitiesCents).toBe(3000)
    expect(result.liquidAssetsCents).toBe(0)
    expect(result.netWorthCents).toBe(-3000)
  })

  it('handles mixed accounts (checking + savings + credit_card)', () => {
    const accts: Account[] = [
      makeAccount({ type: 'checking', balanceCents: 10000 }),
      makeAccount({ type: 'savings', balanceCents: 20000 }),
      makeAccount({ type: 'credit_card', balanceCents: -5000 }),
    ]

    const result = computeSnapshot(accts, ORG_ID)

    expect(result.netWorthCents).toBe(25000)
    expect(result.liquidAssetsCents).toBe(30000)
    expect(result.liabilitiesCents).toBe(5000)
  })

  it('generates breakdown object with per-type totals', () => {
    const accts: Account[] = [
      makeAccount({ type: 'checking', balanceCents: 10000 }),
      makeAccount({ type: 'savings', balanceCents: 20000 }),
    ]

    const result = computeSnapshot(accts, ORG_ID)

    const breakdown = JSON.parse(result.breakdown as string)
    expect(breakdown.checking).toBe(10000)
    expect(breakdown.savings).toBe(20000)
  })

  it('returns all zeros when no active accounts', () => {
    const result = computeSnapshot([], ORG_ID)

    expect(result.netWorthCents).toBe(0)
    expect(result.liquidAssetsCents).toBe(0)
    expect(result.liabilitiesCents).toBe(0)

    const breakdown = JSON.parse(result.breakdown as string)
    expect(Object.keys(breakdown)).toHaveLength(0)
  })

  it('sets orgId and snapshotDate on result', () => {
    const before = new Date()
    const result = computeSnapshot([], ORG_ID)
    const after = new Date()

    expect(result.orgId).toBe(ORG_ID)
    // snapshotDate should be a Date within the test window
    const snapDate = result.snapshotDate as Date
    expect(snapDate.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    expect(snapDate.getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
  })
})
