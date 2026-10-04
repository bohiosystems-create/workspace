/** @type {import('next').NextConfig} */
const nextConfig = {
  // pptxgenjs (PowerPoint export, browser only) references node:fs / node:https for its Node build: not in the page.
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => { r.request = r.request.replace(/^node:/, ""); }));
      config.resolve.fallback = { ...(config.resolve.fallback ?? {}), fs: false, https: false, http: false, path: false, os: false, stream: false, zlib: false };
    }
    return config;
  },
  // Removed pages: Bench and Decisions (the vendor scoring board and trials are on Vendors) and Invoices (on Vendors).
  async redirects() {
    return [
      { source: "/bench", destination: "/orchestration#trials", permanent: false },
      // Initiatives merged into Campaigns; Experiments renamed Tests.
      { source: "/ideas", destination: "/campaigns#initiatives", permanent: false },
      { source: "/experiments", destination: "/tests", permanent: false },
      // The Daily campaign check is now a section of the Reports page.
      { source: "/daily", destination: "/reports#daily-check", permanent: false },
      // Decisions became the vendor scoring board inside the Vendors page.
      { source: "/decisions", destination: "/orchestration#scoring", permanent: false },
      // Invoices moved into the Vendors page (per vendor, and all vendors at #invoices).
      { source: "/invoices", destination: "/orchestration#invoices", permanent: false },
    ];
  },
};

export default nextConfig;
