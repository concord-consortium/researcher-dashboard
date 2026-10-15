// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const WRITES = ["setDoc", "updateDoc", "addDoc", "deleteDoc", "writeBatch", "runTransaction"];

const sources = new Map(
  readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.tsx?$/.test(path))
    .map((path) => [relative(SRC, join(SRC, path)), readFileSync(join(SRC, path), "utf8")])
);

const FIRESTORE = /from\s*["']firebase\/firestore(?:\/lite)?["']/;

const firestoreImports = (source: string) =>
  [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']firebase\/firestore(?:\/lite)?["']/g)]
    .flatMap((m) => m[1].split(",").map((name) => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]));

// The page reads the dashboard tree and never writes it.
describe("the app's Firestore access", () => {
  it("reads the sources it means to", () => {
    expect(sources.has("shell/firebase.ts")).toBe(true);
    expect(firestoreImports(sources.get("shell/firebase.ts")!)).toContain("onSnapshot");
  });

  it("imports no Firestore write", () => {
    for (const [path, source] of sources) {
      expect(firestoreImports(source).filter((name) => WRITES.includes(name)), path).toEqual([]);
      if (FIRESTORE.test(source)) {
        expect(source, path).not.toMatch(/import\s*\*\s*as/);
        for (const name of WRITES) expect(source, path).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
  });
});
