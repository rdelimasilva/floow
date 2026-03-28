export default function FixedAssetsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-52 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>
        <div className="h-9 w-36 rounded bg-gray-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-5 w-28 rounded bg-gray-200 mb-3" />
            <div className="h-3 w-20 rounded bg-gray-100 mb-2" />
            <div className="h-6 w-24 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
