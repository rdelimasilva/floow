import type { NextConfig } from 'next';
import { readFileSync } from 'fs';
import { withSentryConfig } from '@sentry/nextjs/config';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  transpilePackages: ['@floow/db', '@floow/shared', '@floow/core-finance'],
  // Fora do bundle para o Sentry instrumentar as consultas (postgresJsIntegration
  // funciona por hook de require, que não alcança código empacotado). Sem isto
  // os traces mostram a rota, mas não quanto dela foi banco.
  serverExternalPackages: ['postgres'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'ak8t3l6j6j.ufs.sh' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
});
