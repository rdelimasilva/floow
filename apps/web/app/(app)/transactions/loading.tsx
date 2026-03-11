export default function TransactionsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded bg-gray-200" />
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b border-gray-100 p-4">
            <div className="h-4 w-full rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
