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
  experimental: {
    // Tela já visitada (dynamic) ou pré-carregada pelo menu (static) volta do
    // cache do navegador por 5 min, sem nova ida ao servidor. O que o próprio
    // usuário muda chega na hora: as server actions chamam revalidateTag/
    // revalidatePath, que limpam esse cache. Só o que muda por fora (sync do
    // Open Finance pelo cron) pode levar até esse tempo para aparecer.
    staleTimes: { dynamic: 300, static: 300 },
    // Hover (ou toque) num link já busca a tela inteira, não só o skeleton:
    // o clique que vem logo depois abre do cache.
    dynamicOnHover: true,
  },
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
