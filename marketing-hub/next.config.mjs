/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed pages: Bench (trials are on Decisions) and Invoices (on Vendors).
  async redirects() {
    return [
      { source: "/bench", destination: "/decisions#trials", permanent: false },
      // Invoices moved into the Vendors page (per vendor, and all vendors at #invoices).
      { source: "/invoices", destination: "/orchestration#invoices", permanent: false },
    ];
  },
};

export default nextConfig;
