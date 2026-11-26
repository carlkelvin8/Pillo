import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Clinic logos are up to 1 MB; the default Server Action limit is also 1 MB.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
