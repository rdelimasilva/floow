'use client'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h2 className="text-xl font-semibold text-red-600">Algo deu errado</h2>
      <p className="text-sm text-gray-600">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md"
      >
        Tentar novamente
      </button>
    </div>
  )
}
