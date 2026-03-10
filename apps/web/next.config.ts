import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@floow/db', '@floow/shared', '@floow/core-finance'],
};

export default nextConfig;
