export default function DebtsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-52 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-3 w-20 rounded bg-gray-200 mb-3" />
            <div className="h-7 w-28 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border border-gray-200 bg-white" />
        ))}
      </div>
    </div>
  )
}
