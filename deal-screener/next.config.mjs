/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow larger request bodies for uploaded OM/teaser PDFs.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
