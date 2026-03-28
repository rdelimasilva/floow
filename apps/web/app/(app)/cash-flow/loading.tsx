export default function CashFlowLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-3 w-16 rounded bg-gray-200 mb-3" />
            <div className="h-7 w-24 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="h-96 rounded-xl border border-gray-200 bg-white" />
    </div>
  )
}
