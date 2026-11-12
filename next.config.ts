import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native / optional server deps out of the bundler graph
  serverExternalPackages: [
    "@libsql/client",
    "@libsql/isomorphic-ws",
    "@sparticuz/chromium-min",
    "bullmq",
    "ioredis",
    "puppeteer-core",
  ],
  // Avoid React #418 hydration on /dashboard — redirect before any RSC HTML.
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/signin",
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: "/dashboard/campaigns",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,OPTIONS,PATCH",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, x-distro-key",
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // BullMQ optionally imports Valkey Glide — not installed / not needed
    config.resolve.alias = {
      ...config.resolve.alias,
      "@valkey/valkey-glide": false,
    };
    return config;
  },
};

export default nextConfig;
