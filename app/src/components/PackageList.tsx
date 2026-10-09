import { groupPackages, titleOf, type Group } from "../shell/packages";
import type { PackageRow, Scope } from "../shell/portal";

function Rows({ rows }: { rows: PackageRow[] }) {
  return (
    <ul className="package-rows">
      {rows.map((row) => (
        <li key={row.catalog_id}>
          <span className="title">{titleOf(row)}</span> <span className="version">{row.current_version.version}</span>
          {row.current_version.description && <p className="description">{row.current_version.description}</p>}
          <code className="identity">{row.identity}</code>
        </li>
      ))}
    </ul>
  );
}

// A heading inside <summary> is not reliably a heading to a screen reader, since summary's
// children are presentational, so the collapsed group's heading sits above its disclosure.
function GroupSection({ group }: { group: Group }) {
  const headingId = `group-${group.key}`;
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>{group.heading}</h3>
      {group.collapsed ? (
        <details className="community">
          <summary>Show {group.rows.length} community {group.rows.length === 1 ? "package" : "packages"}</summary>
          <p className="disclosure">
            These packages are not reviewed by Concord. Running one runs a stranger's code with your
            access to student data, and nothing stops it sending that data elsewhere.
          </p>
          <Rows rows={group.rows} />
        </details>
      ) : (
        <Rows rows={group.rows} />
      )}
    </section>
  );
}

export function PackageList({ rows, scope }: { rows: PackageRow[]; scope: Scope }) {
  const groups = groupPackages(rows, scope);
  if (groups.length === 0) return <p>No packages apply to this class yet.</p>;
  return <>{groups.map((group) => <GroupSection key={group.key} group={group} />)}</>;
}
