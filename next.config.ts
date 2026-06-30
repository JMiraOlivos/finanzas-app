import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["postgres", "bcryptjs", "xlsx", "exceljs"],
  },
};

export default nextConfig;
