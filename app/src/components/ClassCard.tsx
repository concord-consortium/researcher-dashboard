import { IdentificationIcon } from "@heroicons/react/16/solid";
import type { Scope } from "../shell/portal";

const names = (list: string[]) => (list.length > 0 ? list.join(", ") : "None");

// What the class is, at the top of the Info tab: its name, the portal it is on, linked, its id there, its
// teachers and cohorts, and the research projects it belongs to, by the name a package of each gives,
// else by id.
export function ClassCard({ scope, projectNames, portal }: { scope: Scope; projectNames: Map<number, string>; portal: string | null }) {
  return (
    <section className="info-card wide" aria-labelledby="class-heading">
      <h2 id="class-heading"><IdentificationIcon aria-hidden="true" />Class</h2>
      <dl className="facts">
        <div><dt>Name</dt><dd>{scope.name}</dd></div>
        {portal && <div><dt>Portal</dt><dd><a href={portal} target="_blank" rel="noopener noreferrer">{portal}</a></dd></div>}
        <div><dt>Class ID</dt><dd>{scope.id}</dd></div>
        <div><dt>Teachers</dt><dd>{names(scope.teachers.map((t) => t.name))}</dd></div>
        <div><dt>Cohorts</dt><dd>{names(scope.cohorts.map((c) => c.name))}</dd></div>
        <div><dt>Projects</dt><dd>{names(scope.project_ids.map((id) => projectNames.get(id) ?? `Project ${id}`))}</dd></div>
      </dl>
    </section>
  );
}
