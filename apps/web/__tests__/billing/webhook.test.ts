import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock stripe module ────────────────────────────────────────────────────────
const mockConstructEvent = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/stripe/server', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}))

// ── Mock supabase-js ──────────────────────────────────────────────────────────
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRequest(body: string, signature: string): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body,
  })
}

function setupSupabaseMock() {
  // Chain: from('subscriptions').update({...}).eq(...)
  const eqResult = { data: null, error: null }
  mockEq.mockResolvedValue(eqResult)
  mockUpdate.mockReturnValue({ eq: mockEq })
  mockFrom.mockReturnValue({ update: mockUpdate })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
    // Default: valid event construction succeeds
    mockConstructEvent.mockReturnValue({ type: 'unknown', data: { object: {} } })
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const request = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    })

    const response = await POST(request)
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json.error).toMatch(/stripe-signature/i)
  })

  it('returns 400 when stripe signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const request = buildRequest('{"type":"test"}', 'invalid-sig')

    const response = await POST(request)
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json.error).toContain('Webhook Error')
  })

  it('updates subscription to pro/active on checkout.session.completed', async () => {
    const mockEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'org-123',
          customer: 'cus_test123',
          subscription: 'sub_test123',
        },
      },
    }

    mockConstructEvent.mockReturnValue(mockEvent)

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const request = buildRequest(JSON.stringify(mockEvent), 'valid-sig')

    const response = await POST(request)
    expect(response.status).toBe(200)

    // Verify supabase.from('subscriptions').update({...}).eq('org_id', orgId)
    expect(mockFrom).toHaveBeenCalledWith('subscriptions')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_customer_id: 'cus_test123',
        stripe_subscription_id: 'sub_test123',
        plan_tier: 'pro',
        status: 'active',
      })
    )
    expect(mockEq).toHaveBeenCalledWith('org_id', 'org-123')
  })

  it('sets plan_tier to free and status to canceled on customer.subscription.deleted', async () => {
    const mockEvent = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer: 'cus_test123',
          status: 'canceled',
        },
      },
    }

    mockConstructEvent.mockReturnValue(mockEvent)

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const request = buildRequest(JSON.stringify(mockEvent), 'valid-sig')

    const response = await POST(request)
    expect(response.status).toBe(200)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_tier: 'free',
        status: 'canceled',
        stripe_subscription_id: null,
      })
    )
    expect(mockEq).toHaveBeenCalledWith('stripe_customer_id', 'cus_test123')
  })

  it('sets status to past_due on invoice.payment_failed', async () => {
    const mockEvent = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_test123',
        },
      },
    }

    mockConstructEvent.mockReturnValue(mockEvent)

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const request = buildRequest(JSON.stringify(mockEvent), 'valid-sig')

    const response = await POST(request)
    expect(response.status).toBe(200)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'past_due',
      })
    )
    expect(mockEq).toHaveBeenCalledWith('stripe_customer_id', 'cus_test123')
  })

  it('returns 200 with received:true for successfully processed events', async () => {
    const mockEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'org-456',
          customer: 'cus_456',
          subscription: 'sub_456',
        },
      },
    }
    mockConstructEvent.mockReturnValue(mockEvent)

    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const request = buildRequest(JSON.stringify(mockEvent), 'valid-sig')

    const response = await POST(request)
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json).toEqual({ received: true })
  })
})
