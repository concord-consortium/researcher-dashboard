// Stamped by the build. `__BUILD_VERSION__` is replaced by Vite at build time, so a
// deployed copy can say which build it is without reading anything at runtime.
declare const __BUILD_VERSION__: string;

// The app's own version, from package.json, so it is written in one place.
export { version as APP_VERSION } from "../package.json";

export const BUILD_VERSION: string =
  typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : "dev";

// Where this build's files are, whichever page loaded them: `<prefix>/version/<tag>/` for both
// that path's own index.html and the copy a release puts at the prefix root, and `/` on the dev
// server. Correct only because this module sits one level below the app root in source and is
// bundled one level below it in `assets/`. Ignored by Vite, which otherwise rewrites the URL on
// the dev server.
export const DEPLOY_ROOT: string = new URL(/* @vite-ignore */ "..", import.meta.url).href;
