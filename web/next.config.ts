import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // This package lives in Distro/web — keep tracing rooted here
  outputFileTracingRoot: path.join(__dirname),
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
