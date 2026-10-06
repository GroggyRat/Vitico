import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Product CSV imports are capped at 5 MB in the action; leave room for multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
