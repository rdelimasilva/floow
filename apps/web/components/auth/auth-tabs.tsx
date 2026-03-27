'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OAuthButtons } from './oauth-buttons'
import { LoginForm } from './login-form'
import { SignupForm } from './signup-form'
import { MagicLinkForm } from './magic-link-form'
import { ForgotPasswordForm } from './forgot-password-form'

export function AuthTabs() {
  const [showMagicLink, setShowMagicLink] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  return (
    <Tabs defaultValue="login" className="w-full" onValueChange={() => { setShowMagicLink(false); setShowForgotPassword(false) }}>
      <TabsList className="grid w-full grid-cols-2 mb-6">
        <TabsTrigger value="login">Entrar</TabsTrigger>
        <TabsTrigger value="signup">Registrar</TabsTrigger>
      </TabsList>

      <TabsContent value="login" className="space-y-4">
        {/* OAuth — presented as peer options, not secondary (LOCKED DECISION) */}
        <OAuthButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-gray-400">ou</span>
          </div>
        </div>

        {showForgotPassword ? (
          <>
            <ForgotPasswordForm />
            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-700 underline underline-offset-4"
            >
              Voltar ao login
            </button>
          </>
        ) : showMagicLink ? (
          <>
            <MagicLinkForm />
            <button
              type="button"
              onClick={() => setShowMagicLink(false)}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-700 underline underline-offset-4"
            >
              Usar email e senha
            </button>
          </>
        ) : (
          <>
            <LoginForm />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-4"
              >
                Esqueci minha senha
              </button>
              <button
                type="button"
                onClick={() => setShowMagicLink(true)}
                className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-4"
              >
                Usar link mágico
              </button>
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="signup" className="space-y-4">
        {/* OAuth — presented as peer options, not secondary (LOCKED DECISION) */}
        <OAuthButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-gray-400">ou</span>
          </div>
        </div>

        <SignupForm />
      </TabsContent>
    </Tabs>
  )
}
