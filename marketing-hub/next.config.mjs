/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Bench page was removed; trials now live on the Decisions page.
  async redirects() {
    return [{ source: "/bench", destination: "/decisions#trials", permanent: false }];
  },
};

export default nextConfig;
