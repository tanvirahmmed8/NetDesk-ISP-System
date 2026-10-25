import type { NextConfig } from "next";

const nextConfig: NextConfig = { distDir: process.env.NETDESK_DIST_DIR || ".next" };
export default nextConfig;
