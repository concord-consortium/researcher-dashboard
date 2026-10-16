import { useEffect, useRef } from "react";

// Requests each behind item once per result: `at` is the result's updated_at, so the snapshots
// that arrive before the queued result cannot repeat the request, and the next finished result,
// with its own updated_at, can be requested again. A request that resolves false did not take,
// and its item is asked for again the next time the effect runs while not stopped.
export function useAutoRerun<T>(behind: Map<string, { row: T; at: number | null }>, stopped: boolean,
  request: (key: string, row: T) => Promise<boolean>): void {
  const asked = useRef(new Map<string, number | null>());
  useEffect(() => {
    if (stopped) return;
    for (const [key, { row, at }] of behind) {
      if (asked.current.has(key) && asked.current.get(key) === at) continue;
      asked.current.set(key, at);
      void request(key, row).then((taken) => {
        if (!taken && asked.current.get(key) === at) asked.current.delete(key);
      });
    }
  }, [behind, stopped, request]);
}
