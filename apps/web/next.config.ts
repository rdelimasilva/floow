import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@floow/db', '@floow/shared', '@floow/core-finance'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
