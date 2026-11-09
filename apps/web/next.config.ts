import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  output: "standalone",
  // Local cloud dev runs next to the self-mode dev server (each needs its own build dir).
  ...(process.env.OZVI_NEXT_DIST && { distDir: process.env.OZVI_NEXT_DIST }),
  // Bug reports carry screenshots; attachments are validated again in the action.
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
  // Legal pages moved to English paths (2026-11-08); old Slovak links keep working.
  async redirects() {
    return [
      { source: "/podmienky", destination: "/terms", permanent: true },
      { source: "/sukromie", destination: "/privacy", permanent: true },
      { source: "/pristupnost", destination: "/accessibility", permanent: true },
    ];
  },
  // No page may be framed (clickjacking on consent/login/admin). The widget is a web component, not an iframe.
  async headers() {
    // Dev only: allow same-origin frames so layouts can be checked at phone width side by side.
    if (process.env.NODE_ENV === "development") return [];
    return [{ source: "/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }];
  },
  transpilePackages: ["@ozvi/theme", "@ozvi/db", "@ozvi/sdk", "@ozvi/mcp"],
};

export default withNextIntl(config);
