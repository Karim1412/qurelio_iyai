/** @type {import('next').NextConfig} */
// Browser calls /api/* on the same host as the UI (no localhost vs 127.0.0.1 mismatch).
// Docker build: set API_PROXY_TARGET=http://gateway:3000
// Local dev: default targets gateway on the host (127.0.0.1:3000).
const gatewayProxy =
  process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000';

const nextConfig = {
  output: 'standalone',
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${gatewayProxy.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
