import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  transpilePackages: ['@acme/auth', '@acme/config', '@acme/jobs', '@acme/shared', '@acme/ui'],
  typedRoutes: true,
  output: 'standalone',
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
