import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@fantasyfb/authentication",
    "@fantasyfb/contracts",
    "@fantasyfb/database",
    "@fantasyfb/ui"
  ],
  poweredByHeader: false
};

export default nextConfig;
