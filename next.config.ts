import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NETDESK_DIST_DIR || ".next",
  ...(process.env.NETDESK_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};
export default nextConfig;
