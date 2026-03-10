export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-2xl font-semibold tracking-tight text-gray-900">
            Floow
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
