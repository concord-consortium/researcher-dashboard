import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { contentSecurityPolicy } from "./src/shell/csp";
import { DEPLOYED } from "./src/shell/portals";

// A <meta> rather than a CloudFront header, so the policy ships with the renderer it bounds and
// covers every path the build is served from. Build only: the dev server's preamble is inline.
const csp = (): Plugin => ({
  name: "researcher-dashboard-csp",
  apply: "build",
  transformIndexHtml: () => [{
    tag: "meta",
    attrs: { "http-equiv": "Content-Security-Policy", content: contentSecurityPolicy(DEPLOYED) },
    injectTo: "head-prepend"
  }]
});

// Every deployment is plain files under a versioned path in S3, so assets are referenced
// relatively rather than from the site root: the same build has to work at
// /researcher-dashboard/version/v1.2.3/ and at /researcher-dashboard/branch/main/.
export default defineConfig({
  base: "./",
  plugins: [react(), csp()],
  define: {
    // The tag or branch this copy was built from, so a deployed build can say which it is.
    __BUILD_VERSION__: JSON.stringify(
      process.env.GITHUB_REF_NAME ?? process.env.BUILD_VERSION ?? "dev"
    )
  },
  test: {
    // No `globals`: every test imports describe/it/expect from vitest, so the type check
    // does not need a test runner's ambient types to pass.
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"]
  }
});
