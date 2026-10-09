import { describe, expect, it, vi } from "vitest";

const initializeAuth = vi.fn(() => ({}));
const onSnapshot = vi.fn();
vi.mock("firebase/auth", () => ({
  initializeAuth, inMemoryPersistence: "in-memory", getAuth: vi.fn(() => ({})),
  connectAuthEmulator: vi.fn(), signInWithCustomToken: vi.fn(async () => ({}))
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({})), connectFirestoreEmulator: vi.fn(), doc: vi.fn(), onSnapshot
}));

describe("signIn", () => {
  it("keeps the Firebase session in memory", async () => {
    const { signIn } = await import("../src/shell/firebase");
    await signIn("report-service-dev", "custom");
    expect(initializeAuth).toHaveBeenCalledWith(expect.anything(), { persistence: "in-memory" });
  });
});

describe("watchDoc", () => {
  it("hands a refused listener's error to the page", async () => {
    const { watchDoc } = await import("../src/shell/firebase");
    const onError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    watchDoc({} as never, "a/b", vi.fn(), onError);
    const refused = new Error("permission-denied");
    (onSnapshot.mock.calls[0] as unknown as [unknown, unknown, (e: Error) => void])[2](refused);
    expect(onError).toHaveBeenCalledWith(refused);
  });

  it("reads a missing document as null, which is what asks for a refresh", async () => {
    const { watchDoc } = await import("../src/shell/firebase");
    const onValue = vi.fn();
    watchDoc({} as never, "a/b", onValue, vi.fn());
    const call = onSnapshot.mock.calls.at(-1) as unknown as [unknown, (s: unknown) => void];
    call[1]({ exists: () => false, data: () => undefined });
    expect(onValue).toHaveBeenCalledWith(null);
  });
});
