import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@fantasyfb/authentication",
    "@fantasyfb/contracts",
    "@fantasyfb/database",
    "@fantasyfb/ui"
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"]
    };
    return config;
  },
  poweredByHeader: false
};

export default nextConfig;
