/** @type {import('next').NextConfig} */

// Origin of the NestJS API. Browser requests to /api/v1/* are proxied here so
// the JWT cookies stay first-party on the web origin (no cross-site cookies).
const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
