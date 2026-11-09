import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native / optional server deps out of the bundler graph
  serverExternalPackages: [
    "@libsql/client",
    "@libsql/isomorphic-ws",
    "@prisma/adapter-libsql",
    "@prisma/client",
    "bullmq",
    "ioredis",
  ],
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
