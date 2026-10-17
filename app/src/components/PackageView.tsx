import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, type ReactNode } from "react";
import { ALL_PACKAGES, routeHash } from "../shell/route";
import type { Finished } from "../shell/runs";
import { RowStatus, type StatusModel } from "./PackageList";
import { ResultActions, ResultView, ResultWhen } from "./ResultView";

// One package, opened from the list: a subheader that stays under the page header, holding the way
// back, the package's title and state, its Run and its result's Copy and Download, then the result. Each
// opening mounts it afresh, so its title takes focus.
export function PackageView({ title, status, note, run, warning, classTitle, finished, updated, filter, onAll }: {
  title: string;
  status: StatusModel;
  note: string | null;
  // Run, after the status pill, or the pill alone for a package that cannot be run from here.
  run: ReactNode;
  // The community warning, while it waits for an answer.
  warning?: ReactNode;
  classTitle: string;
  finished: Finished | null;
  updated: number | null;
  // The package's group, whose link goes back to the list filtered to it.
  filter: { label: string; onSelect: () => void } | null;
  onAll: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div className="package-view">
      <div className="package-subheader">
        <div className="package-bar">
          <div className="package-main">
            <nav aria-label="Breadcrumb" className="breadcrumb">
              <a href={routeHash(ALL_PACKAGES)} onClick={(e) => { e.preventDefault(); onAll(); }}>All Packages</a>
              <ChevronRightIcon aria-hidden="true" />
              {filter && <>
                <a href={routeHash(ALL_PACKAGES)} onClick={(e) => { e.preventDefault(); filter.onSelect(); }}>{filter.label}</a>
                <ChevronRightIcon aria-hidden="true" />
              </>}
              <h2 id="package-title" ref={heading} tabIndex={-1} aria-current="page">{title}</h2>
            </nav>
            {note && <p className="notice">{note}</p>}
            <RowStatus model={status} withFinished={false} withNotRun={false} />
          </div>
          <div className="package-side">
            {(run || finished?.display) && (
              <div className="controls">
                {run}
                {finished?.display && <ResultActions classTitle={classTitle} finished={finished} />}
              </div>
            )}
            {finished && <ResultWhen finished={finished} />}
          </div>
        </div>
        {warning}
      </div>
      {finished
        ? <ResultView finished={finished} updated={updated} />
        : <p className="no-result">No result yet.</p>}
    </div>
  );
}
