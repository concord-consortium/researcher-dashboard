// Stamped by the build. `__BUILD_VERSION__` is replaced by Vite at build time, so a
// deployed copy can say which build it is without reading anything at runtime.
declare const __BUILD_VERSION__: string;

// The app's own version, from package.json, so it is written in one place.
export { version as APP_VERSION } from "../package.json";

export const BUILD_VERSION: string =
  typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : "dev";

// The deploy path's root (`<prefix>/version/<tag>/`) wherever the page is served from: this module and its
// bundled chunk both sit one level below it. @vite-ignore stops the dev server rewriting the URL.
export const DEPLOY_ROOT: string = new URL(/* @vite-ignore */ "..", import.meta.url).href;
