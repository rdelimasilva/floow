export default function BudgetInvestingLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
      </div>
      <div className="h-20 rounded-xl border border-gray-200 bg-white" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200" />
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
