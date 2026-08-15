import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) for the Docker image —
  // only the traced node_modules are shipped, so the runner stage stays small.
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
