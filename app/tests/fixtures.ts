import type { PackageRow, Scope } from "../src/shell/portal";

export const SCOPE: Scope = {
  kind: "class", id: 223, name: "Wildfire, period 2", class_hash: "hash223", platform_user_id: 200,
  teachers: [{ id: 1, name: "T. Teacher" }], cohorts: [{ id: 2, name: "Spike cohort" }],
  project_ids: [20, 21], assignment_fingerprint: "v1:abc",
  assignments: [{ offering_id: 9, runnable_id: 8, name: "Wildfire", url: "https://ap.test/?activity=1", tool: "ActivityPlayer" }]
};

let next = 1;
export function row(over: Partial<PackageRow> & { title?: string }): PackageRow {
  const { title, ...rest } = over;
  const n = next++;
  return {
    catalog_id: n, identity: `users/200/p${n}`, name: `p${n}`, visibility: "private",
    official: false, mine: false, project: null, applies: true,
    current_version: { version: "1.0.0", title: title ?? `Package ${n}`, description: null },
    ...rest
  };
}
