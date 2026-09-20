import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Every deployment is plain files under a versioned path in S3, so assets are referenced
// relatively rather than from the site root: the same build has to work at
// /researcher-dashboard/version/v1.2.3/ and at /researcher-dashboard/branch/main/.
export default defineConfig({
  base: "./",
  plugins: [react()],
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
