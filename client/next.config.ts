import type { NextConfig } from "next";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: "/sales/sales-orders",
        destination: "/sales/orders",
        permanent: true,
      },
      {
        source: "/sales/sales-orders/:path*",
        destination: "/sales/orders/:path*",
        permanent: true,
      },
      {
        source: "/purchases/purchase-orders",
        destination: "/purchases/orders",
        permanent: true,
      },
      {
        source: "/purchases/purchase-orders/:path*",
        destination: "/purchases/orders/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/:path*`,
      },
    ];
  },
};

export default nextConfig;
