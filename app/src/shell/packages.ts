import type { Scope } from "./portal";

// The class's authored URL profile, which only report-service's function writes.
export interface Profile {
  assignment_fingerprint?: string;
  derived_at?: { toMillis(): number } | null;
}

export function needsRefresh(profile: Profile | null, scope: Scope, now: number, maxAgeMs: number): boolean {
  if (!profile) return true;
  if (profile.assignment_fingerprint !== scope.assignment_fingerprint) return true;
  const derived = profile.derived_at?.toMillis();
  return derived === undefined || now - derived > maxAgeMs;
}
