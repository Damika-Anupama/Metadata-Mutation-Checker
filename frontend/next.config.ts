import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the workspace root to this directory. Stray node_modules/.next folders at
// the repo root would otherwise make Turbopack infer the wrong root and fail.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [
      {
        source: "/api/analyze",
        destination: `${backendUrl}/analyze`,
      },
    ];
  },
};

export default nextConfig;
