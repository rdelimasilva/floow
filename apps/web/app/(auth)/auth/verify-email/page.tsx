import Link from 'next/link'

export default function VerifyEmailPage() {
  return (
    <div className="w-full text-center space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Verifique seu email
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Enviamos um link de verificação para o seu email.
          <br />
          Clique no link para ativar sua conta.
        </p>
      </div>
      <p className="text-sm text-gray-400">
        Não recebeu? Verifique a pasta de spam.
      </p>
      <Link
        href="/auth"
        className="text-sm text-gray-700 underline underline-offset-4 hover:text-gray-900"
      >
        Voltar ao login
      </Link>
    </div>
  )
}
