import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker needs the self-contained .next/standalone server bundle. Vercel's
  // Next.js 16.3 build adapter currently conflicts with `output: "standalone"`
  // and fails after compilation because next-server.js.nft.json is suppressed.
  // Vercel does not use the standalone folder, so keep it only off-platform.
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
};

export default nextConfig;
