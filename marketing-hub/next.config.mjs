/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed pages: Bench and Decisions (the vendor scoring board and trials are on Vendors) and Invoices (on Vendors).
  async redirects() {
    return [
      { source: "/bench", destination: "/orchestration#trials", permanent: false },
      // Decisions became the vendor scoring board inside the Vendors page.
      { source: "/decisions", destination: "/orchestration#scoring", permanent: false },
      // Invoices moved into the Vendors page (per vendor, and all vendors at #invoices).
      { source: "/invoices", destination: "/orchestration#invoices", permanent: false },
    ];
  },
};

export default nextConfig;
