/** @type {import('next').NextConfig} */

// In production (Vercel), NEXT_PUBLIC_API_URL is set to the Railway URL.
// In local dev it falls back to localhost:4400.
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4400';

const nextConfig = {
  reactStrictMode: true,
  // Proxy API requests to the backend (works for both local and production)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${BACKEND_URL}/auth/:path*`,
      },
    ];
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
