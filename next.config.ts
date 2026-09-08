import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) for the Docker image —
  // only the traced node_modules are shipped, so the runner stage stays small.
  output: "standalone",
  poweredByHeader: false,
  // Face ML must stay external: bundling pulls the native tfjs-node loader
  // chain (or breaks the WASM backend's on-disk .wasm resolution). The
  // runner image carries full node_modules, so runtime require() resolves.
  serverExternalPackages: [
    "@vladmandic/face-api",
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-backend-wasm",
  ],
};

export default nextConfig;
