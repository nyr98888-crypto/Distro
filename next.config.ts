import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turso/libsql out of the Turbopack client graph
  serverExternalPackages: [
    "@libsql/client",
    "@libsql/isomorphic-ws",
    "@prisma/adapter-libsql",
    "@prisma/client",
  ],
};

export default nextConfig;
