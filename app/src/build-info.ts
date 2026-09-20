// Stamped by the build. `__BUILD_VERSION__` is replaced by Vite at build time, so a
// deployed copy can say which build it is without reading anything at runtime.
declare const __BUILD_VERSION__: string;

export const BUILD_VERSION: string =
  typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : "dev";
