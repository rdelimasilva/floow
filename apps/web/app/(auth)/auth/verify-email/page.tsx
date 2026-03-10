import Link from 'next/link'

export default function VerifyEmailPage() {
  return (
    <div className="w-full text-center space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Check your email
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          We sent a verification link to your email address.
          <br />
          Click the link to verify your account.
        </p>
      </div>
      <p className="text-sm text-gray-400">
        Didn&apos;t receive it? Check your spam folder.
      </p>
      <Link
        href="/auth"
        className="text-sm text-gray-700 underline underline-offset-4 hover:text-gray-900"
      >
        Back to login
      </Link>
    </div>
  )
}
