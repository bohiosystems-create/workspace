/** @type {import('next').NextConfig} */
export default {
  // Native PNG renderer used for WhatsApp images — load from node_modules at runtime.
  serverExternalPackages: ["@resvg/resvg-js", "@vercel/blob"],
  // Ship the bundled fonts with the serverless functions that render images.
  outputFileTracingIncludes: {
    "/api/whatsapp": ["./assets/fonts/**"],
  },
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
  // pptxgenjs (▶ Play → PowerPoint, browser only) references node:fs / node:https for its Node build: not in the page.
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => { r.request = r.request.replace(/^node:/, ""); }));
      config.resolve.fallback = { ...(config.resolve.fallback ?? {}), fs: false, https: false, http: false, path: false, os: false, stream: false, zlib: false };
    }
    return config;
  },
};
