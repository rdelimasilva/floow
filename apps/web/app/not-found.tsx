import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-gray-400">404</p>
      <h1 className="text-xl font-semibold text-gray-900">Página não encontrada</h1>
      <p className="max-w-md text-sm text-gray-600">
        O endereço pode ter mudado ou o item foi removido. Volte ao início e siga pelo menu.
      </p>
      <Link href="/dashboard" className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
        Ir para o início
      </Link>
    </main>
  )
}
