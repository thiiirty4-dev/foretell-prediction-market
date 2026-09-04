import type { NextConfig } from "next";

const isVinextLifecycle = new Set(["dev:vinext", "build:vinext", "deploy"]).has(
  process.env.npm_lifecycle_event ?? "",
);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  ...(isVinextLifecycle ? {} : {
    turbopack: {
      resolveAlias: {
        "cloudflare:workers": "./lib/cloudflare-workers-shim.ts",
      },
    },
  }),
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.privy.io https://*.supabase.co https://rpc-amoy.polygon.technology; frame-src https://*.privy.io; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" }
    ] }];
  }
};

export default nextConfig;
