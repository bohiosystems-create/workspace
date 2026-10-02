/** @type {import('next').NextConfig} */
export default {
  // Native PNG renderer used for WhatsApp images — load from node_modules at runtime.
  serverExternalPackages: ["@resvg/resvg-js", "@vercel/blob"],
  // Ship the bundled fonts with the serverless functions that render images.
  outputFileTracingIncludes: {
    "/api/whatsapp": ["./assets/fonts/**"],
  },
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
};
