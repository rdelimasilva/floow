export default function AccountsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded bg-gray-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 rounded-lg border border-gray-200 bg-white p-4">
            <div className="h-4 w-24 rounded bg-gray-200 mb-3" />
            <div className="h-6 w-32 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
