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

// The profile's URLs as stored, assignment URLs first, which report-server matches each package
// against.
export function scopeUrls(profile: Profile): string[] {
  return [...(profile.assignment_urls ?? []), ...(profile.interactive_urls ?? [])];
}

// The result document's id: the identity with "/" as "__", which the function and the runner
// derive the same way, so the page can find a result without being told its path.
export function packageKey(identity: string): string {
  return identity.replaceAll("/", "__");
}

// The inverse of packageKey: an identity never contains "_", so every "__" in a key was a "/".
export function identityOfKey(key: string): string {
  return key.replaceAll("__", "/");
}

export interface Group {
  key: string;
  heading: string;
  rows: PackageRow[];
  // The tag on a row's card: the group's heading, or a project package's project.
  tag: (row: PackageRow) => string;
}

// A search's words, lowercased.
export function searchWords(search: string): string[] {
  return search.toLowerCase().split(/\s+/).filter(Boolean);
}

// Whether every word of a search appears, ignoring case, in one of a package's texts.
export function matchesSearch(search: string, texts: (string | null | undefined)[]): boolean {
  const haystack = texts.filter(Boolean).join("\n").toLowerCase();
  return searchWords(search).every((word) => haystack.includes(word));
}

export function titleOf(row: PackageRow): string {
  return row.current_version.title || row.name;
}

// Official first needs no key: every official row is in the Official group.
function byTitle(a: PackageRow, b: PackageRow): number {
  return titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: "base" });
}

// The group is where the researcher's claim on a package comes from, so each applicable row goes in
// the first group it qualifies for (official, a project of the class, their own, public), and a row
// in none is not listed. The groups come back in that order, which is the order the page offers them.
// Every project of the class shares one group, and a project package's tag names its project:
// "Project: <name>" by the name any of its rows gives, else "Project <id>".
export function groupPackages(rows: PackageRow[], scope: Scope): Group[] {
  const official: PackageRow[] = [], projects: PackageRow[] = [], mine: PackageRow[] = [], community: PackageRow[] = [];
  const classProjects = new Set(scope.project_ids);

  for (const row of rows.filter((r) => r.applies)) {
    if (row.official) official.push(row);
    else if (row.visibility === "project" && row.project && classProjects.has(row.project.id)) projects.push(row);
    else if (row.mine) mine.push(row);
    else if (row.visibility === "public") community.push(row);
  }

  const names = new Map(projects.flatMap((r) => (r.project?.name ? [[r.project.id, r.project.name] as const] : [])));
  const projectName = (row: PackageRow) => {
    const name = names.get(row.project!.id);
    return name ? `Project: ${name}` : `Project ${row.project!.id}`;
  };
  const group = (key: string, heading: string, groupRows: PackageRow[], tag: (row: PackageRow) => string = () => heading): Group =>
    ({ key, heading, rows: groupRows, tag });
  const groups = [
    group("official", "Official", official),
    group("projects", "Project", projects, projectName),
    group("mine", "Personal", mine),
    group("community", "Community", community)
  ];

  return groups
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ ...g, rows: [...g.rows].sort(byTitle) }));
}
