import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/components/auth/oauth-buttons', () => ({ OAuthButtons: () => null }))
vi.mock('@/components/auth/login-form', () => ({ LoginForm: () => null }))
vi.mock('@/components/auth/signup-form', () => ({ SignupForm: () => null }))
vi.mock('@/components/auth/magic-link-form', () => ({ MagicLinkForm: () => null }))
vi.mock('@/components/auth/forgot-password-form', () => ({ ForgotPasswordForm: () => null }))

const { AuthTabs } = await import('@/components/auth/auth-tabs')
const { parseAuthTab } = await import('@/components/auth/auth-tab')

describe('AuthTabs', () => {
  it('abre em Entrar por padrão', () => {
    render(<AuthTabs />)
    expect(screen.getByRole('tab', { name: 'Entrar' }).getAttribute('aria-selected')).toBe('true')
  })

  it('abre em Registrar quando a landing manda ?tab=signup', () => {
    render(<AuthTabs defaultTab="signup" />)
    expect(screen.getByRole('tab', { name: 'Registrar' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('parseAuthTab', () => {
  it('aceita só os valores conhecidos', () => {
    expect(parseAuthTab('signup')).toBe('signup')
    expect(parseAuthTab('login')).toBe('login')
    expect(parseAuthTab('qualquer')).toBe('login')
    expect(parseAuthTab(undefined)).toBe('login')
    expect(parseAuthTab(['signup', 'login'])).toBe('signup')
  })
})
