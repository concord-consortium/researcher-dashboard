import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { DisplayView } from "../components/Display";
import { parseDisplay } from "../shell/display";
import { emulatorsFromEnv, inClass, paths, signIn, watchCollection, watchDoc } from "../shell/firebase";
import type { ClassRef } from "../shell/launch";
import { Portal, PortalError, type ClassInfo } from "../shell/portal";
import { describe, isBusy, isUnresponsive, type ResearcherStatus } from "../shell/status";

// The one package the spike runs. A catalog is report-service's job and a later story; the
// page asks for a package by name, version and checksum exactly as the contract says, so
// gaining a catalog changes where this comes from and nothing else.
const PACKAGE = {
  name: "class-counts",
  version: "1.0.5",
  checksum: "sha256:2855449fa8c01060f58e1f97324663bcdf00172952d5f879bb07e480cd83b8e9"
};

const STATUS_PROJECT = "report-service-dev";
const CLUE_PROJECT = "collaborative-learning-staging";

interface ResultDoc {
  id: string;
  status?: string;
  stage?: string;
  error?: string | null;
  package?: { name?: string; version?: string };
  requested_by?: string;
  requested_at?: { seconds?: number } | string | null;
  display?: unknown;
}

export function AnalyzeClass({ ref_, token }: { ref_: ClassRef; token: string }) {
  const portal = useMemo(
    () => new Portal(ref_.portalOrigin, token), [ref_.portalOrigin, token]
  );

  const [info, setInfo] = useState<ClassInfo | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [status, setStatus] = useState<ResearcherStatus | null>(null);
  const [results, setResults] = useState<ResultDoc[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [clueDocuments, setClueDocuments] = useState<number | null>(null);
  const [queued, setQueued] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Recomputed rather than stored, because "unresponsive" and "minutes left" are both
  // statements about the clock and would otherwise only change when Firestore did.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    portal.getClass(ref_.classId)
      .then((loaded) => { if (!cancelled) setInfo(loaded); })
      .catch((error: PortalError) => {
        if (cancelled) return;
        // An expired grant is the common failure and has its own answer, so it lands on the
        // info page rather than in the error line.
        if (error.unauthorized) setExpired(true);
        else setFailure(error.message);
      });
    return () => { cancelled = true; };
  }, [portal, ref_.classId]);

  // One sign-in per project, once the class is known: the class hash is what the portal
  // stamps into the token and what the rules in both projects key on.
  useEffect(() => {
    if (!info) return;
    let stop: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      const at = paths(ref_.portalOrigin);
      const statusDb = await signInTo(portal, STATUS_PROJECT, info.class_hash);
      if (cancelled) return;

      stop.push(watchDoc<ResearcherStatus>(statusDb, at.researcher(String(info.platform_user_id)), setStatus));
      stop.push(watchCollection<ResultDoc>(statusDb, at.results(info.class_hash), (docs) => {
        setResults(docs);
        setSelected((current) => current ?? docs[0]?.id ?? null);
      }));

      // RIGSE-360's live document count, read straight from CLUE rather than from the
      // class document, so it moves while students work rather than at the last pull.
      try {
        const clueDb = await signInTo(portal, CLUE_PROJECT, info.class_hash);
        if (cancelled) return;
        stop.push(watchClueDocuments(clueDb, ref_.portalOrigin, info.class_hash, setClueDocuments));
      } catch (error) {
        // A class with no CLUE data still has answers and logs worth showing, so this is a
        // missing count rather than a broken page.
        console.error("CLUE document count unavailable", error);
      }
    })();

    return () => { cancelled = true; stop.forEach((fn) => fn()); };
  }, [info, portal, ref_.portalOrigin]);

  const busy = isBusy(status);
  const unresponsive = isUnresponsive(status, now);

  const analyze = useCallback(async () => {
    if (!info) return;
    setFailure(null);
    try {
      await portal.runPackage({
        class_id: info.id,
        package: PACKAGE,
        firebase_project: STATUS_PROJECT,
        firebase_apps: [STATUS_PROJECT, CLUE_PROJECT]
      });
      setQueued(false);
    } catch (error) {
      const refusal = error as PortalError;
      // The runner accepts one package at a time and answers 409 to a second. That is a
      // wait rather than a failure, so the page queues and retries when the VM frees up.
      if (refusal.status === 409) setQueued(true);
      else if (refusal.unauthorized) setExpired(true);
      else setFailure(refusal.message);
    }
  }, [info, portal]);

  // The retry the queue promised. Fires when the VM stops being busy, once.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (queued && wasBusy.current && !busy) analyze();
    wasBusy.current = busy;
  }, [busy, queued, analyze]);

  if (expired) return <ExpiredNotice />;
  if (!info) return <main className="loading">{failure ?? "Loading the class…"}</main>;

  const chosen = results.find((r) => r.id === selected) ?? null;
  const display = chosen?.display ? parseDisplay(chosen.display) : null;

  return (
    <main className="analyze-class">
      <header>
        <h1>{info.name}</h1>
        <p className="meta">
          {info.teacher_names.join(", ")}
          {info.cohort_names.length > 0 && <> · {info.cohort_names.join(", ")}</>}
        </p>
      </header>

      <section className="session">
        <p>{describe(status, now)}</p>
        {unresponsive && (
          <p className="notice">
            Analyzing again will start a new session and run over the last data that was saved.
          </p>
        )}
        <button onClick={analyze} disabled={busy && !unresponsive}>
          {busy && !unresponsive ? "Analyzing…" : "Analyze Class"}
        </button>
        {queued && <span className="queued">Queued: this will start when the current analysis finishes.</span>}
        {failure && <p className="error">{failure}</p>}
      </section>

      <section className="counts">
        <h2>This class</h2>
        <dl>
          <dt>CLUE documents, live</dt>
          <dd>{clueDocuments ?? "—"}</dd>
          <dt>Assignments</dt>
          <dd>{info.assignments.length}</dd>
        </dl>
        <ul className="assignments">
          {info.assignments.map((assignment) => (
            <li key={assignment.id}>
              {assignment.name ?? "Untitled"}
              {assignment.platform && <span className="platform"> · {assignment.platform}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="results">
        <h2>Analyses</h2>
        {results.length === 0 && <p>No analysis has been run on this class yet.</p>}
        <ul className="result-list">
          {results.map((result) => (
            <li key={result.id}>
              <button
                className={result.id === selected ? "selected" : ""}
                onClick={() => setSelected(result.id)}
              >
                {result.package?.name ?? result.id} {result.package?.version ?? ""} · {result.status ?? "?"}
              </button>
            </li>
          ))}
        </ul>

        {chosen?.status === "failed" && chosen.error && <p className="error">{chosen.error}</p>}
        {display && <DisplayView display={display} />}
      </section>
    </main>
  );
}

function ExpiredNotice() {
  return (
    <main className="info">
      <h1>Researcher Dashboard</h1>
      <p className="notice">
        This link has expired. Launch the dashboard again from the portal to get a new one.
      </p>
    </main>
  );
}

async function signInTo(portal: Portal, project: string, classHash: string): Promise<Firestore> {
  return signIn(project, await portal.firebaseToken(project, classHash),
    emulatorsFromEnv(import.meta.env as unknown as Record<string, string | undefined>));
}

function watchClueDocuments(
  db: Firestore, portalOrigin: string, classHash: string, onCount: (n: number) => void
): () => void {
  const segment = new URL(portalOrigin).host.replace(/\./g, "_");
  // Constrained to this class in the query itself. CLUE's rules allow a researcher the
  // documents whose `context_id` matches their token's `class_hash`, and Firestore refuses
  // a listener that does not say so, however the results would be filtered afterwards.
  return watchCollection(db, `authed/${segment}/documents`,
    (docs) => onCount(docs.length), inClass(classHash));
}
