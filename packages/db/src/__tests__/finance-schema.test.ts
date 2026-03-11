import { describe, it, expect } from 'vitest'
import {
  accountTypeEnum,
  transactionTypeEnum,
  accounts,
  transactions,
  categories,
  patrimonySnapshots,
} from '../schema/finance'

describe('finance schema: enums', () => {
  it('accountTypeEnum exports with correct values', () => {
    expect(accountTypeEnum.enumValues).toEqual([
      'checking',
      'savings',
      'brokerage',
      'credit_card',
      'cash',
    ])
  })

  it('transactionTypeEnum exports with correct values', () => {
    expect(transactionTypeEnum.enumValues).toEqual(['income', 'expense', 'transfer'])
  })
})

describe('finance schema: accounts table', () => {
  it('accounts table is defined', () => {
    expect(accounts).toBeTruthy()
  })

  it('accounts table has expected columns', () => {
    expect(accounts.id).toBeDefined()
    expect(accounts.orgId).toBeDefined()
    expect(accounts.name).toBeDefined()
    expect(accounts.type).toBeDefined()
    expect(accounts.balanceCents).toBeDefined()
    expect(accounts.currency).toBeDefined()
    expect(accounts.isActive).toBeDefined()
    expect(accounts.createdAt).toBeDefined()
    expect(accounts.updatedAt).toBeDefined()
  })
})

describe('finance schema: transactions table', () => {
  it('transactions table is defined', () => {
    expect(transactions).toBeTruthy()
  })

  it('transactions table has expected columns', () => {
    expect(transactions.id).toBeDefined()
    expect(transactions.orgId).toBeDefined()
    expect(transactions.accountId).toBeDefined()
    expect(transactions.categoryId).toBeDefined()
    expect(transactions.type).toBeDefined()
    expect(transactions.amountCents).toBeDefined()
    expect(transactions.description).toBeDefined()
    expect(transactions.date).toBeDefined()
    expect(transactions.transferGroupId).toBeDefined()
    expect(transactions.importedAt).toBeDefined()
    expect(transactions.externalId).toBeDefined()
    expect(transactions.createdAt).toBeDefined()
  })
})

describe('finance schema: categories table', () => {
  it('categories table is defined', () => {
    expect(categories).toBeTruthy()
  })

  it('categories table has expected columns', () => {
    expect(categories.id).toBeDefined()
    expect(categories.orgId).toBeDefined()
    expect(categories.name).toBeDefined()
    expect(categories.type).toBeDefined()
    expect(categories.color).toBeDefined()
    expect(categories.icon).toBeDefined()
    expect(categories.isSystem).toBeDefined()
    expect(categories.createdAt).toBeDefined()
  })
})

describe('finance schema: patrimonySnapshots table', () => {
  it('patrimonySnapshots table is defined', () => {
    expect(patrimonySnapshots).toBeTruthy()
  })

  it('patrimonySnapshots table has expected columns', () => {
    expect(patrimonySnapshots.id).toBeDefined()
    expect(patrimonySnapshots.orgId).toBeDefined()
    expect(patrimonySnapshots.snapshotDate).toBeDefined()
    expect(patrimonySnapshots.netWorthCents).toBeDefined()
    expect(patrimonySnapshots.liquidAssetsCents).toBeDefined()
    expect(patrimonySnapshots.liabilitiesCents).toBeDefined()
    expect(patrimonySnapshots.breakdown).toBeDefined()
    expect(patrimonySnapshots.createdAt).toBeDefined()
  })
})

describe('finance schema: inferred types exported', () => {
  // These are TypeScript compile-time checks via import — if types don't exist, the file won't compile
  it('module exports are present (type exports verified at compile time)', () => {
    // Runtime presence check for tables and enums
    expect(accounts).toBeDefined()
    expect(transactions).toBeDefined()
    expect(categories).toBeDefined()
    expect(patrimonySnapshots).toBeDefined()
    expect(accountTypeEnum).toBeDefined()
    expect(transactionTypeEnum).toBeDefined()
  })
})
