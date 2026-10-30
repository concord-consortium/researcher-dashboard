import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { contentSecurityPolicy } from "./src/shell/csp";
import { DEPLOYED } from "./src/shell/portals";

// A <meta> rather than a CloudFront header, so the policy ships with the renderer it bounds and
// covers every path the build is served from, the demo page's included. Build only: the dev
// server's preamble is inline.
const csp = (): Plugin => ({
  name: "researcher-dashboard-csp",
  apply: "build",
  transformIndexHtml: () => [{
    tag: "meta",
    attrs: { "http-equiv": "Content-Security-Policy", content: contentSecurityPolicy(DEPLOYED) },
    injectTo: "head-prepend"
  }]
});

// The copy of index.html a release puts at the prefix root, where `./assets/...` would miss: each
// reference to the build's own files carries the path this build is deployed to, which
// s3-deploy-action passes as DEPLOY_PATH (`version/<tag>` or `branch/<name>`). Post-order, because
// Vite adds index.html to the bundle, policy included, only in its own generateBundle; and the
// policy's `base-uri 'none'` rules out a <base> instead.
const indexTop = (): Plugin => ({
  name: "researcher-dashboard-index-top",
  apply: "build",
  enforce: "post",
  generateBundle(_options, bundle) {
    const deployPath = process.env.DEPLOY_PATH;
    if (!deployPath) return;
    const index = bundle["index.html"];
    if (index?.type !== "asset") throw new Error("index-top.html needs the built index.html");
    this.emitFile({
      type: "asset",
      fileName: "index-top.html",
      source: String(index.source).replace(/(src|href)="\.\//g, `$1="${deployPath}/`)
    });
  }
});

// Every deployment is plain files under a versioned path in S3, so assets are referenced
// relatively rather than from the site root: the same build has to work at
// /researcher-dashboard/version/app-1.2.3/, at /researcher-dashboard/branch/main/, and, as
// index-top.html, from /researcher-dashboard/ itself.
export default defineConfig({
  base: "./",
  plugins: [react(), csp(), indexTop()],
  build: {
    // The dashboard, and the demo page beside it at demo/, which the info page links to.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        demo: fileURLToPath(new URL("demo/index.html", import.meta.url))
      }
    }
  },
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
