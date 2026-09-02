import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock @floow/db ────────────────────────────────────────────────────────────
const mockInsertValues = vi.fn()
const mockInsertReturning = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockCreateDb = vi.fn()
const mockGetDb = vi.fn()

// O mock precisa expor TODO símbolo que actions.ts importa de @floow/db — a
// resolução do módulo falha no import, antes de qualquer teste rodar, se faltar
// um. Foi assim que getDb (que substituiu createDb) derrubou este arquivo.
vi.mock('@floow/db', () => ({
  createDb: mockCreateDb,
  getDb: mockGetDb,
  accounts: { name: 'accounts' },
  transactions: { name: 'transactions' },
  categories: { name: 'categories' },
  patrimonySnapshots: { name: 'patrimony_snapshots' },
  categoryRules: { name: 'category_rules' },
  recurringTemplates: { name: 'recurring_templates' },
  budgetEntries: { name: 'budget_entries' },
  debts: { name: 'debts' },
}))

// ── Mock next/cache ───────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  // invalidateTag (lib/cache-tags.ts) chama revalidateTag; unstable_cache é
  // usado pelas queries. Ambos precisam existir aqui ou o import falha.
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

// ── Mock @/lib/supabase/server ────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockGetSession = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })),
}))

// ── Mock drizzle-orm sql ──────────────────────────────────────────────────────
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    sql: actual.sql,
    eq: actual.eq,
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupDbMock() {
  // Capture all insert calls
  const insertCalls: Array<{ table: unknown; values: unknown[] }> = []
  const updateCalls: Array<{ where: unknown; set: unknown }> = []

  mockInsertReturning.mockResolvedValue([{ id: 'tx-id-1' }])
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
  mockInsert.mockImplementation((table) => {
    return {
      values: (vals: unknown) => {
        insertCalls.push({ table, values: Array.isArray(vals) ? vals : [vals] })
        return { returning: mockInsertReturning }
      },
    }
  })

  mockUpdateWhere.mockResolvedValue({ rowsAffected: 1 })
  mockUpdateSet.mockImplementation((setClause) => {
    return {
      where: (whereClause: unknown) => {
        updateCalls.push({ set: setClause, where: whereClause })
        return mockUpdateWhere()
      },
    }
  })
  mockUpdate.mockImplementation(() => ({
    set: mockUpdateSet,
  }))

  // Mock select for assertAccountOwnership — returns a row so ownership check passes
  const mockSelect = vi.fn().mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ id: 'account-id' }]),
      }),
    }),
  })

  // Build tx object with same API as db (used inside db.transaction callback)
  const makeTx = () => ({ insert: mockInsert, update: mockUpdate, select: mockSelect })

  // db.transaction calls the callback with a tx that mirrors the db API
  const mockTransaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
    return fn(makeTx())
  })

  const db = { insert: mockInsert, update: mockUpdate, select: mockSelect, transaction: mockTransaction }
  mockCreateDb.mockReturnValue(db)
  mockGetDb.mockReturnValue(db)

  return { db, insertCalls, updateCalls }
}

/**
 * Monta um access_token no formato que getOrgId realmente lê.
 *
 * getOrgId (lib/finance/queries.ts) NÃO usa session.user.app_metadata — esse
 * objeto vem de auth.users.raw_app_meta_data, onde o custom_access_token_hook
 * não escreve. Ele decodifica o payload do JWT, que é o único lugar onde as
 * org_ids injetadas pelo hook existem. Só a parte do meio do token importa;
 * header e assinatura nunca são verificados na decodificação.
 */
function makeAccessToken(orgId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ app_metadata: { org_ids: [orgId] } }),
    'utf8',
  ).toString('base64url')
  return `header.${payload}.signature`
}

function setupUserMock(orgId = 'org-test-123') {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-test-id',
        app_metadata: { org_ids: [orgId] },
      },
    },
    error: null,
  })
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: makeAccessToken(orgId),
        user: { id: 'user-test-id' },
      },
    },
    error: null,
  })
}

const TEST_SOURCE_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const TEST_DEST_ACCOUNT_ID = '22222222-2222-2222-2222-222222222222'
const TEST_CATEGORY_ID = '33333333-3333-3333-3333-333333333333'

function buildFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v)
  }
  return fd
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupUserMock()
    setupDbMock()
    // Ensure DATABASE_URL env is set for the module
    process.env.DATABASE_URL = 'postgresql://test'
  })

  it('transfer: inserts exactly two transaction rows', async () => {
    const { createTransaction } = await import('@/lib/finance/actions')

    const formData = buildFormData({
      accountId: TEST_SOURCE_ACCOUNT_ID,
      type: 'transfer',
      amountCents: '5000',
      description: 'Transfer test',
      date: '2026-01-01',
      transferToAccountId: TEST_DEST_ACCOUNT_ID,
    })

    await createTransaction(formData)

    // db.insert(transactions) should be called twice
    const transactionInserts = mockInsert.mock.calls.filter(
      (call) => call[0]?.name === 'transactions'
    )
    expect(transactionInserts).toHaveLength(2)
  })

  it('transfer: both rows share the same non-null transferGroupId', async () => {
    const { createTransaction } = await import('@/lib/finance/actions')

    // Capture the values passed to insert
    const capturedValues: Array<Record<string, unknown>> = []
    mockInsert.mockImplementation((table) => ({
      values: (vals: Record<string, unknown>) => {
        if (table?.name === 'transactions') {
          capturedValues.push(vals)
        }
        return { returning: mockInsertReturning }
      },
    }))

    const formData = buildFormData({
      accountId: TEST_SOURCE_ACCOUNT_ID,
      type: 'transfer',
      amountCents: '5000',
      description: 'Transfer test',
      date: '2026-01-01',
      transferToAccountId: TEST_DEST_ACCOUNT_ID,
    })

    await createTransaction(formData)

    expect(capturedValues).toHaveLength(2)
    const [sourceRow, destRow] = capturedValues
    expect(sourceRow.transferGroupId).toBeTruthy()
    expect(destRow.transferGroupId).toBeTruthy()
    expect(sourceRow.transferGroupId).toBe(destRow.transferGroupId)
    // Validate UUID format
    expect(sourceRow.transferGroupId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('transfer: source row has negative amountCents, destination row has positive amountCents', async () => {
    const { createTransaction } = await import('@/lib/finance/actions')

    const capturedValues: Array<Record<string, unknown>> = []
    mockInsert.mockImplementation((table) => ({
      values: (vals: Record<string, unknown>) => {
        if (table?.name === 'transactions') {
          capturedValues.push(vals)
        }
        return { returning: mockInsertReturning }
      },
    }))

    const formData = buildFormData({
      accountId: TEST_SOURCE_ACCOUNT_ID,
      type: 'transfer',
      amountCents: '5000',
      description: 'Transfer test',
      date: '2026-01-01',
      transferToAccountId: TEST_DEST_ACCOUNT_ID,
    })

    await createTransaction(formData)

    expect(capturedValues).toHaveLength(2)
    const [sourceRow, destRow] = capturedValues
    expect(sourceRow.amountCents).toBe(-5000)
    expect(destRow.amountCents).toBe(5000)
  })

  it('transfer: source account balance decremented, destination account balance incremented', async () => {
    const { createTransaction } = await import('@/lib/finance/actions')

    const capturedUpdates: Array<Record<string, unknown>> = []
    mockUpdate.mockImplementation(() => ({
      set: (setClause: Record<string, unknown>) => {
        capturedUpdates.push(setClause)
        return {
          where: () => Promise.resolve({ rowsAffected: 1 }),
        }
      },
    }))

    const formData = buildFormData({
      accountId: TEST_SOURCE_ACCOUNT_ID,
      type: 'transfer',
      amountCents: '5000',
      description: 'Transfer test',
      date: '2026-01-01',
      transferToAccountId: TEST_DEST_ACCOUNT_ID,
    })

    await createTransaction(formData)

    // Two balance updates expected
    expect(capturedUpdates).toHaveLength(2)
    // Each update should have balanceCents set to an SQL expression (object, not a plain number)
    for (const update of capturedUpdates) {
      expect(update.balanceCents).toBeDefined()
      // The sql`` tagged template returns a SQL object, not a plain number
      expect(typeof update.balanceCents).not.toBe('number')
    }
  })

  it('income: inserts one row with positive amount and increments balance', async () => {
    const { createTransaction } = await import('@/lib/finance/actions')

    const capturedValues: Array<Record<string, unknown>> = []
    mockInsert.mockImplementation((table) => ({
      values: (vals: Record<string, unknown>) => {
        if (table?.name === 'transactions') {
          capturedValues.push(vals)
        }
        return { returning: mockInsertReturning }
      },
    }))

    const capturedUpdates: Array<Record<string, unknown>> = []
    mockUpdate.mockImplementation(() => ({
      set: (setClause: Record<string, unknown>) => {
        capturedUpdates.push(setClause)
        return { where: () => Promise.resolve({ rowsAffected: 1 }) }
      },
    }))

    const formData = buildFormData({
      accountId: TEST_SOURCE_ACCOUNT_ID,
      categoryId: TEST_CATEGORY_ID,
      type: 'income',
      amountCents: '10000',
      description: 'Salary',
      date: '2026-01-01',
    })

    await createTransaction(formData)

    // One insert
    expect(capturedValues).toHaveLength(1)
    expect(capturedValues[0].amountCents).toBe(10000) // positive
    expect(capturedValues[0].type).toBe('income')

    // One balance update
    expect(capturedUpdates).toHaveLength(1)
    expect(capturedUpdates[0].balanceCents).toBeDefined()
    expect(typeof capturedUpdates[0].balanceCents).not.toBe('number')
  })

  it('expense: inserts one row with negative amount and decrements balance', async () => {
    const { createTransaction } = await import('@/lib/finance/actions')

    const capturedValues: Array<Record<string, unknown>> = []
    mockInsert.mockImplementation((table) => ({
      values: (vals: Record<string, unknown>) => {
        if (table?.name === 'transactions') {
          capturedValues.push(vals)
        }
        return { returning: mockInsertReturning }
      },
    }))

    const capturedUpdates: Array<Record<string, unknown>> = []
    mockUpdate.mockImplementation(() => ({
      set: (setClause: Record<string, unknown>) => {
        capturedUpdates.push(setClause)
        return { where: () => Promise.resolve({ rowsAffected: 1 }) }
      },
    }))

    const formData = buildFormData({
      accountId: TEST_SOURCE_ACCOUNT_ID,
      categoryId: TEST_CATEGORY_ID,
      type: 'expense',
      amountCents: '3500',
      description: 'Groceries',
      date: '2026-01-01',
    })

    await createTransaction(formData)

    // One insert
    expect(capturedValues).toHaveLength(1)
    expect(capturedValues[0].amountCents).toBe(-3500) // negative
    expect(capturedValues[0].type).toBe('expense')

    // One balance update
    expect(capturedUpdates).toHaveLength(1)
    expect(capturedUpdates[0].balanceCents).toBeDefined()
  })
})
