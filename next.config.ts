import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "bcryptjs", "xlsx", "exceljs"],
};

export default nextConfig;
