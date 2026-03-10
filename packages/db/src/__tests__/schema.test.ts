import { describe, it, expect } from 'vitest'
import { orgs, profiles, orgMembers, subscriptions } from '../index'

describe('schema exports', () => {
  it('schema exports are defined', () => {
    expect(orgs).toBeTruthy()
    expect(profiles).toBeTruthy()
    expect(orgMembers).toBeTruthy()
    expect(subscriptions).toBeTruthy()
  })

  it('orgs table has expected columns', () => {
    expect(orgs.id).toBeDefined()
    expect(orgs.name).toBeDefined()
    expect(orgs.type).toBeDefined()
    expect(orgs.createdAt).toBeDefined()
    expect(orgs.updatedAt).toBeDefined()
  })

  it('profiles table has expected columns', () => {
    expect(profiles.id).toBeDefined()
    expect(profiles.email).toBeDefined()
    expect(profiles.fullName).toBeDefined()
    expect(profiles.avatarUrl).toBeDefined()
  })

  it('orgMembers table has expected columns', () => {
    expect(orgMembers.id).toBeDefined()
    expect(orgMembers.orgId).toBeDefined()
    expect(orgMembers.userId).toBeDefined()
    expect(orgMembers.role).toBeDefined()
  })

  it('subscriptions table has expected columns', () => {
    expect(subscriptions.id).toBeDefined()
    expect(subscriptions.orgId).toBeDefined()
    expect(subscriptions.planTier).toBeDefined()
    expect(subscriptions.status).toBeDefined()
    expect(subscriptions.stripeCustomerId).toBeDefined()
    expect(subscriptions.stripeSubscriptionId).toBeDefined()
    expect(subscriptions.cancelAtPeriodEnd).toBeDefined()
  })
})

// Wave 0 placeholders — AUTH-05 integration tests (require running Supabase instance)
describe('integration stubs', () => {
  it.todo('RLS: user cannot access other org\'s data')
  it.todo('trigger: signup creates org, profile, and subscription')
})
