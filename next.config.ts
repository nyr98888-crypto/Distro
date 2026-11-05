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
