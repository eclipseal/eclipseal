import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The landing page and dashboard are client-heavy (WebGL, GSAP, live API data),
  // so Cache Components / PPR would add little here. Keep the classic model.
  cacheComponents: false,
  images: {
    qualities: [75, 85],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
