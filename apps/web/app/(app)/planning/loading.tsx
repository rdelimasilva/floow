export default function PlanningLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-5 w-32 rounded bg-gray-200 mb-3" />
            <div className="h-3 w-48 rounded bg-gray-100 mb-2" />
            <div className="h-3 w-40 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
