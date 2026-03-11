export default function InvestmentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="h-4 w-64 rounded bg-gray-100" />
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <div className="h-4 w-full rounded bg-gray-100" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b border-gray-100 p-4">
            <div className="h-4 w-full rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
