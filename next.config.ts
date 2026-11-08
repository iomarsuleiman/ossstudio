import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/", destination: "/en", permanent: false },
      // The sortable list moved off /en/index so the URL no longer collides
      // with the dynamic gallery route in the edge cache.
      { source: "/:locale(en|ar)/index", destination: "/:locale/list", permanent: true },
    ];
  },
};

export default nextConfig;
