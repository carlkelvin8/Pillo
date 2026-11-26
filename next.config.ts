import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build live beside the dev server's .next (NEXT_DIST_DIR=.next-prod pnpm build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // Clinic logos are up to 1 MB; the default Server Action limit is also 1 MB.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
