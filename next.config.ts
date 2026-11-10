import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages. A scheduled GitHub Actions job rebuilds
 * the site every 6 hours, fetching the APIs at build time with keys from
 * repository secrets, so no key ever reaches the browser.
 *
 * BASE_PATH is "/<repo-name>" on a project Pages site, empty locally.
 */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
