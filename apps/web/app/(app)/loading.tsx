export default function AppLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="h-4 w-72 rounded bg-gray-100" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-gray-200 mb-3" />
            <div className="h-6 w-28 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-lg border border-gray-200 bg-white" />
    </div>
  )
}
