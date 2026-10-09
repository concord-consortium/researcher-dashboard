import type { PackageRow, Scope } from "./portal";

// The class's authored URL profile, which only report-service's function writes.
export interface Profile {
  assignment_urls?: string[];
  interactive_urls?: string[];
  assignment_fingerprint?: string;
  derived_at?: { toMillis(): number } | null;
  truncated?: boolean;
}

export function needsRefresh(profile: Profile | null, scope: Scope, now: number, maxAgeMs: number): boolean {
  if (!profile) return true;
  if (profile.assignment_fingerprint !== scope.assignment_fingerprint) return true;
  const derived = profile.derived_at?.toMillis();
  return derived === undefined || now - derived > maxAgeMs;
}

// The same set the runner sends to report-server's applies, so a package offered here is not
// refused there for a difference in URLs.
export function scopeUrls(profile: Profile): string[] {
  return [...(profile.assignment_urls ?? []), ...(profile.interactive_urls ?? [])];
}

export interface Group {
  key: string;
  heading: string;
  rows: PackageRow[];
  collapsed: boolean;
}

export function titleOf(row: PackageRow): string {
  return row.current_version.title || row.name;
}

// Official first needs no key: every official row is in the Official group.
function byTitle(a: PackageRow, b: PackageRow): number {
  return titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: "base" });
}

// The heading is where the researcher's claim on a package comes from, so each applicable row
// goes in the first group it qualifies for, and a row in none is not listed.
export function groupPackages(rows: PackageRow[], scope: Scope): Group[] {
  const official: PackageRow[] = [], mine: PackageRow[] = [], community: PackageRow[] = [];
  const projects = new Map<number, PackageRow[]>(scope.project_ids.map((id) => [id, []]));

  for (const row of rows.filter((r) => r.applies)) {
    if (row.official) official.push(row);
    else if (row.visibility === "project" && row.project && projects.has(row.project.id)) projects.get(row.project.id)!.push(row);
    else if (row.mine) mine.push(row);
    else if (row.visibility === "public") community.push(row);
  }

  const groups: Group[] = [{ key: "official", heading: "Official", rows: official, collapsed: false }];
  for (const [id, projectRows] of projects) {
    const name = projectRows.find((r) => r.project?.name)?.project?.name;
    groups.push({ key: `project-${id}`, heading: name ?? `Project ${id}`, rows: projectRows, collapsed: false });
  }
  groups.push({ key: "mine", heading: "Mine", rows: mine, collapsed: false });
  groups.push({ key: "community", heading: "Community", rows: community, collapsed: true });

  return groups
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ ...g, rows: [...g.rows].sort(byTitle) }));
}
